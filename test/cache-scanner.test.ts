import { describe, it, expect } from 'vitest';
import { CacheScanner } from '../src/core/cache-scanner';
import os from 'os';
import path from 'path';
import fs from 'fs';

describe('CacheScanner Module', () => {
  it('scans custom paths and detects mock model files', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-browser-scan-'));
    const mockModelPath = path.join(tempDir, 'test-model.Q4_K_M.gguf');
    fs.writeFileSync(mockModelPath, 'mock-gguf-binary-content');

    try {
      const results = await CacheScanner.scanLocalModels([tempDir]);
      expect(results.length).toBe(1);
      expect(results[0].filename).toBe('test-model.Q4_K_M.gguf');
      expect(results[0].quant).toBe('Q4_K_M');
      expect(results[0].sizeBytes).toBeGreaterThan(0);
      expect(results[0].source).toBe('custom');
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  });
});
