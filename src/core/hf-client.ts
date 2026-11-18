import https from 'https';
import { HfModelSearchResult } from '../types';
import { parseQuantFromFilename, groupGgufShards, findMatchingMultimodalProjector } from './gguf-parser';

export interface SearchOptions {
  readonly search?: string;
  readonly author?: string;
  readonly filter?: string;
  readonly sort?: 'downloads' | 'trendingScore' | 'lastModified' | 'likes';
  readonly direction?: -1 | 1;
  readonly limit?: number;
  readonly token?: string;
}

export class HuggingFaceClient {
  private static readonly API_BASE = 'huggingface.co';

  /**
   * Search Hugging Face Hub models
   */
  public static async searchModels(options: SearchOptions = {}): Promise<HfModelSearchResult[]> {
    const params = new URLSearchParams();
    if (options.search) params.append('search', options.search);
    if (options.author) params.append('author', options.author);
    if (options.filter) params.append('filter', options.filter);
    params.append('sort', options.sort || 'trendingScore');
    params.append('direction', (options.direction || -1).toString());
    params.append('limit', (options.limit || 30).toString());
    params.append('expand[]', 'siblings');
    params.append('expand[]', 'cardData');

    const path = `/api/models?${params.toString()}`;
    return this.request<HfModelSearchResult[]>(path, options.token);
  }

  /**
   * Get complete model details including all sibling files
   */
  public static async getModelDetails(modelId: string, token?: string): Promise<HfModelSearchResult> {
    const path = `/api/models/${modelId}?expand[]=siblings&expand[]=cardData`;
    return this.request<HfModelSearchResult>(path, token);
  }

  /**
   * Safe artifact resolution for GGUF model files
   */
  public static resolveArtifacts(model: HfModelSearchResult) {
    const siblings = model.siblings || [];
    const allFilenames = siblings.map(s => s.rfilename);
    const ggufFiles = allFilenames.filter(f => f.toLowerCase().endsWith('.gguf'));
    const safeTensorsFiles = allFilenames.filter(f => f.toLowerCase().endsWith('.safetensors'));

    const mmprojFile = findMatchingMultimodalProjector(allFilenames);
    const nonMmprojGgufs = ggufFiles.filter(f => !f.toLowerCase().includes('mmproj'));

    const shardGroups = groupGgufShards(nonMmprojGgufs);
    const groupedFilenames = new Set<string>();
    for (const group of shardGroups) {
      for (const s of group.shards) {
        groupedFilenames.add(s);
      }
    }

    const singleFiles = nonMmprojGgufs
      .filter(f => !groupedFilenames.has(f))
      .map(f => {
        const sibling = siblings.find(s => s.rfilename === f);
        const parsed = parseQuantFromFilename(f);
        return {
          filename: f,
          quant: parsed.quant,
          bitsPerWeight: parsed.bitsPerWeight,
          sizeBytes: sibling?.size || 0,
        };
      });

    const populatedShardGroups = shardGroups.map(g => {
      let totalBytes = 0;
      for (const shardName of g.shards) {
        const sib = siblings.find(s => s.rfilename === shardName);
        totalBytes += sib?.size || 0;
      }
      const parsed = parseQuantFromFilename(g.baseName);
      return {
        ...g,
        bitsPerWeight: parsed.bitsPerWeight,
        totalBytes,
      };
    });

    return {
      isGated: !!model.gated,
      shardGroups: populatedShardGroups,
      singleFiles,
      mmprojFile,
      hasGguf: ggufFiles.length > 0,
      hasSafeTensors: safeTensorsFiles.length > 0,
    };
  }

  private static request<T>(path: string, token?: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {
        'User-Agent': 'HF-Model-Browser-Windows/1.0',
        'Accept': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const options: https.RequestOptions = {
        hostname: this.API_BASE,
        path,
        method: 'GET',
        headers,
        timeout: 10000,
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body) as T);
            } catch (e) {
              reject(new Error(`Failed to parse JSON response: ${(e as Error).message}`));
            }
          } else if (res.statusCode === 401 || res.statusCode === 403) {
            reject(new Error(`Hugging Face authentication required or access denied (Status ${res.statusCode})`));
          } else if (res.statusCode === 429) {
            reject(new Error('Hugging Face API rate limit reached. Please try again later or add an access token.'));
          } else {
            reject(new Error(`Hugging Face API error (Status ${res.statusCode}): ${body.slice(0, 200)}`));
          }
        });
      });

      req.on('error', err => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Hugging Face API request timed out'));
      });
      req.end();
    });
  }
}
