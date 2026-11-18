import {
  HardwareProfile,
  HfModelSearchResult,
  InstallProgress,
  RuntimeId,
  VerificationResult,
} from '../../types';
import { DetectedRuntime, InstalledModelItem, ModelFilterChip, SortOption } from '../types';

export const MOCK_HARDWARE_PROFILE: HardwareProfile = {
  gpus: [
    {
      id: 'gpu-0',
      name: 'NVIDIA GeForce RTX 4080 SUPER',
      vendor: 'nvidia',
      vramTotalBytes: 16 * 1024 * 1024 * 1024,
      vramFreeBytes: 14.5 * 1024 * 1024 * 1024,
      driverVersion: '566.36',
      computeCapability: '8.9',
    },
  ],
  systemRamTotalBytes: 64 * 1024 * 1024 * 1024,
  systemRamAvailableBytes: 42.4 * 1024 * 1024 * 1024,
  cpuArchitecture: 'x86_64',
  cpuLogicalCores: 24,
  supportsAvx2: true,
  supportsAvx512: false,
  capturedAtIso: new Date().toISOString(),
};

export const MOCK_RUNTIMES: DetectedRuntime[] = [
  {
    runtimeId: 'ollama',
    displayName: 'Ollama',
    isHealthy: true,
    endpointUrl: 'http://127.0.0.1:11434',
    version: '0.5.7',
  },
  {
    runtimeId: 'llamacpp',
    displayName: 'llama.cpp',
    isHealthy: true,
    endpointUrl: 'http://127.0.0.1:8080',
    version: 'b4512-cuda',
  },
  {
    runtimeId: 'xollama',
    displayName: 'xollama',
    isHealthy: false,
    endpointUrl: 'http://127.0.0.1:11435',
    version: undefined,
  },
  {
    runtimeId: 'vllm',
    displayName: 'vLLM',
    isHealthy: false,
    endpointUrl: 'http://127.0.0.1:8000',
    version: undefined,
  },
];

export const MOCK_MODELS: HfModelSearchResult[] = [
  {
    id: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-14B',
    author: 'deepseek-ai',
    downloads: 1842300,
    likes: 6420,
    pipeline_tag: 'text-generation',
    lastModified: new Date(Date.now() - 2 * 86400000).toISOString(),
    gated: false,
    tags: ['gguf', 'reasoning', 'deepseek-r1', 'thinking', 'qwen2'],
    description: 'High-efficiency distilled reasoning model with native chain-of-thought <think> traces.',
    siblings: [
      { rfilename: 'DeepSeek-R1-Distill-Qwen-14B-IQ4_XS.gguf', size: 7_950_000_000 },
      { rfilename: 'DeepSeek-R1-Distill-Qwen-14B-Q4_K_M.gguf', size: 8_990_000_000 },
      { rfilename: 'DeepSeek-R1-Distill-Qwen-14B-Q5_K_M.gguf', size: 10_520_000_000 },
      { rfilename: 'DeepSeek-R1-Distill-Qwen-14B-Q8_0.gguf', size: 15_700_000_000 },
    ],
  },
  {
    id: 'Qwen/Qwen2.5-Coder-14B-Instruct-GGUF',
    author: 'Qwen',
    downloads: 1295000,
    likes: 4180,
    pipeline_tag: 'text-generation',
    lastModified: new Date(Date.now() - 5 * 86400000).toISOString(),
    gated: false,
    tags: ['gguf', 'coding', 'qwen2.5', 'instruct'],
    description: 'Specialized coding assistant supporting 90+ programming languages and repository-scale context.',
    siblings: [
      { rfilename: 'qwen2.5-coder-14b-instruct-iq4_xs.gguf', size: 7_820_000_000 },
      { rfilename: 'qwen2.5-coder-14b-instruct-q4_k_m.gguf', size: 8_980_000_000 },
      { rfilename: 'qwen2.5-coder-14b-instruct-q6_k.gguf', size: 12_150_000_000 },
      { rfilename: 'qwen2.5-coder-14b-instruct-q8_0.gguf', size: 15_680_000_000 },
    ],
  },
  {
    id: 'meta-llama/Llama-3.3-70B-Instruct',
    author: 'meta-llama',
    downloads: 3420000,
    likes: 11250,
    pipeline_tag: 'text-generation',
    lastModified: new Date(Date.now() - 8 * 86400000).toISOString(),
    gated: true,
    tags: ['safetensors', 'llama-3.3', 'instruct', 'transformers'],
    description: 'Flagship multilingual 70B instruction-tuned model. Requires gated repository access token.',
    siblings: [
      { rfilename: 'model-00001-of-00030.safetensors', size: 4_800_000_000 },
      { rfilename: 'config.json', size: 1024 },
    ],
  },
  {
    id: 'Qwen/QwQ-32B-GGUF',
    author: 'Qwen',
    downloads: 945000,
    likes: 3890,
    pipeline_tag: 'text-generation',
    lastModified: new Date(Date.now() - 1 * 86400000).toISOString(),
    gated: false,
    tags: ['gguf', 'reasoning', 'qwq', 'thinking'],
    description: 'Medium-scale reasoning powerhouse trained with reinforcement learning for math and logic.',
    siblings: [
      { rfilename: 'qwq-32b-iq4_xs.gguf', size: 17_800_000_000 },
      { rfilename: 'qwq-32b-q4_k_m.gguf', size: 19_850_000_000 },
      { rfilename: 'qwq-32b-q8_0.gguf', size: 34_800_000_000 },
    ],
  },
  {
    id: 'google/gemma-3-12b-it',
    author: 'google',
    downloads: 780000,
    likes: 2940,
    pipeline_tag: 'image-text-to-text',
    lastModified: new Date(Date.now() - 3 * 86400000).toISOString(),
    gated: true,
    tags: ['safetensors', 'vision', 'gemma3', 'multimodal'],
    description: 'Multimodal vision-language model with 128K context window and compact footprint.',
    siblings: [{ rfilename: 'model-00001-of-00005.safetensors', size: 4_900_000_000 }],
  },
  {
    id: 'bartowski/Llama-3.1-8B-Instruct-GGUF',
    author: 'bartowski',
    downloads: 2510000,
    likes: 3120,
    pipeline_tag: 'text-generation',
    lastModified: new Date(Date.now() - 14 * 86400000).toISOString(),
    gated: false,
    tags: ['gguf', 'llama-3.1', 'instruct'],
    description: 'Ultra-fast 8B general-purpose model with crisp quantizations for single-GPU local inference.',
    siblings: [
      { rfilename: 'Meta-Llama-3.1-8B-Instruct-IQ4_XS.gguf', size: 4_420_000_000 },
      { rfilename: 'Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf', size: 4_920_000_000 },
      { rfilename: 'Meta-Llama-3.1-8B-Instruct-Q5_K_M.gguf', size: 5_730_000_000 },
      { rfilename: 'Meta-Llama-3.1-8B-Instruct-Q8_0.gguf', size: 8_540_000_000 },
    ],
  },
  {
    id: 'microsoft/phi-4-GGUF',
    author: 'microsoft',
    downloads: 615000,
    likes: 2410,
    pipeline_tag: 'text-generation',
    lastModified: new Date(Date.now() - 10 * 86400000).toISOString(),
    gated: false,
    tags: ['gguf', 'phi-4', 'reasoning', 'stem'],
    description: '14B synthetic-data-trained model excelling at STEM reasoning and structured instruction following.',
    siblings: [
      { rfilename: 'phi-4-IQ4_XS.gguf', size: 7_900_000_000 },
      { rfilename: 'phi-4-Q4_K_M.gguf', size: 9_050_000_000 },
      { rfilename: 'phi-4-Q8_0.gguf', size: 15_600_000_000 },
    ],
  },
  {
    id: 'mistralai/Mistral-Small-24B-Instruct-2501',
    author: 'mistralai',
    downloads: 520000,
    likes: 1870,
    pipeline_tag: 'text-generation',
    lastModified: new Date(Date.now() - 6 * 86400000).toISOString(),
    gated: false,
    tags: ['safetensors', 'mistral', 'instruct'],
    description: 'Low-latency 24B dense model engineered for enterprise function calling and local deployment.',
    siblings: [{ rfilename: 'model-00001-of-00010.safetensors', size: 4_850_000_000 }],
  },
];

export const MOCK_INSTALLED_MODELS: InstalledModelItem[] = [
  {
    runtimeId: 'ollama',
    id: 'deepseek-r1:14b-q4_k_m',
    sizeBytes: 8_990_000_000,
    modifiedAtIso: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    runtimeId: 'ollama',
    id: 'qwen2.5-coder:14b',
    sizeBytes: 8_980_000_000,
    modifiedAtIso: new Date(Date.now() - 4 * 86400000).toISOString(),
  },
  {
    runtimeId: 'llamacpp',
    id: 'Meta-Llama-3.1-8B-Instruct-Q5_K_M.gguf',
    sizeBytes: 5_730_000_000,
    modifiedAtIso: new Date(Date.now() - 9 * 86400000).toISOString(),
  },
];

let memoryToken: string | null = null;

export const bridgeService = {
  async getHardwareProfile(): Promise<HardwareProfile> {
    if (window.electronAPI) {
      return window.electronAPI.getHardwareProfile();
    }
    return { ...MOCK_HARDWARE_PROFILE, capturedAtIso: new Date().toISOString() };
  },

  async detectRuntimes(): Promise<DetectedRuntime[]> {
    if (window.electronAPI) {
      return window.electronAPI.detectRuntimes();
    }
    return MOCK_RUNTIMES;
  },

  async searchModels(
    query: string,
    filter: ModelFilterChip,
    sort: SortOption
  ): Promise<HfModelSearchResult[]> {
    if (window.electronAPI) {
      const filterStr =
        filter === 'gguf'
          ? 'gguf'
          : filter === 'safetensors'
            ? 'safetensors'
            : filter === 'reasoning'
              ? 'reasoning'
              : undefined;
      return window.electronAPI.searchModels(query, {
        filter: filterStr,
        sort,
        limit: 30,
      });
    }

    const q = query.trim().toLowerCase();
    let results = MOCK_MODELS.filter((m) => {
      const matchesQuery =
        !q ||
        m.id.toLowerCase().includes(q) ||
        m.author.toLowerCase().includes(q) ||
        (m.tags || []).some((t) => t.toLowerCase().includes(q));

      if (!matchesQuery) return false;

      if (filter === 'gguf') {
        return (m.tags || []).includes('gguf') || m.id.toLowerCase().includes('gguf');
      }
      if (filter === 'safetensors') {
        return (m.tags || []).includes('safetensors');
      }
      if (filter === 'reasoning') {
        const idL = m.id.toLowerCase();
        return (
          idL.includes('deepseek-r1') ||
          idL.includes('qwq') ||
          (m.tags || []).some((t) => t === 'reasoning' || t === 'thinking')
        );
      }
      return true;
    });

    results = [...results].sort((a, b) => {
      if (sort === 'downloads') return (b.downloads || 0) - (a.downloads || 0);
      if (sort === 'likes') return (b.likes || 0) - (a.likes || 0);
      if (sort === 'lastModified') {
        return new Date(b.lastModified || 0).getTime() - new Date(a.lastModified || 0).getTime();
      }
      return (b.likes || 0) * 10 + (b.downloads || 0) * 0.01 - ((a.likes || 0) * 10 + (a.downloads || 0) * 0.01);
    });

    return results;
  },

  async listInstalledModels(): Promise<InstalledModelItem[]> {
    if (window.electronAPI) {
      return window.electronAPI.listRuntimeModels();
    }
    return MOCK_INSTALLED_MODELS;
  },

  async simulateOrRunDeploy(
    runtimeId: RuntimeId,
    modelId: string,
    totalBytes: number,
    onProgress: (p: InstallProgress) => void,
    signal: AbortSignal
  ): Promise<{ success: boolean; error?: string }> {
    const planId = `plan-${Date.now()}`;
    const steps = [
      'Verifying target disk space & SHA-256 manifest',
      `Downloading weights for ${modelId.split('/').pop()}`,
      `Generating ${runtimeId} runtime configuration & preset`,
      `Registering model with ${runtimeId} local server`,
    ];

    for (let pct = 0; pct <= 100; pct += 4) {
      if (signal.aborted) {
        return { success: false, error: 'Deployment cancelled by user.' };
      }
      const stepIdx = Math.min(Math.floor((pct / 100) * steps.length), steps.length - 1);
      onProgress({
        planId,
        currentStepIndex: stepIdx,
        totalSteps: steps.length,
        stepDescription: steps[stepIdx],
        bytesDownloaded: Math.round((pct / 100) * totalBytes),
        bytesTotal: totalBytes,
        percentComplete: pct,
        downloadSpeedBytesPerSec: 185 * 1024 * 1024,
      });
      await new Promise((r) => setTimeout(r, 70));
    }
    return { success: true };
  },

  async runSmokeTest(runtimeId: RuntimeId, modelTag: string): Promise<VerificationResult> {
    if (window.electronAPI) {
      return window.electronAPI.runSmokeTest(runtimeId, modelTag);
    }
    await new Promise((r) => setTimeout(r, 650));
    const isLarge = modelTag.toLowerCase().includes('32b') || modelTag.toLowerCase().includes('70b');
    return {
      passed: true,
      modelLoadedSuccessfully: true,
      tokensGeneratedCount: 42,
      latencyToFirstTokenMs: isLarge ? 312 : 118,
      tokensPerSecond: isLarge ? 34.6 : 78.4,
      rawOutputSample:
        'Ready. Local inference verified on Windows 11 GPU backend with zero quantization drift.',
    };
  },

  async getToken(): Promise<string | null> {
    if (window.electronAPI) return window.electronAPI.getToken();
    return memoryToken;
  },

  async saveToken(token: string): Promise<boolean> {
    if (window.electronAPI) return window.electronAPI.saveToken(token);
    memoryToken = token;
    return true;
  },

  async removeToken(): Promise<boolean> {
    if (window.electronAPI) return window.electronAPI.removeToken();
    memoryToken = null;
    return true;
  },

  async validateToken(token: string): Promise<{ valid: boolean; username?: string; error?: string }> {
    if (window.electronAPI) return window.electronAPI.validateToken(token);
    if (token.startsWith('hf_') && token.length >= 10) {
      return { valid: true, username: 'local-windows-user' };
    }
    return { valid: false, error: 'Token should start with "hf_" and be at least 10 characters.' };
  },
};
