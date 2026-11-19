import { afterEach, describe, expect, it, vi } from 'vitest';
import http from 'http';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { OllamaAdapter } from './ollama-adapter';
import { ArtifactFileTarget, HardwareProfile } from '../types';

const hw: HardwareProfile = {
  gpus: [], systemRamTotalBytes: 1, systemRamAvailableBytes: 1,
  cpuArchitecture: 'x86_64', cpuLogicalCores: 1, supportsAvx2: false,
  supportsAvx512: false, capturedAtIso: new Date().toISOString(),
};

describe('Ollama executeInstall', () => {
  const servers: http.Server[] = [];
  let homeSpy: ReturnType<typeof vi.spyOn> | undefined;
  let tempHome: string;

  afterEach(async () => {
    homeSpy?.mockRestore();
    homeSpy = undefined;
    await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
    if (tempHome) fs.rmSync(tempHome, { recursive: true, force: true });
  });

  async function server(handler: http.RequestListener): Promise<string> {
    const instance = http.createServer(handler);
    servers.push(instance);
    await new Promise<void>(resolve => instance.listen(0, '127.0.0.1', resolve));
    const address = instance.address();
    if (!address || typeof address === 'string') throw new Error('No server address');
    return `http://127.0.0.1:${address.port}`;
  }

  async function runCreateResponse(response: string): Promise<{ error?: Error; body?: Record<string, unknown>; downloaded?: Buffer }> {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ollama-test-'));
    homeSpy = vi.spyOn(os, 'homedir').mockReturnValue(tempHome);
    const payload = Buffer.from('valid test gguf');
    const downloadUrl = await server((_req, res) => { res.writeHead(200, { 'content-length': payload.length }); res.end(payload); });
    let body = '';
    const endpoint = await server((req, res) => {
      req.on('data', chunk => body += chunk);
      req.on('end', () => { res.writeHead(200); for (const part of response) res.write(part); res.end(); });
    });
    const artifact: ArtifactFileTarget = {
      fileId: 'org/model/model.Q4_K_M.gguf', remoteUrl: downloadUrl,
      destinationRelativePath: 'model.Q4_K_M.gguf', expectedSizeBytes: payload.length,
      role: 'primary_weights',
    };
    const plan = await new OllamaAdapter(endpoint).createInstallPlan([artifact], hw);
    try {
      await new OllamaAdapter(endpoint).executeInstall(plan, () => {}, new AbortController().signal);
      return {
        body: JSON.parse(body),
        downloaded: fs.readFileSync(path.join(tempHome, '.cache', 'hf-browser', 'models', plan.planId, artifact.destinationRelativePath)),
      };
    } catch (error) {
      return { error: error as Error, body: JSON.parse(body) };
    }
  }

  it('downloads locally and registers using model and local Modelfile path; requires success', async () => {
    const result = await runCreateResponse('{"status":"pulling"}\n{"status":"success"}\n');
    expect(result.error).toBeUndefined();
    expect(result.downloaded?.toString()).toBe('valid test gguf');
    expect(result.body?.model).toBe('hf-org-model-model.q4_k_m');
    expect(result.body?.model).toMatch(/^[a-z0-9._-]+$/);
    expect(String(result.body?.modelfile)).toContain(path.join(tempHome, '.cache', 'hf-browser', 'models'));
  });

  it.each([
    ['{"error":"import failed"}\n', 'import failed'],
    ['{"status":"pulling"}\n', 'without a success event'],
  ])('rejects stream %s', async (stream, expected) => {
    const result = await runCreateResponse(stream);
    expect(result.error?.message).toContain(expected);
  });
});
