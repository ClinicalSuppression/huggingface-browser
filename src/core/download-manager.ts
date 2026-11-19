import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import crypto from 'crypto';
import { InstallProgress } from '../types';

export interface DownloadTaskOptions {
  readonly planId: string;
  readonly url: string;
  readonly destinationPath: string;
  readonly expectedSizeBytes?: number;
  readonly expectedSha256?: string;
  readonly token?: string;
  readonly onProgress?: (p: InstallProgress) => void;
  readonly cancelSignal?: AbortSignal;
  readonly requestTimeoutMs?: number;
  readonly redirectCount?: number;
}

export class DownloadManager {
  public static async downloadFile(options: DownloadTaskOptions): Promise<{ finalPath: string; verifiedSha256: boolean }> {
    const targetDir = path.dirname(options.destinationPath);
    fs.mkdirSync(targetDir, { recursive: true });
    // A transfer owns its own temporary file; retries/concurrent downloads cannot remove each other's data.
    const tempPath = `${options.destinationPath}.${crypto.randomUUID()}.download`;
    try {
      return await new Promise((resolve, reject) => {
        const parsedUrl = new URL(options.url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          reject(new Error('Unsupported download protocol'));
          return;
        }
        const client = parsedUrl.protocol === 'https:' ? https : http;
        const headers: Record<string, string> = { 'User-Agent': 'HF-Model-Browser-Windows/1.0' };
        if (options.token) headers.Authorization = `Bearer ${options.token}`;
        let finishStreamingError: ((error: Error) => void) | undefined;
        let requestFinished = false;
        let cancelled = false;
        const cleanupAbortListener = () => options.cancelSignal?.removeEventListener('abort', onAbort);
        const onAbort = () => {
          if (requestFinished || cancelled) return;
          cancelled = true;
          if (finishStreamingError) finishStreamingError(new Error('Download cancelled by user'));
          else {
            requestFinished = true;
            cleanupAbortListener();
            req.destroy();
            reject(new Error('Download cancelled by user'));
          }
        };
        const req = client.request(parsedUrl, { headers }, (res) => {
          if (cancelled) { res.destroy(); return; }
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            requestFinished = true;
            cleanupAbortListener();
            const redirectUrl = new URL(res.headers.location, options.url);
            const hostname = redirectUrl.hostname.toLowerCase();
            const isHfHost = redirectUrl.protocol === 'https:' &&
              (hostname === 'huggingface.co' || hostname.endsWith('.huggingface.co') || hostname === 'hf.co' || hostname.endsWith('.hf.co'));
            res.resume();
            const redirects = options.redirectCount ?? 0;
            if (redirects >= 5) {
              reject(new Error('Download exceeded maximum redirect hops'));
              return;
            }
            if (!isHfHost) {
              reject(new Error('Rejected redirect to non-Hugging Face HTTPS host'));
              return;
            }
            this.downloadFile({ ...options, url: redirectUrl.toString(), redirectCount: redirects + 1, token: undefined })
              .then(resolve, reject);
            return;
          }
          if (res.statusCode !== 200) {
            requestFinished = true;
            cleanupAbortListener();
            res.resume();
            reject(new Error(`Download failed with HTTP status ${res.statusCode || 0}`));
            return;
          }
          const totalBytes = Number(res.headers['content-length'] || 0);
          const output = fs.createWriteStream(tempPath, { flags: 'wx' });
          let settled = false;
          let downloadedBytes = 0;
          let lastReportTime = Date.now();
          let bytesSinceReport = 0;
          const cleanupListener = cleanupAbortListener;
          const finishError = (error: Error) => {
            if (settled || requestFinished) return;
            settled = true;
            requestFinished = true;
            cleanupListener();
            req.destroy();
            res.destroy();
            if (!output.destroyed) output.destroy();
            // On Windows an open handle prevents unlinking the owned temporary file.
            if (output.closed) reject(error);
            else output.once('close', () => reject(error));
          };
          finishStreamingError = finishError;
          if (cancelled) { finishError(new Error('Download cancelled by user')); return; }
          res.on('data', (chunk: Buffer) => {
            downloadedBytes += chunk.length;
            bytesSinceReport += chunk.length;
            const now = Date.now();
            const elapsed = (now - lastReportTime) / 1000;
            if (elapsed >= 0.5 && options.onProgress) {
              options.onProgress({
                planId: options.planId, currentStepIndex: 1, totalSteps: 3,
                stepDescription: `Downloading ${path.basename(options.destinationPath)}...`,
                bytesDownloaded: downloadedBytes, bytesTotal: totalBytes || options.expectedSizeBytes || downloadedBytes,
                percentComplete: totalBytes ? Math.min(100, Math.round(downloadedBytes / totalBytes * 100)) : 50,
                downloadSpeedBytesPerSec: Math.round(bytesSinceReport / elapsed),
              });
              lastReportTime = now;
              bytesSinceReport = 0;
            }
          });
          res.on('error', finishError);
          output.on('error', finishError);
          output.on('finish', () => {
            if (settled) return;
            settled = true;
            requestFinished = true;
            cleanupListener();
            void (async () => {
              try {
                const stats = fs.statSync(tempPath);
                if (options.expectedSizeBytes !== undefined && stats.size !== options.expectedSizeBytes)
                  throw new Error(`Downloaded size mismatch: expected ${options.expectedSizeBytes} bytes, received ${stats.size}`);
                let verifiedSha256 = false;
                if (options.expectedSha256) {
                  const hash = crypto.createHash('sha256');
                  await new Promise<void>((resolveHash, rejectHash) => {
                    const input = fs.createReadStream(tempPath);
                    input.on('data', (chunk: Buffer) => hash.update(chunk));
                    input.on('error', rejectHash);
                    input.on('end', resolveHash);
                  });
                  const calculatedSha = hash.digest('hex');
                  verifiedSha256 = calculatedSha.toLowerCase() === options.expectedSha256.toLowerCase();
                  if (!verifiedSha256) throw new Error(`Downloaded SHA-256 mismatch: expected ${options.expectedSha256}, received ${calculatedSha}`);
                }
                // Rename is the atomic promotion; never remove the destination before the validated file is ready.
                fs.renameSync(tempPath, options.destinationPath);
                resolve({ finalPath: options.destinationPath, verifiedSha256 });
              } catch (error) {
                reject(error);
              }
            })();
          });
          res.pipe(output);
        });
        req.setTimeout(options.requestTimeoutMs ?? 60_000, () => {
          const error = new Error('Download request inactivity timeout');
          if (finishStreamingError) finishStreamingError(error);
          else {
            requestFinished = true;
            cleanupAbortListener();
            req.destroy(error);
            reject(error);
          }
        });
        req.on('error', (error) => {
          if (cancelled) return;
          if (typeof finishStreamingError === 'function') finishStreamingError(error);
          else {
            requestFinished = true;
            cleanupAbortListener();
            reject(error);
          }
        });
        options.cancelSignal?.addEventListener('abort', onAbort, { once: true });
        if (options.cancelSignal?.aborted) onAbort();
        if (!cancelled) req.end();
      });
    } finally {
      try { fs.unlinkSync(tempPath); } catch { /* already promoted or absent */ }
    }
  }
}
