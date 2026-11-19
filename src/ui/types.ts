import type {
  HardwareProfile,
  HfModelSearchResult,
  ArtifactFileTarget,
  CompatibilityReport,
  InstallPlan,
  InstallProgress,
  VerificationResult,
  RuntimeId,
  PresetIntent,
  PurposePreset,
} from '../types';

export type NavTabId = 'discover' | 'installed' | 'runtimes' | 'hardware' | 'vault' | 'settings';

export type ModelFilterChip = 'all' | 'gguf' | 'safetensors' | 'reasoning';

export type TaskFilter =
  | 'all'
  | 'any-to-any'
  | 'text-generation'
  | 'image-text-to-text'
  | 'conversational'
  | 'coding'
  | 'feature-extraction';

export type FormatFilter = 'all' | 'gguf' | 'safetensors' | 'fp8';

export type AlignmentFilter = 'all' | 'uncensored' | 'aligned';

export type FamilyFilter =
  | 'all'
  | 'llama'
  | 'qwen'
  | 'deepseek'
  | 'mistral'
  | 'gemma'
  | 'phi'
  | 'lfm'
  | 'command-r'
  | 'starcoder'
  | 'glm'
  | 'yi'
  | 'internlm'
  | 'exaone'
  | 'solar'
  | 'smollm';

export type HardwareFitFilter = 'all' | 'gpu' | 'partial' | 'cpu';

export type ParamSizeFilter = 'all' | 'under-4b' | '7b-9b' | '12b-16b' | '20b-40b' | '70b-plus';

export interface DiscoveryFilters {
  task: TaskFilter;
  format: FormatFilter;
  alignment: AlignmentFilter;
  family: FamilyFilter;
  hardwareFit: HardwareFitFilter;
  paramSize: ParamSizeFilter;
}

export const DEFAULT_DISCOVERY_FILTERS: DiscoveryFilters = {
  task: 'all',
  format: 'all',
  alignment: 'all',
  family: 'all',
  hardwareFit: 'all',
  paramSize: 'all',
};

export type SortOption = 'trendingScore' | 'downloads' | 'likes' | 'lastModified';

export interface QuantOption {
  readonly id: string;
  readonly label: string;
  readonly bitsPerWeight: number;
  readonly sizeBytes: number;
  readonly filename: string;
  readonly qualityNote: string;
  readonly format: 'gguf' | 'safetensors' | 'fp8';
}

export interface DetectedRuntime {
  readonly runtimeId: RuntimeId;
  readonly displayName: string;
  readonly isHealthy: boolean;
  readonly endpointUrl: string;
  readonly version?: string;
}

export interface InstalledModelFile {
  readonly name: string;
  readonly sizeBytes: number;
  readonly role?: 'weights' | 'mmproj' | 'mtp' | 'adapter' | 'other';
}

export interface InstalledModelItem {
  readonly runtimeId: RuntimeId;
  readonly id: string;
  readonly sizeBytes: number;
  readonly modifiedAtIso: string;
  readonly files?: InstalledModelFile[];
  readonly checksumStatus?: 'verified' | 'mismatch' | 'unknown';
}

export interface OllamaRuntimeOptions {
  flashAttention: boolean;
  numParallel: number;
  keepAlive: '5m' | '30m' | '24h' | '-1';
  numCtx: number;
}

export interface LlamaCppRuntimeOptions {
  nGpuLayers: number;
  ctxSize: number;
  flashAttn: boolean;
  threads: number;
  batchSize: number;
}

export interface XollamaRuntimeOptions {
  thinkBudget: number;
  computeBackend: 'Vulkan' | 'CUDA' | 'AVX2' | 'AVX-512';
}

export interface VllmRuntimeOptions {
  gpuMemoryUtilization: number;
  maxModelLen: number;
}

export interface RuntimeOptionsConfig {
  ollama: OllamaRuntimeOptions;
  llamacpp: LlamaCppRuntimeOptions;
  xollama: XollamaRuntimeOptions;
  vllm: VllmRuntimeOptions;
}

export interface AppSettings {
  activeGpuId: string;
  safeVramHeadroomMb: number;
  defaultPresetIntent: PresetIntent;
  modelStoragePath: string;
  localCacheScanPaths: string[];
  hardwarePollingRateMs: 1000 | 2000 | 5000 | 0;
  telemetryOptIn: boolean;
  runtimeOptions: RuntimeOptionsConfig;
}

export interface IElectronAPI {
  getHardwareProfile(): Promise<HardwareProfile>;
  getLiveVramUsage(gpuIndex?: number): Promise<{ totalBytes: number; usedBytes: number; freeBytes: number }>;
  searchModels(query: string, options?: Record<string, unknown>): Promise<HfModelSearchResult[]>;
  getModelDetails(modelId: string): Promise<HfModelSearchResult>;
  resolveArtifacts(model: HfModelSearchResult): Promise<unknown>;
  getModelReadme(modelId: string): Promise<string | null>;
  getGenerationConfig(modelId: string): Promise<{ temperature?: number; top_p?: number; repetition_penalty?: number; top_k?: number } | null>;
  scanLocalModels(): Promise<unknown[]>;
  saveToken(token: string, accountName?: string): Promise<boolean>;
  getToken(accountName?: string): Promise<string | null>;
  removeToken(accountName?: string): Promise<boolean>;
  validateToken(token: string): Promise<{ valid: boolean; username?: string; error?: string }>;
  detectRuntimes(): Promise<DetectedRuntime[]>;
  listRuntimeModels(runtimeId?: RuntimeId): Promise<InstalledModelItem[]>;
  evaluateCompatibility(
    runtimeId: RuntimeId,
    artifacts: ArtifactFileTarget[],
    hw: HardwareProfile
  ): Promise<CompatibilityReport>;
  createInstallPlan(
    runtimeId: RuntimeId,
    modelId: string,
    selectedFilename: string | undefined,
    options?: Record<string, unknown>
  ): Promise<InstallPlan>;
  startInstall(planId: string): Promise<{ success: boolean; error?: string }>;
  cancelInstall(planId: string): Promise<boolean>;
  onInstallProgress(callback: (progress: InstallProgress) => void): () => void;
  runSmokeTest(runtimeId: RuntimeId, modelTag: string): Promise<VerificationResult>;
  getPreset(intent: PresetIntent): Promise<PurposePreset>;
  getJobs(): Promise<unknown[]>;
  openExternalUrl(url: string): Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI?: IElectronAPI;
  }
}
