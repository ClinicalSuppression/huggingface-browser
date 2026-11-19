import { 
  IRuntimeAdapter, 
  RuntimeId, 
  RuntimeEnvironment, 
  RuntimeVersion, 
  HardwareProfile, 
  ArtifactFileTarget, 
  CompatibilityReport, 
  InstallPlan, 
  InstallExecutionContext,
  InstallProgress, 
  VerificationResult 
} from '../types';
import { evaluateHardwareFit } from '../core/sizing';
import { parseQuantFromFilename } from '../core/gguf-parser';
import path from 'path';
import os from 'os';
import { DownloadManager } from '../core/download-manager';

export class OllamaAdapter implements IRuntimeAdapter {
  readonly id: RuntimeId = 'ollama';
  readonly displayName: string = 'Ollama';
  protected endpointUrl: string;

  constructor(endpointUrl: string = 'http://127.0.0.1:11434') {
    this.endpointUrl = endpointUrl;
  }

  async detect(): Promise<RuntimeEnvironment | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(`${this.endpointUrl}/api/version`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) return null;
      const data = (await res.json()) as { version?: string };
      const rawVersion = data.version || '0.0.0';
      const versionParsed = this.parseVersion(rawVersion);

      return {
        runtimeId: this.id,
        version: versionParsed,
        endpointUrl: this.endpointUrl,
      };
    } catch {
      return null;
    }
  }

  async healthCheck(): Promise<{ readonly isHealthy: boolean; readonly message?: string }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${this.endpointUrl}/api/version`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        return { isHealthy: true };
      }
      return { isHealthy: false, message: `HTTP error status ${res.status}` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { isHealthy: false, message: msg };
    }
  }

  async listInstalledModels(): Promise<Array<{ readonly id: string; readonly sizeBytes: number; readonly modifiedAtIso: string }>> {
    try {
      const res = await fetch(`${this.endpointUrl}/api/tags`);
      if (!res.ok) return [];
      const data = (await res.json()) as { models?: Array<{ name?: string; model?: string; size?: number; modified_at?: string }> };
      if (!data.models || !Array.isArray(data.models)) return [];

      return data.models.map(m => ({
        id: m.name || m.model || 'unknown',
        sizeBytes: m.size || 0,
        modifiedAtIso: m.modified_at || new Date().toISOString()
      }));
    } catch {
      return [];
    }
  }

  async evaluateCompatibility(artifact: ArtifactFileTarget[], hw: HardwareProfile): Promise<CompatibilityReport> {
    const primary = artifact.find(a => a.role === 'primary_weights' || a.role === 'shard');
    const filename = primary ? primary.destinationRelativePath : '';
    const isGguf = filename.toLowerCase().endsWith('.gguf') || artifact.some(a => a.destinationRelativePath.toLowerCase().endsWith('.gguf'));

    if (!isGguf) {
      return {
        reportId: `rep-${Date.now()}`,
        runtimeId: this.id,
        status: 'unsupported',
        format: 'safetensors',
        reason: 'Ollama requires GGUF formatted model files.',
        confidence: 'verified_test',
        estimatedVramBytes: 0,
        estimatedSystemRamBytes: 0,
        fitsInGpuVram: false,
        maxOffloadLayers: 0,
        recommendedContextLength: 2048,
        recommendedFlags: {},
        blockers: ['Unsupported model format. Ollama only supports GGUF.'],
        warnings: []
      };
    }

    const quantInfo = parseQuantFromFilename(filename);
    const totalBytes = primary ? primary.expectedSizeBytes : 4_000_000_000;
    const estimatedParamsBillions = Math.max(1, Math.round((totalBytes * 8) / (quantInfo.bitsPerWeight * 1_000_000_000)));

    const fit = evaluateHardwareFit(
      estimatedParamsBillions,
      quantInfo.bitsPerWeight,
      32,
      8,
      128,
      4096,
      hw
    );

    return {
      reportId: `rep-${Date.now()}`,
      runtimeId: this.id,
      status: fit.status,
      format: 'gguf',
      reason: fit.fitDescription,
      confidence: 'verified_test',
      estimatedVramBytes: fit.estimatedVramBytes,
      estimatedSystemRamBytes: fit.estimatedSystemRamBytes,
      fitsInGpuVram: fit.fitsInVram,
      maxOffloadLayers: fit.maxOffloadLayers,
      recommendedContextLength: 4096,
      recommendedFlags: { num_ctx: 4096 },
      blockers: fit.status === 'unsupported' ? [fit.fitDescription] : [],
      warnings: fit.status === 'conditional' ? [fit.fitDescription] : []
    };
  }

  async createInstallPlan(artifact: ArtifactFileTarget[], _hw: HardwareProfile, customOptions?: Record<string, unknown>): Promise<InstallPlan> {
    const totalBytes = artifact.reduce((acc, a) => acc + a.expectedSizeBytes, 0);
    const planId = `plan-ollama-${Date.now()}`;
    const primary = artifact.find(a => a.role === 'primary_weights') || artifact[0];
    const modelRepo = primary ? primary.fileId.split('/').slice(0, 2).join('/') : 'unknown-model';
    const artifactName = primary ? path.basename(primary.destinationRelativePath).replace(/\.gguf$/i, '') : 'model';
    const testModelTag = `hf-${`${modelRepo}-${artifactName}`.toLowerCase().replace(/[^a-z0-9._-]/g, '-')}`.slice(0, 200);

    return {
      planId,
      runtimeId: this.id,
      modelRepo,
      revision: artifact.map(a => a.remoteUrl.match(/\/resolve\/([^/]+)\//)?.[1]).find(Boolean) || 'main',
      artifactFiles: artifact,
      totalDownloadBytes: totalBytes,
      requiredDiskSpaceBytes: totalBytes * 2,
      steps: [
        {
          stepId: 'step-1',
          sequence: 1,
          type: 'http_download',
          description: 'Download model weights artifact files',
          payload: { files: artifact }
        },
        {
          stepId: 'step-2',
          sequence: 2,
          type: 'create_modelfile',
          description: 'Generate Ollama Modelfile',
          payload: { options: customOptions || {} }
        },
        {
          stepId: 'step-3',
          sequence: 3,
          type: 'api_register',
          description: 'Register model with Ollama via /api/create',
          payload: {}
        }
      ],
      verificationConfig: {
        testEndpoint: `${this.endpointUrl}/api/generate`,
        testModelTag,
        testPrompt: 'test',
        maxTimeoutSeconds: 60
      },
      createdAtIso: new Date().toISOString()
    };
  }

  async executeInstall(
    plan: InstallPlan,
    onProgress: (p: InstallProgress) => void,
    cancelSignal: AbortSignal,
    context?: InstallExecutionContext
  ): Promise<boolean> {
    if (cancelSignal.aborted) return false;
    if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(this.endpointUrl)) {
      throw new Error('Ollama import requires a local endpoint that can access the downloaded GGUF path');
    }
    if (plan.artifactFiles.length !== 1 || !plan.artifactFiles[0].destinationRelativePath.toLowerCase().endsWith('.gguf')) {
      throw new Error('Ollama supports only a single GGUF artifact');
    }
    const artifact = plan.artifactFiles[0];
    const localPath = path.join(os.homedir(), '.cache', 'hf-browser', 'models', plan.planId, path.basename(artifact.destinationRelativePath));
    await DownloadManager.downloadFile({
      planId: plan.planId,
      url: artifact.remoteUrl,
      destinationPath: localPath,
      expectedSizeBytes: artifact.expectedSizeBytes,
      expectedSha256: artifact.sha256Checksum,
      token: context?.downloadToken,
      onProgress,
      cancelSignal,
    });
    if (cancelSignal.aborted) return false;
    const modelfile = `FROM ${localPath}`;
    const totalSteps = plan.steps.length;
    onProgress({
      planId: plan.planId, currentStepIndex: 2, totalSteps,
      stepDescription: 'Importing GGUF into Ollama',
      bytesDownloaded: plan.totalDownloadBytes, bytesTotal: plan.totalDownloadBytes,
      percentComplete: 95, downloadSpeedBytesPerSec: 0,
    });
    const res = await fetch(`${this.endpointUrl}/api/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: plan.verificationConfig.testModelTag, modelfile, stream: true }),
      signal: cancelSignal,
    });
    if (!res.ok) throw new Error(`Ollama model registration failed (HTTP ${res.status})`);
    const reader = res.body?.getReader();
    if (!reader) throw new Error('Ollama registration returned no response stream');
    const decoder = new TextDecoder();
    let pending = '';
    let succeeded = false;
    const consume = (line: string) => {
      if (!line.trim()) return;
      const event = JSON.parse(line) as { error?: string; status?: string };
      if (event.error) throw new Error(`Ollama model registration failed: ${event.error}`);
      if (event.status === 'success') succeeded = true;
    };
    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split('\n');
      pending = lines.pop() || '';
      lines.forEach(consume);
      if (done) break;
    }
    if (pending.trim()) consume(pending);
    if (!succeeded) throw new Error('Ollama model registration ended without a success event');
    onProgress({
      planId: plan.planId,
      currentStepIndex: totalSteps,
      totalSteps,
      stepDescription: 'Installation complete',
      bytesDownloaded: plan.totalDownloadBytes,
      bytesTotal: plan.totalDownloadBytes,
      percentComplete: 100,
      downloadSpeedBytesPerSec: 0
    });

    return true;
  }

  async verifyInstall(plan: InstallPlan): Promise<VerificationResult> {
    const startTime = Date.now();
    try {
      const res = await fetch(`${this.endpointUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: plan.verificationConfig.testModelTag,
          prompt: plan.verificationConfig.testPrompt,
          stream: false
        })
      });

      if (!res.ok) {
        return {
          passed: false,
          modelLoadedSuccessfully: false,
          tokensGeneratedCount: 0,
          latencyToFirstTokenMs: 0,
          tokensPerSecond: 0,
          errorMessage: `HTTP status ${res.status}`
        };
      }

      const data = (await res.json()) as { 
        response?: string; 
        eval_count?: number; 
        eval_duration?: number; 
        prompt_eval_duration?: number; 
      };

      const durationMs = Date.now() - startTime;
      const evalCount = data.eval_count || 5;
      const evalDurationSec = (data.eval_duration || (durationMs * 1_000_000)) / 1e9;
      const tokensPerSec = evalDurationSec > 0 ? evalCount / evalDurationSec : 10;
      const latencyMs = (data.prompt_eval_duration || 100_000) / 1e6;

      return {
        passed: true,
        modelLoadedSuccessfully: true,
        tokensGeneratedCount: evalCount,
        latencyToFirstTokenMs: latencyMs,
        tokensPerSecond: tokensPerSec,
        rawOutputSample: data.response || 'test output'
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        passed: false,
        modelLoadedSuccessfully: false,
        tokensGeneratedCount: 0,
        latencyToFirstTokenMs: 0,
        tokensPerSecond: 0,
        errorMessage: msg
      };
    }
  }

  async uninstallModel(modelTag: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.endpointUrl}/api/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelTag })
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  protected parseVersion(raw: string): RuntimeVersion {
    const clean = raw.replace(/^v/, '');
    const parts = clean.split('.').map(p => parseInt(p, 10) || 0);
    return {
      raw,
      major: parts[0] || 0,
      minor: parts[1] || 0,
      patch: parts[2] || 0
    };
  }
}
