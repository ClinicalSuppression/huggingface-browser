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
}

export class DownloadManager {
  /**
   * Resumable download with SHA-256 verification and atomic rename.
   */
  public static async downloadFile(options: DownloadTaskOptions): Promise<{ finalPath: string; verifiedSha256: boolean }> {
    const tempPath = `${options.destinationPath}.download`;
    const targetDir = path.dirname(options.destinationPath);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Check existing downloaded bytes for resuming
    let startByte = 0;
    if (fs.existsSync(tempPath)) {
      const stats = fs.statSync(tempPath);
      startByte = stats.size;
    }

    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(options.url);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      const headers: Record<string, string> = {
        'User-Agent': 'HF-Model-Browser-Windows/1.0',
      };
      if (options.token) {
        headers['Authorization'] = `Bearer ${options.token}`;
      }
      if (startByte > 0) {
        headers['Range'] = `bytes=${startByte}-`;
      }

      const req = client.request(parsedUrl, { headers }, (res) => {
        // Handle redirect
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Never forward HF token to non-HF redirect host
          const redirectUrl = new URL(res.headers.location, options.url);
          const hostname = redirectUrl.hostname.toLowerCase();
          const isHfHost = redirectUrl.protocol === 'https:' && (
            hostname === 'huggingface.co' ||
            hostname.endsWith('.huggingface.co') ||
            hostname === 'hf.co' ||
            hostname.endsWith('.hf.co')
          );
          return this.downloadFile({
            ...options,
            url: redirectUrl.toString(),
            token: isHfHost ? options.token : undefined,
          }).then(resolve).catch(reject);
        }

        const statusCode = res.statusCode || 0;
        const isResumeSuccess = statusCode === 206;
        const isFreshSuccess = statusCode === 200;

        if (!isResumeSuccess && !isFreshSuccess) {
          return reject(new Error(`Download failed with HTTP status ${statusCode}`));
        }

        const totalBytes = Number(res.headers['content-length'] || 0) + (isResumeSuccess ? startByte : 0);
        const writeStream = fs.createWriteStream(tempPath, { flags: isResumeSuccess ? 'a' : 'w' });
        const hash = crypto.createHash('sha256');

        let downloadedBytes = isResumeSuccess ? startByte : 0;
        let lastReportTime = Date.now();
        let bytesSinceLastReport = 0;

        if (options.cancelSignal) {
          options.cancelSignal.addEventListener('abort', () => {
            req.destroy();
            writeStream.close();
            reject(new Error('Download cancelled by user'));
          });
        }

        res.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          bytesSinceLastReport += chunk.length;
          hash.update(chunk);

          const now = Date.now();
          const elapsed = (now - lastReportTime) / 1000;
          if (elapsed >= 0.5 && options.onProgress) {
            const speed = bytesSinceLastReport / elapsed;
            lastReportTime = now;
            bytesSinceLastReport = 0;

            options.onProgress({
              planId: options.planId,
              currentStepIndex: 1,
              totalSteps: 3,
              stepDescription: `Downloading ${path.basename(options.destinationPath)}...`,
              bytesDownloaded: downloadedBytes,
              bytesTotal: totalBytes || options.expectedSizeBytes || downloadedBytes,
              percentComplete: totalBytes ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 50,
              downloadSpeedBytesPerSec: Math.round(speed),
            });
          }
        });

        res.pipe(writeStream);

        writeStream.on('finish', () => {
          writeStream.close();
          void (async () => {
            try {
              const stats = fs.statSync(tempPath);
              if (options.expectedSizeBytes !== undefined && stats.size !== options.expectedSizeBytes) {
                throw new Error(`Downloaded size mismatch: expected ${options.expectedSizeBytes} bytes, received ${stats.size}`);
              }

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
                if (!verifiedSha256) {
                  throw new Error(`Downloaded SHA-256 mismatch: expected ${options.expectedSha256}, received ${calculatedSha}`);
                }
              }

              // Promote only after validation; remove an old target only once validation succeeds.
              if (fs.existsSync(options.destinationPath)) {
                fs.unlinkSync(options.destinationPath);
              }
              fs.renameSync(tempPath, options.destinationPath);
              resolve({ finalPath: options.destinationPath, verifiedSha256 });
            } catch (err) {
              // Invalid or failed downloads are discarded; an existing destination remains untouched.
              try { fs.unlinkSync(tempPath); } catch { /* already removed */ }
              reject(err);
            }
          })();
        });

        writeStream.on('error', (err) => {
          reject(err);
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.end();
    });
  }
}
