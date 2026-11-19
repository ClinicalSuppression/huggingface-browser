import { afterEach, describe, expect, it } from 'vitest';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { DownloadManager } from '../src/core/download-manager';

describe('DownloadManager validation', () => {
  let server: http.Server | undefined;
  let dir: string | undefined;

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    server = undefined;
    dir = undefined;
  });

  async function runDownload(payload: Buffer, expected: { expectedSizeBytes?: number; expectedSha256?: string }) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'download-manager-'));
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Length': payload.length });
      res.end(payload);
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address() as import('net').AddressInfo;
    const destinationPath = path.join(dir, 'model.bin');
    fs.writeFileSync(destinationPath, 'preserve me');
    return { destinationPath, result: DownloadManager.downloadFile({
      planId: 'test',
      url: `http://127.0.0.1:${address.port}/model`,
      destinationPath,
      ...expected,
    }) };
  }

  it('rejects a SHA-256 mismatch without replacing the destination and cleans the temp file', async () => {
    const payload = Buffer.from('model payload');
    const { destinationPath, result } = await runDownload(payload, { expectedSha256: '0'.repeat(64) });
    await expect(result).rejects.toThrow(/SHA-256 mismatch/);
    expect(fs.readFileSync(destinationPath, 'utf8')).toBe('preserve me');
    expect(fs.existsSync(`${destinationPath}.download`)).toBe(false);
  });

  it('rejects a size mismatch without replacing the destination', async () => {
    const { destinationPath, result } = await runDownload(Buffer.from('payload'), { expectedSizeBytes: 99 });
    await expect(result).rejects.toThrow(/size mismatch/);
    expect(fs.readFileSync(destinationPath, 'utf8')).toBe('preserve me');
    expect(fs.existsSync(`${destinationPath}.download`)).toBe(false);
  });

  it('promotes a download matching both expected values', async () => {
    const payload = Buffer.from('valid model');
    const { destinationPath, result } = await runDownload(payload, {
      expectedSizeBytes: payload.length,
      expectedSha256: crypto.createHash('sha256').update(payload).digest('hex'),
    });
    await expect(result).resolves.toEqual({ finalPath: destinationPath, verifiedSha256: true });
    expect(fs.readFileSync(destinationPath)).toEqual(payload);
    expect(fs.existsSync(`${destinationPath}.download`)).toBe(false);
  });
});
