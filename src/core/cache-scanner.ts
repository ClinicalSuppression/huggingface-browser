import fs from 'fs';
import path from 'path';
import os from 'os';
import { parseQuantFromFilename } from './gguf-parser';
import { LocalModelItem } from '../types';

export class CacheScanner {
  /**
   * Scans local directories for already downloaded models (.gguf and .safetensors).
   * Default directories include Hugging Face hub cache, Ollama models, LM Studio models, and any custom paths.
   */
  public static async scanLocalModels(customPaths: string[] = []): Promise<LocalModelItem[]> {
    const defaultPaths = [
      path.join(os.homedir(), '.cache', 'huggingface', 'hub'),
      path.join(os.homedir(), '.ollama', 'models'),
      path.join(os.homedir(), '.cache', 'lm-studio', 'models'),
    ];

    const allPaths = [...defaultPaths, ...customPaths];
    const results: LocalModelItem[] = [];

    for (const scanPath of allPaths) {
      if (!fs.existsSync(scanPath)) continue;
      try {
        await this.scanDirectoryRecursive(scanPath, scanPath, results);
      } catch {
        // Ignore read/permission errors on specific directories
      }
    }

    return results;
  }

  private static async scanDirectoryRecursive(
    rootPath: string,
    currentPath: string,
    results: LocalModelItem[]
  ): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await this.scanDirectoryRecursive(rootPath, fullPath, results);
      } else if (entry.isFile()) {
        const lowerName = entry.name.toLowerCase();
        if (lowerName.endsWith('.gguf') || lowerName.endsWith('.safetensors')) {
          try {
            const stats = await fs.promises.stat(fullPath);
            const source = rootPath.includes('huggingface')
              ? 'huggingface'
              : rootPath.includes('ollama')
              ? 'ollama'
              : rootPath.includes('lm-studio')
              ? 'lm-studio'
              : 'custom';

            const parsed = parseQuantFromFilename(entry.name);

            results.push({
              path: fullPath,
              filename: entry.name,
              sizeBytes: stats.size,
              quant: parsed.quant,
              source: source as any,
            });
          } catch {
            // Ignore stat errors
          }
        }
      }
    }
  }
}
