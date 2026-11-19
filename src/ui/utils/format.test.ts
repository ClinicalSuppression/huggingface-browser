import { describe, expect, it } from 'vitest';
import { calculateBestFitContext, estimateContextProfile } from './format';
import { HardwareProfile, HfModelSearchResult } from '../../types';
import { QuantOption } from '../types';

const model = (id = 'org/unknown-8b', cardData?: Record<string, unknown>): HfModelSearchResult => ({
  id, author: 'org', cardData,
});
const hardware = (freeGb: number): HardwareProfile => ({
  gpus: [{ id: 'gpu', name: 'GPU', vendor: 'nvidia', vramTotalBytes: freeGb * 1024 ** 3,
    vramFreeBytes: freeGb * 1024 ** 3, driverVersion: '' }],
  systemRamTotalBytes: 0, systemRamAvailableBytes: 0, cpuArchitecture: 'x86_64',
  cpuLogicalCores: 1, supportsAvx2: false, supportsAvx512: false, capturedAtIso: '',
});
const customQuant: QuantOption = {
  id: 'Q8_0', label: 'Q8_0', bitsPerWeight: 8.5, sizeBytes: 7_000_000_000,
  filename: 'model.gguf', qualityNote: '', format: 'gguf',
};

describe('card context recommendation', () => {
  it('honors a known model context ceiling', () => {
    expect(calculateBestFitContext(model('org/llama-2-8b'), hardware(48))?.tokens).toBe(4096);
  });
  it('treats explicit 32K metadata as known, including rope-scaled metadata', () => {
    const result = calculateBestFitContext(model('org/unknown-8b', {
      max_position_embeddings: 32768, original_max_position_embeddings: 8192,
    }), hardware(48));
    expect(result?.tokens).toBe(32768);
    expect(result?.hasKnownMaxContext).toBe(true);
  });
  it('ignores invalid context metadata and keeps drawer fallback', () => {
    const result = calculateBestFitContext(model('org/unknown-8b', { max_position_embeddings: 1024 }), hardware(48));
    expect(result?.tokens).toBeGreaterThan(32768);
    expect(result?.hasKnownMaxContext).toBe(false);
  });
  it('rejects nonfinite context metadata and still returns a finite drawer ceiling', () => {
    const infinite = model('org/unknown-8b', { max_position_embeddings: Number.POSITIVE_INFINITY });
    const profile = estimateContextProfile(infinite);
    expect(profile.hasKnownMaxContext).toBe(false);
    expect(Number.isFinite(profile.maxContext)).toBe(true);
    expect(calculateBestFitContext(infinite, hardware(48))?.tokens).toBeGreaterThan(0);
  });
  it('rejects unsafe huge ceilings and falls back to valid context metadata', () => {
    const huge = model('org/unknown-8b', { max_position_embeddings: 1e100, context_length: 65536 });
    expect(estimateContextProfile(huge)).toMatchObject({ maxContext: 65536, hasKnownMaxContext: true });
    const hugeOnly = estimateContextProfile(model('org/unknown-8b', { max_position_embeddings: 1e100 }));
    expect(hugeOnly).toMatchObject({ maxContext: 32768, hasKnownMaxContext: false });
    expect(Number.isSafeInteger(hugeOnly.maxContext)).toBe(true);
  });
  it('returns capacity below known maximum and derives unknown metadata above 32K', () => {
    expect(calculateBestFitContext(model('org/llama-3.1-8b'), hardware(8))?.tokens).toBeLessThan(131072);
    expect(calculateBestFitContext(model(), hardware(48))!.tokens).toBeGreaterThan(32768);
  });
  it('allows recommendations above 128K when capacity permits', () => {
    expect(calculateBestFitContext(model(), hardware(128))!.tokens).toBeGreaterThan(131072);
  });
  it('preserves CPU and minimal classifications with zero tokens', () => {
    expect(calculateBestFitContext(model(), null)).toBeNull();
    expect(calculateBestFitContext(model('org/unknown-70b'), hardware(4))).toMatchObject({ status: 'cpu', tokens: 0 });
    expect(calculateBestFitContext(model('org/unknown-8b', { num_hidden_layers: 10000 }), hardware(24), undefined, 512)).toMatchObject({ status: 'minimal', tokens: 0 });
  });
  it('uses selected quantization size in sizing', () => {
    const base = calculateBestFitContext(model(), hardware(24))!.tokens;
    const selected = calculateBestFitContext(model(), hardware(24), undefined, 512, customQuant)!.tokens;
    expect(selected).toBeLessThan(base);
  });
  it('uses selected GPU and reserved headroom', () => {
    const twoGpus: HardwareProfile = { ...hardware(48), gpus: [
      ...hardware(48).gpus,
      { ...hardware(48).gpus[0], id: 'small', vramFreeBytes: 4 * 1024 ** 3 },
    ] };
    const large = calculateBestFitContext(model(), twoGpus, 'gpu')!.tokens;
    const small = calculateBestFitContext(model(), twoGpus, 'small')!;
    expect(small.status).toBe('cpu');
    expect(large).toBeGreaterThan(0);
    expect(calculateBestFitContext(model(), hardware(24), undefined, 4096)!.tokens)
      .toBeLessThan(calculateBestFitContext(model(), hardware(24), undefined, 0)!.tokens);
  });
  it('sums all matching weight shards instead of treating a shard as the whole model', () => {
    const sharded = model('org/unknown-8b', undefined);
    const withShards: HfModelSearchResult = { ...sharded, siblings: [
      { rfilename: 'model-Q4_K_M-00001-of-00002.gguf', size: 3_000_000_000 },
      { rfilename: 'model-Q4_K_M-00002-of-00002.gguf', size: 3_000_000_000 },
    ] };
    const estimate = calculateBestFitContext(sharded, hardware(12))!;
    const summed = calculateBestFitContext(withShards, hardware(12))!;
    expect(summed.tokens).toBeLessThan(estimate.tokens);
  });
  it('does not undercount incomplete Q4 shard metadata', () => {
    const baseline = calculateBestFitContext(model(), hardware(12))!.tokens;
    const incomplete = model();
    const withIncompleteShards: HfModelSearchResult = { ...incomplete, siblings: [
      { rfilename: 'model-Q4_K_M-00001-of-00002.gguf', size: 1_000_000_000 },
      { rfilename: 'model-Q4_K_M-00002-of-00002.gguf' },
    ] };
    expect(calculateBestFitContext(withIncompleteShards, hardware(12))!.tokens).toBe(baseline);
  });
  it('prefers complete Q4_K_M shards over Q4_0 without combining variants', () => {
    const baseline = calculateBestFitContext(model(), hardware(12))!.tokens;
    const both: HfModelSearchResult = { ...model(), siblings: [
      { rfilename: 'model-Q4_K_M.gguf', size: 2_000_000_000 },
      { rfilename: 'model-Q4_0.gguf', size: 8_000_000_000 },
      { rfilename: 'model-mmproj-Q4_K_M.gguf', size: 100_000_000 },
    ] };
    const result = calculateBestFitContext(both, hardware(12))!;
    expect(result.tokens).toBeGreaterThan(baseline);
  });
});
