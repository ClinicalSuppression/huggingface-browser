import { describe, it, expect } from 'vitest';
import { detectHardware } from '../src/core/hardware';

describe('Hardware Profiler Integration', () => {
  it('detects system hardware, GPU, and RAM accurately', async () => {
    const profile = await detectHardware();

    expect(profile).toBeDefined();
    expect(profile.gpus.length).toBeGreaterThan(0);
    expect(profile.systemRamTotalBytes).toBeGreaterThan(0);
    expect(profile.systemRamAvailableBytes).toBeGreaterThan(0);
    expect(profile.cpuLogicalCores).toBeGreaterThan(0);
    expect(['x86_64', 'arm64']).toContain(profile.cpuArchitecture);

    console.log('Detected Hardware:');
    console.log(` - CPU Cores: ${profile.cpuLogicalCores} (${profile.cpuArchitecture})`);
    console.log(` - System RAM: ${(profile.systemRamTotalBytes / (1024 * 1024 * 1024)).toFixed(1)} GB (Free: ${(profile.systemRamAvailableBytes / (1024 * 1024 * 1024)).toFixed(1)} GB)`);
    for (const g of profile.gpus) {
      console.log(` - GPU: ${g.name} (${g.vendor.toUpperCase()}), VRAM: ${(g.vramTotalBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`);
    }
  });
});
