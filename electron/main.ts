import { app, BrowserWindow, crashReporter, ipcMain, shell } from 'electron';
import { randomUUID } from 'crypto';
import path from 'path';
import { validateInstallPath } from './install-path';
import { createJobProgressThrottle } from './job-progress-throttle';
import { guardedHandler, packagedAppUrl, safeExternalUrl, isAllowedHubUrl } from './ipc-security';
import { detectHardware, getLiveVramUsage } from '../src/core/hardware';
import { HuggingFaceClient } from '../src/core/hf-client';
import { CredentialVault } from '../src/core/credential-vault';
import { globalAdapterRegistry } from '../src/adapters/adapter-registry';
import { getPurposePreset } from '../src/core/presets';
import { LocalDatabase } from '../src/core/db';
import { CacheScanner } from '../src/core/cache-scanner';
import { InstallPlan, InstallPlanId, PresetIntent, RuntimeId } from '../src/types';

let mainWindow: BrowserWindow | null = null;
const allowedAppUrl = process.env.VITE_DEV_SERVER_URL
  ? new URL(process.env.VITE_DEV_SERVER_URL).href
  : packagedAppUrl(path.join(__dirname, '../../dist/index.html'));
const guardedHandle = (channel: string, handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any): void =>
  ipcMain.handle(channel, guardedHandler(() => mainWindow?.webContents, allowedAppUrl, handler));
const activeAbortControllers: Map<string, AbortController> = new Map();
const installPlans = new Map<InstallPlanId, InstallPlan>();
const settledPlans = new Set<InstallPlanId>();

async function createWindow() {
  await LocalDatabase.init();
  LocalDatabase.failInterruptedJobs();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    frame: true,
    titleBarStyle: 'default',
    title: 'HF Browser',
    backgroundColor: '#0f172a', // Deep dark slate background
    icon: path.join(__dirname, '../../assets/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  const win = mainWindow;
  win.webContents.on('will-navigate', (event, url) => { if (url !== allowedAppUrl) event.preventDefault(); });
  win.webContents.on('will-redirect', (event, url) => { if (url !== allowedAppUrl) event.preventDefault(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-attach-webview', (event, preferences, params) => {
    if (!isAllowedHubUrl(params.src)) { event.preventDefault(); return; }
    delete preferences.preload;
    delete (params as any).allowpopups;
    Object.assign(preferences, { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true });
  });
  win.webContents.on('did-attach-webview', (_event, webContents) => {
    webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    webContents.on('will-navigate', (event, url) => {
      if (!isAllowedHubUrl(url)) event.preventDefault();
    });
    webContents.on('will-redirect', (event, url) => {
      if (!isAllowedHubUrl(url)) event.preventDefault();
    });
  });
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
guardedHandle('hardware:getProfile', async () => {
  return detectHardware();
});

guardedHandle('hardware:getLiveVramUsage', async (_event, gpuIndex?: number) => {
  return getLiveVramUsage(gpuIndex || 0);
});

guardedHandle('hf:search', async (_event, query: string, options: any) => {
  const token = await CredentialVault.getHfToken();
  return HuggingFaceClient.searchModels({
    search: query,
    token: token || undefined,
    ...options,
  });
});

guardedHandle('hf:getModelDetails', async (_event, modelId: string) => {
  const token = await CredentialVault.getHfToken();
  return HuggingFaceClient.getModelDetails(modelId, token || undefined);
});

guardedHandle('hf:resolveArtifacts', async (_event, model: any) => {
  return HuggingFaceClient.resolveArtifacts(model);
});

guardedHandle('hf:getModelReadme', async (_event, modelId: string) => {
  const token = await CredentialVault.getHfToken();
  return HuggingFaceClient.getModelReadme(modelId, token || undefined);
});

guardedHandle('hf:getGenerationConfig', async (_event, modelId: string) => {
  const token = await CredentialVault.getHfToken();
  return HuggingFaceClient.getModelGenerationConfig(modelId, token || undefined);
});

guardedHandle('cache:scanLocalModels', async () => {
  return CacheScanner.scanLocalModels();
});

guardedHandle('vault:saveToken', async (_event, token: string, accountName?: string) => {
  if (typeof token !== 'string' || token.length === 0 || token.length > 4096) {
    throw new Error('Hugging Face token must be a non-empty string no longer than 4096 characters');
  }
  return CredentialVault.saveHfToken(token, accountName);
});

guardedHandle('vault:hasToken', async (_event, accountName?: string) => {
  return CredentialVault.hasHfToken(accountName);
});

guardedHandle('vault:removeToken', async (_event, accountName?: string) => {
  return CredentialVault.removeHfToken(accountName);
});

guardedHandle('vault:validateToken', async (_event, token: string) => {
  if (typeof token !== 'string' || token.length === 0 || token.length > 4096) {
    return { valid: false, error: 'Hugging Face token must be a non-empty string no longer than 4096 characters' };
  }
  return CredentialVault.validateHfToken(token);
});

guardedHandle('runtimes:detectAll', async () => {
  const results = await globalAdapterRegistry.detectAll();
  return results.map(r => ({
    runtimeId: r.adapter.id,
    displayName: r.adapter.displayName,
    isHealthy: !!r.env,
    endpointUrl: r.env?.endpointUrl || 'Not detected',
    version: r.env?.version?.raw,
  }));
});

guardedHandle('runtimes:listModels', async (_event, runtimeId?: RuntimeId) => {
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

guardedHandle('runtimes:evaluateCompatibility', async (_event, runtimeId: RuntimeId, artifacts: any, hw: any) => {
  const adapter = globalAdapterRegistry.getAdapter(runtimeId);
  if (!adapter) throw new Error(`Unknown runtime adapter: ${runtimeId}`);
  return adapter.evaluateCompatibility(artifacts, hw);
});

guardedHandle('install:createPlan', async (_event, runtimeId: RuntimeId, modelId: string, selectedFilename: string | undefined, options: any, storagePath: unknown) => {
  if (runtimeId !== 'ollama') throw new Error(`Install is not supported for runtime: ${runtimeId}`);
  if (typeof modelId !== 'string' || !/^[^/]+\/[^/]+$/.test(modelId)) throw new Error('Invalid Hugging Face model ID');
  const adapter = globalAdapterRegistry.getAdapter(runtimeId);
  if (!adapter) throw new Error(`Unknown runtime adapter: ${runtimeId}`);
  const token = await CredentialVault.getHfToken();
  const model = await HuggingFaceClient.getModelDetails(modelId, token || undefined);
  const artifacts = HuggingFaceClient.resolveArtifactTargets(model, selectedFilename);
  const modelStorageRoot = validateInstallPath(storagePath);
  const proposedPlan = await adapter.createInstallPlan(artifacts, await detectHardware(), options);
  const plan: InstallPlan = { ...proposedPlan, planId: randomUUID(), modelStorageRoot };
  if (plan.runtimeId !== 'ollama' || typeof plan.planId !== 'string' || !plan.planId ||
      typeof plan.modelRepo !== 'string' || !plan.modelRepo || typeof plan.revision !== 'string' ||
      !Array.isArray(plan.artifactFiles) || !Array.isArray(plan.steps) ||
      !Number.isFinite(plan.totalDownloadBytes) || plan.totalDownloadBytes < 0 ||
      !plan.verificationConfig || typeof plan.verificationConfig.testModelTag !== 'string' ||
      installPlans.has(plan.planId)) throw new Error('Invalid or duplicate install plan');
  installPlans.set(plan.planId, plan);
  return plan;
});

guardedHandle('install:start', async (_event, planId: InstallPlanId) => {
  if (typeof planId !== 'string' || !installPlans.has(planId)) throw new Error('Unknown install plan');
  if (activeAbortControllers.has(planId) || settledPlans.has(planId)) throw new Error('Install plan is already running or settled');
  const plan = installPlans.get(planId)!;
  if (plan.runtimeId !== 'ollama') throw new Error(`Install is not supported for runtime: ${plan.runtimeId}`);
  const adapter = globalAdapterRegistry.getAdapter(plan.runtimeId);
  if (!adapter) throw new Error(`Unknown runtime adapter: ${plan.runtimeId}`);

  const abortController = new AbortController();
  activeAbortControllers.set(plan.planId, abortController);
  const createdAt = new Date().toISOString();
  let lastProgress = { percent: 0, downloaded: 0, total: plan.totalDownloadBytes };
  let terminalAttempted = false;
  const writeJob = (status: 'downloading' | 'completed' | 'failed' | 'cancelled', progress: number, downloaded: number, error?: string) =>
    LocalDatabase.upsertJob({
      job_id: plan.planId, model_repo: plan.modelRepo, revision: plan.revision,
      runtime_id: plan.runtimeId, target_tag: plan.verificationConfig.testModelTag,
      status, progress_percent: progress, bytes_downloaded: downloaded,
      bytes_total: plan.totalDownloadBytes, install_plan_json: JSON.stringify(plan),
      ...(error ? { error_message: error } : {}),
      created_at: createdAt, updated_at: new Date().toISOString(),
    });
  const progressWriter = createJobProgressThrottle(
    ({ percent, downloaded }) => writeJob('downloading', percent, downloaded)
  );
  try {
    LocalDatabase.upsertRuntime({
      runtime_id: 'ollama', display_name: adapter.displayName,
      endpoint_url: 'http://127.0.0.1:11434', is_active: 1, is_healthy: 0,
    });
    writeJob('downloading', 0, 0);

    const downloadToken = await CredentialVault.getHfToken();
    const success = await adapter.executeInstall(
      plan,
      (progress) => {
        lastProgress = { percent: progress.percentComplete, downloaded: progress.bytesDownloaded, total: progress.bytesTotal };
        if (mainWindow) {
          mainWindow.webContents.send('install:progress', { ...progress, planId: plan.planId });
        }
        progressWriter.update({ percent: progress.percentComplete, downloaded: progress.bytesDownloaded });
      },
      abortController.signal,
      { downloadToken: downloadToken || undefined }
    );

    const status = success ? 'completed' : abortController.signal.aborted ? 'cancelled' : 'failed';
    terminalAttempted = true;
    settledPlans.add(plan.planId);
    progressWriter.clear();
    writeJob(status, success ? 100 : lastProgress.percent, success ? plan.totalDownloadBytes : lastProgress.downloaded,
      success ? undefined : abortController.signal.aborted ? 'Installation cancelled' : 'Installation failed');
    return { success, ...(!success ? { error: abortController.signal.aborted ? 'Installation cancelled' : 'Installation failed' } : {}) };
  } catch (err: any) {
    if (!terminalAttempted) {
      terminalAttempted = true;
      settledPlans.add(plan.planId);
      progressWriter.clear();
      try {
        writeJob(abortController.signal.aborted ? 'cancelled' : 'failed', lastProgress.percent, lastProgress.downloaded,
          String(err?.message || err));
      } catch (persistError: any) {
        return { success: false, error: `Install failed and terminal state could not be persisted: ${persistError?.message || persistError}` };
      }
    } else {
      return { success: false, error: `Install completed but terminal state could not be persisted: ${err?.message || err}` };
    }
    return { success: false, error: String(err?.message || err) };
  } finally {
    activeAbortControllers.delete(plan.planId);
    installPlans.delete(plan.planId);
  }
});

guardedHandle('install:cancel', async (_event, planId: string) => {
  const controller = activeAbortControllers.get(planId);
  if (controller) {
    controller.abort();
    return true;
  }
  return false;
});

guardedHandle('verify:runSmokeTest', async (_event, runtimeId: RuntimeId, modelTag: string) => {
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

guardedHandle('presets:get', async (_event, intent: PresetIntent) => {
  return getPurposePreset(intent);
});

guardedHandle('browser:openExternal', async (_event, url: string) => {
  const safeUrl = safeExternalUrl(url);
  if (safeUrl) {
    await shell.openExternal(safeUrl);
    return true;
  }
  return false;
});

guardedHandle('jobs:list', async () => {
  return LocalDatabase.getJobs();
});

// Configure local offline Crashpad handler and suppress registration warnings
crashReporter.start({
  submitURL: '',
  uploadToServer: false,
});
app.commandLine.appendSwitch('disable-crash-reporter');
app.commandLine.appendSwitch('disable-features', 'Crashpad');

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(createWindow);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
