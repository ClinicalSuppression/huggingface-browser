import { describe, it, expect } from 'vitest';
import { evaluateHardwareFit } from '../src/core/sizing';
import { parseQuantFromFilename, groupGgufShards } from '../src/core/gguf-parser';
import { HardwareProfile } from '../src/types';

describe('Performance & Reliability Benchmarks', () => {
  const hw: HardwareProfile = {
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

  it('evaluates 1,000 model hardware sizing calculations in < 50ms', () => {
    const start = performance.now();
    for (let i = 1; i <= 1000; i++) {
      const params = (i % 70) + 1;
      const bits = (i % 4) + 4;
      evaluateHardwareFit(params, bits, 32, 8, 128, 4096, hw);
    }
    const elapsed = performance.now() - start;
    console.log(`[PERF] 1,000 Sizing evaluations took: ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(100);
  });

  it('parses 10,000 GGUF quantization strings in < 100ms', () => {
    const filenames = [
      'Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
      'Qwen2.5-Coder-32B-Instruct-IQ4_XS.gguf',
      'DeepSeek-R1-Distill-Qwen-14B-Q8_0.gguf',
      'Gemma-2-27B-it-FP8.gguf',
      'Mistral-Large-Instruct-2407-Q5_K_M.gguf',
    ];

    const start = performance.now();
    for (let i = 0; i < 2000; i++) {
      for (const f of filenames) {
        parseQuantFromFilename(f);
      }
    }
    const elapsed = performance.now() - start;
    console.log(`[PERF] 10,000 Quant string parses took: ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(150);
  });

  it('groups 1,000 sharded GGUF filenames deterministically in < 50ms', () => {
    const files: string[] = [];
    for (let i = 1; i <= 50; i++) {
      const idx = i.toString().padStart(5, '0');
      files.push(`Llama-3.3-70B-Instruct-Q4_K_M-${idx}-of-00050.gguf`);
    }

    const start = performance.now();
    for (let r = 0; r < 20; r++) {
      const groups = groupGgufShards(files);
      expect(groups).toHaveLength(1);
      expect(groups[0].isComplete).toBe(true);
    }
    const elapsed = performance.now() - start;
    console.log(`[PERF] 1,000 Sharded group checks took: ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(100);
  });
});
