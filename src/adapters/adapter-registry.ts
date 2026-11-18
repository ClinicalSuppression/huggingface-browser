import { IRuntimeAdapter, RuntimeId, RuntimeEnvironment } from '../types';
import { OllamaAdapter } from './ollama-adapter';
import { LlamaCppAdapter } from './llamacpp-adapter';
import { XollamaAdapter } from './xollama-adapter';
import { VllmAdapter } from './vllm-adapter';

export class AdapterRegistry {
  private adapters: Map<RuntimeId, IRuntimeAdapter> = new Map();

  constructor() {
    this.register(new OllamaAdapter());
    this.register(new LlamaCppAdapter());
    this.register(new XollamaAdapter());
    this.register(new VllmAdapter());
  }

  register(adapter: IRuntimeAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  getAdapter(id: RuntimeId): IRuntimeAdapter | undefined {
    return this.adapters.get(id);
  }

  listAdapters(): IRuntimeAdapter[] {
    return Array.from(this.adapters.values());
  }

  async detectAll(): Promise<Array<{ adapter: IRuntimeAdapter; env: RuntimeEnvironment | null }>> {
    const results: Array<{ adapter: IRuntimeAdapter; env: RuntimeEnvironment | null }> = [];
    for (const adapter of this.adapters.values()) {
      try {
        const env = await adapter.detect();
        results.push({ adapter, env });
      } catch {
        results.push({ adapter, env: null });
      }
    }
    return results;
  }

  async listAllInstalledModels(): Promise<Array<{ runtimeId: RuntimeId; runtimeName: string; model: { readonly id: string; readonly sizeBytes: number; readonly modifiedAtIso: string } }>> {
    const allModels: Array<{ runtimeId: RuntimeId; runtimeName: string; model: { readonly id: string; readonly sizeBytes: number; readonly modifiedAtIso: string } }> = [];
    
    for (const adapter of this.adapters.values()) {
      try {
        const models = await adapter.listInstalledModels();
        for (const m of models) {
          allModels.push({
            runtimeId: adapter.id,
            runtimeName: adapter.displayName,
            model: m
          });
        }
      } catch {
        // Skip failed adapters during model listing
      }
    }

    return allModels;
  }
}

export const globalAdapterRegistry = new AdapterRegistry();
