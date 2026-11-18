import { describe, it, expect } from 'vitest';
import { calculateWeightMemoryBytes, calculateKvCacheMemoryBytes, evaluateHardwareFit } from '../src/core/sizing';
import { HardwareProfile } from '../src/types';

describe('Sizing and VRAM Estimation Engine', () => {
  const mockHw16Gb: HardwareProfile = {
    gpus: [{
      id: 'gpu-0',
      name: 'AMD Radeon RX 7800 XT',
      vendor: 'amd',
      vramTotalBytes: 16 * 1024 * 1024 * 1024,
      vramFreeBytes: 14.5 * 1024 * 1024 * 1024,
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

  it('calculates weight memory with 15% overhead correctly', () => {
    // 7B model at 4 bits (0.5 bytes per param): 7 * 0.5 * 1.15 = 4.025 GB
    const bytes = calculateWeightMemoryBytes(7, 4);
    const gb = bytes / (1024 * 1024 * 1024);
    expect(gb).toBeCloseTo(3.75, 0.5);
  });

  it('calculates KV cache memory for given context length', () => {
    // 32 layers, 8 KV heads, 128 head dim, 8192 context tokens, 2 bytes (FP16)
    // 2 * 32 * 8 * 128 * 8192 * 2 = 1,073,741,824 bytes (exactly 1 GB)
    const bytes = calculateKvCacheMemoryBytes(32, 8, 128, 8192, 2);
    expect(bytes).toBe(1073741824);
  });

  it('evaluates 7B Q4 model on 16GB GPU as Full GPU Fit', () => {
    const result = evaluateHardwareFit(
      7, // 7B params
      4.5, // Q4_K_M ~4.5 bits
      32, // layers
      8,  // kv heads
      128, // head dim
      8192, // 8k context
      mockHw16Gb
    );

    expect(result.status).toBe('supported');
    expect(result.fitsInVram).toBe(true);
    expect(result.maxOffloadLayers).toBe(32);
  });

  it('evaluates 70B Q4 model on 16GB GPU as Partial GPU Offload', () => {
    const result = evaluateHardwareFit(
      70, // 70B params (~40 GB weights)
      4.5, // Q4_K_M
      80, // layers
      8,
      128,
      4096,
      mockHw16Gb
    );

    expect(result.status).toBe('conditional');
    expect(result.fitsInVram).toBe(false);
    expect(result.maxOffloadLayers).toBeGreaterThan(0);
    expect(result.maxOffloadLayers).toBeLessThan(80);
  });

  it('evaluates 405B model on 16GB GPU as Cannot Run / CPU thrash', () => {
    const smallRamHw: HardwareProfile = {
      ...mockHw16Gb,
      systemRamAvailableBytes: 16 * 1024 * 1024 * 1024, // only 16GB RAM available
    };

    const result = evaluateHardwareFit(
      405, // 405B params (~240 GB weights)
      4.5,
      126,
      8,
      128,
      4096,
      smallRamHw
    );

    expect(result.status).toBe('unsupported');
    expect(result.fitsInVram).toBe(false);
  });
});
