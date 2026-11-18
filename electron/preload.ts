import { contextBridge, ipcRenderer } from 'electron';
import {
  HardwareProfile,
  HfModelSearchResult,
  ArtifactFileTarget,
  CompatibilityReport,
  InstallPlan,
  InstallProgress,
  VerificationResult,
  RuntimeId,
  PresetIntent,
  PurposePreset
} from '../src/types';

export interface IElectronAPI {
  // Hardware
  getHardwareProfile(): Promise<HardwareProfile>;
  getLiveVramUsage(gpuIndex?: number): Promise<{ totalBytes: number; usedBytes: number; freeBytes: number }>;

  // Hugging Face
  searchModels(query: string, options?: Record<string, unknown>): Promise<HfModelSearchResult[]>;
  getModelDetails(modelId: string): Promise<HfModelSearchResult>;
  resolveArtifacts(model: HfModelSearchResult): Promise<any>;
  getModelReadme(modelId: string): Promise<string | null>;
  getGenerationConfig(modelId: string): Promise<{ temperature?: number; top_p?: number; repetition_penalty?: number; top_k?: number } | null>;

  // Credential Vault
  saveToken(token: string, accountName?: string): Promise<boolean>;
  getToken(accountName?: string): Promise<string | null>;
  removeToken(accountName?: string): Promise<boolean>;
  validateToken(token: string): Promise<{ valid: boolean; username?: string; error?: string }>;

  // Runtimes & Adapters
  detectRuntimes(): Promise<Array<{ runtimeId: RuntimeId; displayName: string; isHealthy: boolean; endpointUrl: string; version?: string }>>;
  listRuntimeModels(runtimeId?: RuntimeId): Promise<Array<{ runtimeId: RuntimeId; id: string; sizeBytes: number; modifiedAtIso: string }>>;
  evaluateCompatibility(runtimeId: RuntimeId, artifacts: ArtifactFileTarget[], hw: HardwareProfile): Promise<CompatibilityReport>;

  // Install & Verification
  createInstallPlan(runtimeId: RuntimeId, artifacts: ArtifactFileTarget[], hw: HardwareProfile, options?: Record<string, unknown>): Promise<InstallPlan>;
  startInstall(plan: InstallPlan): Promise<{ success: boolean; error?: string }>;
  cancelInstall(planId: string): Promise<boolean>;
  onInstallProgress(callback: (progress: InstallProgress) => void): () => void;
  runSmokeTest(runtimeId: RuntimeId, modelTag: string): Promise<VerificationResult>;

  // Cache Scanner & Presets
  scanLocalModels(): Promise<any[]>;
  getPreset(intent: PresetIntent): Promise<PurposePreset>;
  getJobs(): Promise<any[]>;
}

const electronAPI: IElectronAPI = {
  getHardwareProfile: () => ipcRenderer.invoke('hardware:getProfile'),
  getLiveVramUsage: (gpuIndex) => ipcRenderer.invoke('hardware:getLiveVramUsage', gpuIndex),

  searchModels: (query, options) => ipcRenderer.invoke('hf:search', query, options),
  getModelDetails: (modelId) => ipcRenderer.invoke('hf:getModelDetails', modelId),
  resolveArtifacts: (model) => ipcRenderer.invoke('hf:resolveArtifacts', model),
  getModelReadme: (modelId) => ipcRenderer.invoke('hf:getModelReadme', modelId),
  getGenerationConfig: (modelId) => ipcRenderer.invoke('hf:getGenerationConfig', modelId),

  saveToken: (token, accountName) => ipcRenderer.invoke('vault:saveToken', token, accountName),
  getToken: (accountName) => ipcRenderer.invoke('vault:getToken', accountName),
  removeToken: (accountName) => ipcRenderer.invoke('vault:removeToken', accountName),
  validateToken: (token) => ipcRenderer.invoke('vault:validateToken', token),

  detectRuntimes: () => ipcRenderer.invoke('runtimes:detectAll'),
  listRuntimeModels: (runtimeId) => ipcRenderer.invoke('runtimes:listModels', runtimeId),
  evaluateCompatibility: (runtimeId, artifacts, hw) => ipcRenderer.invoke('runtimes:evaluateCompatibility', runtimeId, artifacts, hw),

  createInstallPlan: (runtimeId, artifacts, hw, options) => ipcRenderer.invoke('install:createPlan', runtimeId, artifacts, hw, options),
  startInstall: (plan) => ipcRenderer.invoke('install:start', plan),
  cancelInstall: (planId) => ipcRenderer.invoke('install:cancel', planId),
  onInstallProgress: (callback) => {
    const subscription = (_event: any, progress: InstallProgress) => callback(progress);
    ipcRenderer.on('install:progress', subscription);
    return () => ipcRenderer.removeListener('install:progress', subscription);
  },
  runSmokeTest: (runtimeId, modelTag) => ipcRenderer.invoke('verify:runSmokeTest', runtimeId, modelTag),

  scanLocalModels: () => ipcRenderer.invoke('cache:scanLocalModels'),
  getPreset: (intent) => ipcRenderer.invoke('presets:get', intent),
  getJobs: () => ipcRenderer.invoke('jobs:list'),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
