export type RuntimeId = 'llamacpp' | 'ollama' | 'xollama' | 'vllm' | 'custom_openai';
export type CapabilityStatus = 'supported' | 'unsupported' | 'conditional' | 'unknown';
export type EvidenceConfidence = 'verified_test' | 'documented' | 'inferred' | 'community' | 'unknown';
export type ModelFormat = 'gguf' | 'safetensors' | 'awq' | 'gptq' | 'fp8' | 'unknown';

export interface RuntimeVersion {
  readonly raw: string;
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly buildCommit?: string;
}

export interface RuntimeEnvironment {
  readonly runtimeId: RuntimeId;
  readonly version: RuntimeVersion;
  readonly executablePath?: string;
  readonly endpointUrl: string;
}

export interface GpuDeviceInfo {
  readonly id: string;
  readonly name: string;
  readonly vendor: 'nvidia' | 'amd' | 'intel' | 'qualcomm' | 'unknown';
  readonly vramTotalBytes: number;
  readonly vramFreeBytes: number;
  readonly driverVersion: string;
  readonly computeCapability?: string;
}

export interface HardwareProfile {
  readonly gpus: GpuDeviceInfo[];
  readonly systemRamTotalBytes: number;
  readonly systemRamAvailableBytes: number;
  readonly cpuArchitecture: 'x86_64' | 'arm64';
  readonly cpuLogicalCores: number;
  readonly supportsAvx2: boolean;
  readonly supportsAvx512: boolean;
  readonly capturedAtIso: string;
}

export interface ArtifactFileTarget {
  readonly fileId: string;
  readonly remoteUrl: string;
  readonly destinationRelativePath: string;
  readonly expectedSizeBytes: number;
  readonly sha256Checksum?: string;
  readonly role: 'primary_weights' | 'shard' | 'vision_projector' | 'tokenizer_config' | 'chat_template' | 'license';
}

export interface CompatibilityReport {
  readonly reportId: string;
  readonly runtimeId: RuntimeId;
  readonly status: CapabilityStatus;
  readonly format: ModelFormat;
  readonly reason: string;
  readonly confidence: EvidenceConfidence;
  readonly estimatedVramBytes: number;
  readonly estimatedSystemRamBytes: number;
  readonly fitsInGpuVram: boolean;
  readonly maxOffloadLayers: number;
  readonly recommendedContextLength: number;
  readonly recommendedFlags: Record<string, string | number | boolean>;
  readonly blockers: string[];
  readonly warnings: string[];
}

export interface InstallStep {
  readonly stepId: string;
  readonly sequence: number;
  readonly type: 'http_download' | 'file_move' | 'create_modelfile' | 'cli_exec' | 'api_register';
  readonly description: string;
  readonly payload: Record<string, unknown>;
  readonly rollbackAction?: 'delete_file' | 'unregister_model' | 'noop';
}

export interface InstallPlan {
  readonly planId: string;
  readonly runtimeId: RuntimeId;
  readonly modelRepo: string;
  readonly revision: string;
  readonly artifactFiles: ArtifactFileTarget[];
  readonly totalDownloadBytes: number;
  readonly requiredDiskSpaceBytes: number;
  readonly steps: InstallStep[];
  readonly verificationConfig: {
    readonly testEndpoint: string;
    readonly testModelTag: string;
    readonly testPrompt: string;
    readonly maxTimeoutSeconds: number;
  };
  readonly createdAtIso: string;
}

export interface InstallProgress {
  readonly planId: string;
  readonly currentStepIndex: number;
  readonly totalSteps: number;
  readonly stepDescription: string;
  readonly bytesDownloaded: number;
  readonly bytesTotal: number;
  readonly percentComplete: number;
  readonly downloadSpeedBytesPerSec: number;
}

export interface VerificationResult {
  readonly passed: boolean;
  readonly modelLoadedSuccessfully: boolean;
  readonly tokensGeneratedCount: number;
  readonly latencyToFirstTokenMs: number;
  readonly tokensPerSecond: number;
  readonly rawOutputSample?: string;
  readonly errorMessage?: string;
}

export interface IRuntimeAdapter {
  readonly id: RuntimeId;
  readonly displayName: string;
  detect(): Promise<RuntimeEnvironment | null>;
  healthCheck(): Promise<{ readonly isHealthy: boolean; readonly message?: string }>;
  listInstalledModels(): Promise<Array<{ readonly id: string; readonly sizeBytes: number; readonly modifiedAtIso: string }>>;
  evaluateCompatibility(artifact: ArtifactFileTarget[], hw: HardwareProfile): Promise<CompatibilityReport>;
  createInstallPlan(artifact: ArtifactFileTarget[], hw: HardwareProfile, customOptions?: Record<string, unknown>): Promise<InstallPlan>;
  executeInstall(plan: InstallPlan, onProgress: (p: InstallProgress) => void, cancelSignal: AbortSignal): Promise<boolean>;
  verifyInstall(plan: InstallPlan): Promise<VerificationResult>;
  uninstallModel(modelTag: string): Promise<boolean>;
}

// Hugging Face API Types
export interface HfModelSibling {
  readonly rfilename: string;
  readonly size?: number;
  readonly blobId?: string;
}

export interface HfModelCard {
  readonly pipeline_tag?: string;
  readonly library_name?: string;
  readonly tags?: string[];
  readonly base_model?: string | string[];
  readonly license?: string;
  readonly [key: string]: unknown;
}

export interface HfModelSearchResult {
  readonly id: string;
  readonly author: string;
  readonly sha?: string;
  readonly lastModified?: string;
  readonly private?: boolean;
  readonly gated?: boolean | string;
  readonly disabled?: boolean;
  readonly downloads?: number;
  readonly likes?: number;
  readonly pipeline_tag?: string;
  readonly library?: string;
  readonly tags?: string[];
  readonly siblings?: HfModelSibling[];
  readonly cardData?: HfModelCard;
  readonly description?: string;
}

export interface HfWhoAmI {
  readonly name: string;
  readonly fullname?: string;
  readonly email?: string;
  readonly type: 'user' | 'organization';
  readonly orgs?: Array<{ readonly name: string; readonly fullname?: string }>;
}

// Purpose Preset Types
export type PresetIntent = 'instruct' | 'reasoning' | 'coding' | 'creative';

export interface PurposePreset {
  readonly intent: PresetIntent;
  readonly displayName: string;
  readonly temperature: number;
  readonly topP: number;
  readonly topK: number;
  readonly minP: number;
  readonly repeatPenalty: number;
  readonly presencePenalty: number;
  readonly frequencyPenalty: number;
  readonly thinkBudgetTokens?: number;
  readonly description: string;
}
