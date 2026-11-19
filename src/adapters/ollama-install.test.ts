import { afterEach, describe, expect, it } from 'vitest';
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
  let tempHome: string;

  afterEach(async () => {
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
    const plan = { ...(await new OllamaAdapter(endpoint).createInstallPlan([artifact], hw)), modelStorageRoot: path.join(tempHome, 'custom-root') };
    try {
      await new OllamaAdapter(endpoint).executeInstall(plan, () => {}, new AbortController().signal);
      return {
        body: JSON.parse(body),
        downloaded: fs.readFileSync(path.join(tempHome, 'custom-root', plan.planId, artifact.destinationRelativePath)),
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
    expect(String(result.body?.modelfile)).toContain(path.join(tempHome, 'custom-root'));
  });

  it.each([
    ['{"error":"import failed"}\n', 'import failed'],
    ['{"status":"pulling"}\n', 'without a success event'],
  ])('rejects stream %s', async (stream, expected) => {
    const result = await runCreateResponse(stream);
    expect(result.error?.message).toContain(expected);
  });

  it('rejects insufficient disk space before download or import requests', async () => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ollama-test-'));
    let downloads = 0;
    let imports = 0;
    const downloadUrl = await server((_req, res) => { downloads++; res.end('unexpected'); });
    const endpoint = await server((_req, res) => { imports++; res.end('unexpected'); });
    const artifact: ArtifactFileTarget = {
      fileId: 'org/model/model.Q4_K_M.gguf', remoteUrl: downloadUrl,
      destinationRelativePath: 'model.Q4_K_M.gguf', expectedSizeBytes: 100,
      role: 'primary_weights',
    };
    const adapter = new OllamaAdapter(endpoint, async () => 0);
    const plan = { ...(await adapter.createInstallPlan([artifact], hw)), modelStorageRoot: path.join(tempHome, 'root') };

    await expect(adapter.executeInstall(plan, () => {}, new AbortController().signal))
      .rejects.toThrow('Insufficient disk space');
    expect(downloads).toBe(0);
    expect(imports).toBe(0);
  });

  it('bounds stalled model listing and reports a clear verification timeout', async () => {
    const endpoint = await server((_req, _res) => {});
    const adapter = new OllamaAdapter(endpoint, undefined, 30);
    await expect(adapter.listInstalledModels()).resolves.toEqual([]);
    const artifact: ArtifactFileTarget = {
      fileId: 'org/model/file.gguf', remoteUrl: endpoint,
      destinationRelativePath: 'file.gguf', expectedSizeBytes: 1, role: 'primary_weights',
    };
    const plan = await adapter.createInstallPlan([artifact], hw);
    await expect(adapter.verifyInstall(plan)).resolves.toMatchObject({
      passed: false, errorMessage: expect.stringContaining('timed out'),
    });
  });

  it('cancels a stalled registration response after the injectable idle timeout', async () => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ollama-test-'));
    const payload = Buffer.from('valid test gguf');
    const downloadUrl = await server((_req, res) => res.end(payload));
    let responseClosed = false;
    let markClosed!: () => void;
    const closed = new Promise<void>(resolve => { markClosed = resolve; });
    const endpoint = await server((_req, res) => {
      res.writeHead(200);
      res.write('{"status":"pulling"}\\n');
      res.on('close', () => { responseClosed = true; markClosed(); });
    });
    const artifact: ArtifactFileTarget = {
      fileId: 'org/model/model.gguf', remoteUrl: downloadUrl,
      destinationRelativePath: 'model.gguf', expectedSizeBytes: payload.length, role: 'primary_weights',
    };
    const adapter = new OllamaAdapter(endpoint, undefined, 30, 30);
    const plan = { ...(await adapter.createInstallPlan([artifact], hw)), modelStorageRoot: path.join(tempHome, 'root') };
    await expect(adapter.executeInstall(plan, () => {}, new AbortController().signal))
      .rejects.toThrow('stream timed out');
    await Promise.race([closed, new Promise(resolve => setTimeout(resolve, 200))]);
    expect(responseClosed).toBe(true);
  });

  it('bounds a stalled uninstall request', async () => {
    const endpoint = await server((_req, _res) => {});
    await expect(new OllamaAdapter(endpoint, undefined, 30).uninstallModel('model')).resolves.toBe(false);
  });
});
