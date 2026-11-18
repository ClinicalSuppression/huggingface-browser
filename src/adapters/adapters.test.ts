import { describe, it, expect } from 'vitest';
import { AdapterRegistry } from './adapter-registry';
import { OllamaAdapter } from './ollama-adapter';
import { LlamaCppAdapter } from './llamacpp-adapter';
import { XollamaAdapter } from './xollama-adapter';
import { VllmAdapter } from './vllm-adapter';
import { HardwareProfile, ArtifactFileTarget } from '../types';

const mockHw: HardwareProfile = {
  gpus: [
    {
      id: 'gpu-0',
      name: 'NVIDIA RTX 4090',
      vendor: 'nvidia',
      vramTotalBytes: 24_000_000_000,
      vramFreeBytes: 22_000_000_000,
      driverVersion: '535.00'
    }
  ],
  systemRamTotalBytes: 64_000_000_000,
  systemRamAvailableBytes: 48_000_000_000,
  cpuArchitecture: 'x86_64',
  cpuLogicalCores: 16,
  supportsAvx2: true,
  supportsAvx512: false,
  capturedAtIso: new Date().toISOString()
};

const mockArtifacts: ArtifactFileTarget[] = [
  {
    fileId: 'meta-llama/Llama-3.1-8B-Instruct/llama-3.1-8b-instruct-q4_k_m.gguf',
    remoteUrl: 'https://huggingface.co/...',
    destinationRelativePath: 'llama-3.1-8b-instruct-q4_k_m.gguf',
    expectedSizeBytes: 4_900_000_000,
    role: 'primary_weights'
  }
];

describe('Universal Runtime Adapters', () => {
  it('AdapterRegistry manages all adapters correctly', () => {
    const registry = new AdapterRegistry();
    expect(registry.getAdapter('ollama')).toBeInstanceOf(OllamaAdapter);
    expect(registry.getAdapter('llamacpp')).toBeInstanceOf(LlamaCppAdapter);
    expect(registry.getAdapter('xollama')).toBeInstanceOf(XollamaAdapter);
    expect(registry.getAdapter('vllm')).toBeInstanceOf(VllmAdapter);
    expect(registry.listAdapters().length).toBe(4);
  });

  it('OllamaAdapter evaluates compatibility and creates install plan', async () => {
    const adapter = new OllamaAdapter();
    const report = await adapter.evaluateCompatibility(mockArtifacts, mockHw);
    expect(report.status).toBe('supported');
    expect(report.format).toBe('gguf');

    const plan = await adapter.createInstallPlan(mockArtifacts, mockHw);
    expect(plan.runtimeId).toBe('ollama');
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it('LlamaCppAdapter evaluates compatibility and sets up flags', async () => {
    const adapter = new LlamaCppAdapter();
    const report = await adapter.evaluateCompatibility(mockArtifacts, mockHw);
    expect(report.status).toBe('supported');
    expect(report.recommendedFlags['-ngl']).toBeDefined();
  });

  it('XollamaAdapter inherits ollama capabilities and configures think budget', async () => {
    const adapter = new XollamaAdapter();
    expect(adapter.id).toBe('xollama');
    const plan = await adapter.createInstallPlan(mockArtifacts, mockHw, { thinkBudgetTokens: 2048 });
    expect(plan.steps.some(s => s.description.includes('think-budget'))).toBe(true);
  });

  it('VllmAdapter handles safetensors/awq/gguf checks', async () => {
    const adapter = new VllmAdapter();
    const safetensorsArtifacts: ArtifactFileTarget[] = [
      {
        fileId: 'org/model/model.safetensors',
        remoteUrl: 'https://...',
        destinationRelativePath: 'model.safetensors',
        expectedSizeBytes: 14_000_000_000,
        role: 'primary_weights'
      }
    ];
    const report = await adapter.evaluateCompatibility(safetensorsArtifacts, mockHw);
    expect(report.format).toBe('safetensors');
  });
});
