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
    params.append('expand[]', 'tags');

    const path = `/api/models?${params.toString()}`;
    return this.request<HfModelSearchResult[]>(path, options.token);
  }

  /**
   * Get complete model details including all sibling files
   */
  public static async getModelDetails(modelId: string, token?: string): Promise<HfModelSearchResult> {
    const path = `/api/models/${modelId}?expand[]=siblings&expand[]=cardData&expand[]=tags`;
    return this.request<HfModelSearchResult>(path, token);
  }

  /**
   * Fetch model generation config (temperature, top_p, etc.)
   */
  public static async getModelGenerationConfig(
    modelId: string,
    token?: string
  ): Promise<{ temperature?: number; top_p?: number; repetition_penalty?: number; top_k?: number } | null> {
    try {
      return await this.request<{ temperature?: number; top_p?: number; repetition_penalty?: number; top_k?: number }>(
        `/${modelId}/raw/main/generation_config.json`,
        token
      );
    } catch {
      return null;
    }
  }

  /**
   * Fetch model README.md
   */
  public static async getModelReadme(modelId: string, token?: string): Promise<string | null> {
    try {
      return await this.requestText(`/${modelId}/raw/main/README.md`, token);
    } catch {
      return null;
    }
  }

  /**
   * Fetch model architecture configuration (config.json)
   */
  public static async getModelArchitectureConfig(
    modelId: string,
    token?: string,
    baseModel?: string
  ): Promise<{
    max_position_embeddings?: number;
    context_length?: number;
    trained_context?: number;
    max_context?: number;
    is_rope_scaled?: boolean;
    [key: string]: unknown;
  } | null> {
    try {
      let raw: Record<string, unknown> | null = null;
      try {
        raw = await this.request<Record<string, unknown>>(
          `/${modelId}/raw/main/config.json`,
          token
        );
      } catch {
        if (baseModel && baseModel !== modelId) {
          raw = await this.request<Record<string, unknown>>(
            `/${baseModel}/raw/main/config.json`,
            token
          );
        }
      }
      if (!raw) return null;

      const max_position_embeddings = Number(raw.max_position_embeddings) || undefined;
      const context_length = Number(raw.context_length) || undefined;
      const rope_scaling = raw.rope_scaling as Record<string, unknown> | undefined;
      const original_max_position_embeddings = Number(raw.original_max_position_embeddings) || (rope_scaling ? Number(rope_scaling.original_max_position_embeddings) : undefined);

      const is_rope_scaled = !!rope_scaling || (!!original_max_position_embeddings && !!max_position_embeddings && original_max_position_embeddings < max_position_embeddings);
      const trained_context = original_max_position_embeddings || context_length || (is_rope_scaled ? 8192 : max_position_embeddings) || 8192;
      const max_context = max_position_embeddings || context_length || 8192;

      return {
        ...raw,
        max_position_embeddings,
        context_length,
        trained_context,
        max_context,
        is_rope_scaled,
      };
    } catch {
      return null;
    }
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

  private static requestText(path: string, token?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {
        'User-Agent': 'HF-Model-Browser-Windows/1.0',
        'Accept': 'text/plain, application/json',
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
            resolve(body);
          } else {
            reject(new Error(`Hugging Face API error (Status ${res.statusCode})`));
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
