import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { detectHardware, getLiveVramUsage } from '../src/core/hardware';
import { HuggingFaceClient } from '../src/core/hf-client';
import { CredentialVault } from '../src/core/credential-vault';
import { globalAdapterRegistry } from '../src/adapters/adapter-registry';
import { getPurposePreset } from '../src/core/presets';
import { LocalDatabase } from '../src/core/db';
import { CacheScanner } from '../src/core/cache-scanner';
import { InstallPlan, PresetIntent, RuntimeId } from '../src/types';

let mainWindow: BrowserWindow | null = null;
const activeAbortControllers: Map<string, AbortController> = new Map();

async function createWindow() {
  await LocalDatabase.init();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    frame: true,
    titleBarStyle: 'default',
    title: 'HF Browser',
    backgroundColor: '#0f172a', // Deep dark slate background
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  if (process.env.SMOKE_TEST === '1') {
    mainWindow.webContents.once('did-finish-load', () => {
      console.log('[MAIN_SMOKE] HTML and preload loaded cleanly in BrowserWindow!');
      setTimeout(() => {
        app.quit();
      }, 1000);
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle('hardware:getProfile', async () => {
  return detectHardware();
});

ipcMain.handle('hardware:getLiveVramUsage', async (_event, gpuIndex?: number) => {
  return getLiveVramUsage(gpuIndex || 0);
});

ipcMain.handle('hf:search', async (_event, query: string, options: any) => {
  const token = await CredentialVault.getHfToken();
  return HuggingFaceClient.searchModels({
    search: query,
    token: token || undefined,
    ...options,
  });
});

ipcMain.handle('hf:getModelDetails', async (_event, modelId: string) => {
  const token = await CredentialVault.getHfToken();
  return HuggingFaceClient.getModelDetails(modelId, token || undefined);
});

ipcMain.handle('hf:resolveArtifacts', async (_event, model: any) => {
  return HuggingFaceClient.resolveArtifacts(model);
});

ipcMain.handle('hf:getModelReadme', async (_event, modelId: string) => {
  const token = await CredentialVault.getHfToken();
  return HuggingFaceClient.getModelReadme(modelId, token || undefined);
});

ipcMain.handle('hf:getGenerationConfig', async (_event, modelId: string) => {
  const token = await CredentialVault.getHfToken();
  return HuggingFaceClient.getModelGenerationConfig(modelId, token || undefined);
});

ipcMain.handle('cache:scanLocalModels', async () => {
  return CacheScanner.scanLocalModels();
});

ipcMain.handle('vault:saveToken', async (_event, token: string, accountName?: string) => {
  return CredentialVault.saveHfToken(token, accountName);
});

ipcMain.handle('vault:getToken', async (_event, accountName?: string) => {
  return CredentialVault.getHfToken(accountName);
});

ipcMain.handle('vault:removeToken', async (_event, accountName?: string) => {
  return CredentialVault.removeHfToken(accountName);
});

ipcMain.handle('vault:validateToken', async (_event, token: string) => {
  return CredentialVault.validateHfToken(token);
});

ipcMain.handle('runtimes:detectAll', async () => {
  const results = await globalAdapterRegistry.detectAll();
  return results.map(r => ({
    runtimeId: r.adapter.id,
    displayName: r.adapter.displayName,
    isHealthy: !!r.env,
    endpointUrl: r.env?.endpointUrl || 'Not detected',
    version: r.env?.version?.raw,
  }));
});

ipcMain.handle('runtimes:listModels', async (_event, runtimeId?: RuntimeId) => {
  if (runtimeId) {
    const adapter = globalAdapterRegistry.getAdapter(runtimeId);
    if (!adapter) return [];
    const models = await adapter.listInstalledModels();
    return models.map(m => ({
      runtimeId,
      id: m.id,
      sizeBytes: m.sizeBytes,
      modifiedAtIso: m.modifiedAtIso,
    }));
  }
  return globalAdapterRegistry.listAllInstalledModels();
});

ipcMain.handle('runtimes:evaluateCompatibility', async (_event, runtimeId: RuntimeId, artifacts: any, hw: any) => {
  const adapter = globalAdapterRegistry.getAdapter(runtimeId);
  if (!adapter) throw new Error(`Unknown runtime adapter: ${runtimeId}`);
  return adapter.evaluateCompatibility(artifacts, hw);
});

ipcMain.handle('install:createPlan', async (_event, runtimeId: RuntimeId, artifacts: any, hw: any, options: any) => {
  const adapter = globalAdapterRegistry.getAdapter(runtimeId);
  if (!adapter) throw new Error(`Unknown runtime adapter: ${runtimeId}`);
  return adapter.createInstallPlan(artifacts, hw, options);
});

ipcMain.handle('install:start', async (_event, plan: InstallPlan) => {
  const adapter = globalAdapterRegistry.getAdapter(plan.runtimeId);
  if (!adapter) throw new Error(`Unknown runtime adapter: ${plan.runtimeId}`);

  const abortController = new AbortController();
  activeAbortControllers.set(plan.planId, abortController);

  LocalDatabase.upsertJob({
    job_id: plan.planId,
    model_repo: plan.modelRepo,
    revision: plan.revision,
    runtime_id: plan.runtimeId,
    target_tag: plan.verificationConfig.testModelTag,
    status: 'downloading',
    progress_percent: 0,
    bytes_downloaded: 0,
    bytes_total: plan.totalDownloadBytes,
    install_plan_json: JSON.stringify(plan),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  try {
    const success = await adapter.executeInstall(
      plan,
      (progress) => {
        if (mainWindow) {
          mainWindow.webContents.send('install:progress', progress);
        }
        LocalDatabase.upsertJob({
          job_id: plan.planId,
          model_repo: plan.modelRepo,
          revision: plan.revision,
          runtime_id: plan.runtimeId,
          target_tag: plan.verificationConfig.testModelTag,
          status: 'downloading',
          progress_percent: progress.percentComplete,
          bytes_downloaded: progress.bytesDownloaded,
          bytes_total: progress.bytesTotal,
          install_plan_json: JSON.stringify(plan),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      },
      abortController.signal
    );

    LocalDatabase.upsertJob({
      job_id: plan.planId,
      model_repo: plan.modelRepo,
      revision: plan.revision,
      runtime_id: plan.runtimeId,
      target_tag: plan.verificationConfig.testModelTag,
      status: success ? 'completed' : 'failed',
      progress_percent: 100,
      bytes_downloaded: plan.totalDownloadBytes,
      bytes_total: plan.totalDownloadBytes,
      install_plan_json: JSON.stringify(plan),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return { success };
  } catch (err: any) {
    LocalDatabase.upsertJob({
      job_id: plan.planId,
      model_repo: plan.modelRepo,
      revision: plan.revision,
      runtime_id: plan.runtimeId,
      target_tag: plan.verificationConfig.testModelTag,
      status: 'failed',
      progress_percent: 0,
      bytes_downloaded: 0,
      bytes_total: plan.totalDownloadBytes,
      install_plan_json: JSON.stringify(plan),
      error_message: err.message,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return { success: false, error: err.message };
  } finally {
    activeAbortControllers.delete(plan.planId);
  }
});

ipcMain.handle('install:cancel', async (_event, planId: string) => {
  const controller = activeAbortControllers.get(planId);
  if (controller) {
    controller.abort();
    activeAbortControllers.delete(planId);
    return true;
  }
  return false;
});

ipcMain.handle('verify:runSmokeTest', async (_event, runtimeId: RuntimeId, modelTag: string) => {
  const adapter = globalAdapterRegistry.getAdapter(runtimeId);
  if (!adapter) throw new Error(`Unknown runtime adapter: ${runtimeId}`);

  // Create a minimal fake plan for verification
  const plan: InstallPlan = {
    planId: `smoke-${Date.now()}`,
    runtimeId,
    modelRepo: modelTag,
    revision: 'main',
    artifactFiles: [],
    totalDownloadBytes: 0,
    requiredDiskSpaceBytes: 0,
    steps: [],
    verificationConfig: {
      testEndpoint: 'default',
      testModelTag: modelTag,
      testPrompt: 'Hello, what is 2+2? Answer in one word.',
      maxTimeoutSeconds: 30,
    },
    createdAtIso: new Date().toISOString(),
  };

  return adapter.verifyInstall(plan);
});

ipcMain.handle('presets:get', async (_event, intent: PresetIntent) => {
  return getPurposePreset(intent);
});

ipcMain.handle('jobs:list', async () => {
  return LocalDatabase.getJobs();
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
