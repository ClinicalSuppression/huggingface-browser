import { describe, it, expect } from 'vitest';
import { OllamaAdapter } from '../src/adapters/ollama-adapter';

describe('Live Host Integration: Ollama Daemon', () => {
  const adapter = new OllamaAdapter('http://127.0.0.1:11434');

  it('detects live running Ollama daemon on host', async () => {
    const env = await adapter.detect();
    expect(env).not.toBeNull();
    expect(env?.runtimeId).toBe('ollama');
    expect(env?.version.major).toBeGreaterThanOrEqual(0);
    console.log(`Live detected Ollama version: ${env?.version.raw}`);
  });

  it('passes health check on port 11434', async () => {
    const health = await adapter.healthCheck();
    expect(health.isHealthy).toBe(true);
  });

  it('lists real installed models from live daemon', async () => {
    const models = await adapter.listInstalledModels();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
    console.log(`Live installed models count: ${models.length}`);
    for (const m of models) {
      console.log(` - Model: ${m.id} (${(m.sizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB)`);
    }
  });

  it('executes live verification check if models are installed', async () => {
    const models = await adapter.listInstalledModels();
    if (models.length > 0) {
      // Pick the smallest model to test fast and avoid evicting large running models
      const sorted = [...models].sort((a, b) => a.sizeBytes - b.sizeBytes);
      const targetModel = sorted[0].id;
      const result = await adapter.verifyInstall({
        planId: 'test-smoke',
        runtimeId: 'ollama',
        modelRepo: targetModel,
        revision: 'main',
        artifactFiles: [],
        totalDownloadBytes: 0,
        requiredDiskSpaceBytes: 0,
        steps: [],
        verificationConfig: {
          testEndpoint: 'http://127.0.0.1:11434',
          testModelTag: targetModel,
          testPrompt: 'Hi',
          maxTimeoutSeconds: 15,
        },
        createdAtIso: new Date().toISOString(),
      });

      console.log(`Smoke test result for ${targetModel}: passed=${result.passed}, latency=${result.latencyToFirstTokenMs}ms, tokens=${result.tokensGeneratedCount}`);
      expect(typeof result.passed).toBe('boolean');
      expect(typeof result.latencyToFirstTokenMs).toBe('number');
    }
  }, 15000);
});
