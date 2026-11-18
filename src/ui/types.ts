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

export type NavTabId = 'discover' | 'installed' | 'runtimes' | 'hardware' | 'settings';

export type ModelFilterChip = 'all' | 'gguf' | 'safetensors' | 'reasoning';

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

export interface InstalledModelItem {
  readonly runtimeId: RuntimeId;
  readonly id: string;
  readonly sizeBytes: number;
  readonly modifiedAtIso: string;
}

export interface IElectronAPI {
  getHardwareProfile(): Promise<HardwareProfile>;
  searchModels(query: string, options?: Record<string, unknown>): Promise<HfModelSearchResult[]>;
  getModelDetails(modelId: string): Promise<HfModelSearchResult>;
  resolveArtifacts(model: HfModelSearchResult): Promise<unknown>;
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
    artifacts: ArtifactFileTarget[],
    hw: HardwareProfile,
    options?: Record<string, unknown>
  ): Promise<InstallPlan>;
  startInstall(plan: InstallPlan): Promise<{ success: boolean; error?: string }>;
  cancelInstall(planId: string): Promise<boolean>;
  onInstallProgress(callback: (progress: InstallProgress) => void): () => void;
  runSmokeTest(runtimeId: RuntimeId, modelTag: string): Promise<VerificationResult>;
  getPreset(intent: PresetIntent): Promise<PurposePreset>;
  getJobs(): Promise<unknown[]>;
}

declare global {
  interface Window {
    electronAPI?: IElectronAPI;
  }
}
