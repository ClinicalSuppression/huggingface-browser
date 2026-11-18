import { describe, it, expect } from 'vitest';
import { calculateWeightMemoryBytes, calculateKvCacheMemoryBytes, evaluateHardwareFit } from './sizing';
import { parseQuantFromFilename, groupGgufShards, findMatchingMultimodalProjector } from './gguf-parser';
import { getPurposePreset, detectReasoningRequirements } from './presets';
import { HardwareProfile } from '../types';

describe('Core Sizing & VRAM Engine', () => {
  it('calculates weight memory correctly with default overhead', () => {
    const bytes = calculateWeightMemoryBytes(7, 4.5);
    expect(bytes).toBeGreaterThan(0);
  });

  it('calculates KV cache memory correctly', () => {
    const bytes = calculateKvCacheMemoryBytes(32, 8, 128, 4096);
    expect(bytes).toBeGreaterThan(0);
  });

  it('evaluates hardware fit correctly', () => {
    const mockHw: HardwareProfile = {
      gpus: [
        {
          id: '0',
          name: 'RTX 4090',
          vendor: 'nvidia',
          vramTotalBytes: 24_000_000_000,
          vramFreeBytes: 22_000_000_000,
          driverVersion: '550.0',
        },
      ],
      systemRamTotalBytes: 64_000_000_000,
      systemRamAvailableBytes: 40_000_000_000,
      cpuArchitecture: 'x86_64',
      cpuLogicalCores: 16,
      supportsAvx2: true,
      supportsAvx512: false,
      capturedAtIso: new Date().toISOString(),
    };

    const fit = evaluateHardwareFit(7, 4.5, 32, 8, 128, 4096, mockHw);
    expect(fit.status).toBe('supported');
    expect(fit.fitsInVram).toBe(true);
  });
});

describe('GGUF Parser & Artifact Engine', () => {
  it('parses quantization from filename correctly', () => {
    const info = parseQuantFromFilename('Meta-Llama-3-8B-Instruct-Q4_K_M.gguf');
    expect(info.quant).toBe('Q4_K_M');
    expect(info.isKQuant).toBe(true);
  });

  it('groups sharded GGUF files correctly', () => {
    const files = [
      'model-00001-of-00003.gguf',
      'model-00002-of-00003.gguf',
      'model-00003-of-00003.gguf',
      'other.gguf',
    ];
    const groups = groupGgufShards(files);
    expect(groups.length).toBe(2);
    const shardedGroup = groups.find((g) => g.totalShards === 3);
    expect(shardedGroup).toBeDefined();
    expect(shardedGroup?.isComplete).toBe(true);
    expect(shardedGroup?.shards.length).toBe(3);
  });

  it('finds matching multimodal projector', () => {
    const files = ['model-Q4_K_M.gguf', 'mmproj-model-f16.gguf', 'config.json'];
    const projector = findMatchingMultimodalProjector(files);
    expect(projector).toBe('mmproj-model-f16.gguf');
  });
});

describe('Purpose Presets & Reasoning Engine', () => {
  it('returns correct purpose presets', () => {
    const instruct = getPurposePreset('instruct');
    expect(instruct.temperature).toBe(0.7);

    const reasoning = getPurposePreset('reasoning');
    expect(reasoning.thinkBudgetTokens).toBe(8192);
  });

  it('detects reasoning requirements correctly', () => {
    const res1 = detectReasoningRequirements('deepseek-ai/DeepSeek-R1-Distill-Qwen-7B', ['deepseek-r1']);
    expect(res1.isThinkingModel).toBe(true);
    expect(res1.reasoningFormat).toBe('deepseek');

    const res2 = detectReasoningRequirements('meta-llama/Llama-3-8B-Instruct', ['instruct']);
    expect(res2.isThinkingModel).toBe(false);
  });
});
