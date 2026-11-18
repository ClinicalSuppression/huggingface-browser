import { describe, it, expect } from 'vitest';
import { OllamaAdapter } from '../src/adapters/ollama-adapter';
import { LlamaCppAdapter } from '../src/adapters/llamacpp-adapter';
import { XollamaAdapter } from '../src/adapters/xollama-adapter';
import { VllmAdapter } from '../src/adapters/vllm-adapter';
import { AdapterRegistry } from '../src/adapters/adapter-registry';
import { HardwareProfile, ArtifactFileTarget } from '../src/types';

describe('Universal Runtime Adapters', () => {
  const mockHw: HardwareProfile = {
    gpus: [{
      id: 'gpu-0',
      name: 'AMD Radeon RX 7800 XT',
      vendor: 'amd',
      vramTotalBytes: 16 * 1024 * 1024 * 1024,
      vramFreeBytes: 14 * 1024 * 1024 * 1024,
      driverVersion: '32.0',
    }],
    systemRamTotalBytes: 64 * 1024 * 1024 * 1024,
    systemRamAvailableBytes: 32 * 1024 * 1024 * 1024,
    cpuArchitecture: 'x86_64',
    cpuLogicalCores: 16,
    supportsAvx2: true,
    supportsAvx512: false,
    capturedAtIso: new Date().toISOString(),
  };

  const sampleGgufArtifacts: ArtifactFileTarget[] = [{
    fileId: 'f1',
    remoteUrl: 'https://huggingface.co/sample/model.gguf',
    destinationRelativePath: 'model.Q4_K_M.gguf',
    expectedSizeBytes: 4 * 1024 * 1024 * 1024,
    role: 'primary_weights',
  }];

  const sampleSafetensorsArtifacts: ArtifactFileTarget[] = [{
    fileId: 'f2',
    remoteUrl: 'https://huggingface.co/sample/model.safetensors',
    destinationRelativePath: 'model.safetensors',
    expectedSizeBytes: 8 * 1024 * 1024 * 1024,
    role: 'primary_weights',
  }];

  it('Ollama rejects non-GGUF files and evaluates GGUF successfully', async () => {
    const adapter = new OllamaAdapter();
    const badReport = await adapter.evaluateCompatibility(sampleSafetensorsArtifacts, mockHw);
    expect(badReport.status).toBe('unsupported');

    const goodReport = await adapter.evaluateCompatibility(sampleGgufArtifacts, mockHw);
    expect(goodReport.status).toBe('supported');
    expect(goodReport.format).toBe('gguf');
  });

  it('llama.cpp evaluates GGUF and creates install plan with appropriate CLI flags', async () => {
    const adapter = new LlamaCppAdapter();
    const report = await adapter.evaluateCompatibility(sampleGgufArtifacts, mockHw);
    expect(report.format).toBe('gguf');

    const plan = await adapter.createInstallPlan(sampleGgufArtifacts, mockHw);
    expect(plan.runtimeId).toBe('llamacpp');
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it('xollama supports think-budget options in install plan', async () => {
    const adapter = new XollamaAdapter();
    const plan = await adapter.createInstallPlan(sampleGgufArtifacts, mockHw, { thinkBudget: 8192 });
    expect(plan.runtimeId).toBe('xollama');
  });

  it('vLLM evaluates SafeTensors and AWQ formats', async () => {
    const adapter = new VllmAdapter();
    const report = await adapter.evaluateCompatibility(sampleSafetensorsArtifacts, mockHw);
    expect(report.status).toBe('supported');
    expect(report.format).toBe('safetensors');
  });

  it('AdapterRegistry aggregates all 4 runtimes and allows querying', () => {
    const registry = new AdapterRegistry();
    const adapters = registry.listAdapters();
    expect(adapters).toHaveLength(4);
    expect(registry.getAdapter('ollama')).toBeDefined();
    expect(registry.getAdapter('llamacpp')).toBeDefined();
    expect(registry.getAdapter('xollama')).toBeDefined();
    expect(registry.getAdapter('vllm')).toBeDefined();
  });
});
