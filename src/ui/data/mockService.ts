import {
  HardwareProfile,
  HfModelSearchResult,
  InstallProgress,
  RuntimeId,
  VerificationResult,
} from '../../types';
import {
  AlignmentFilter,
  DetectedRuntime,
  DiscoveryFilters,
  FamilyFilter,
  FormatFilter,
  InstalledModelItem,
  ParamSizeFilter,
  SortOption,
  TaskFilter,
} from '../types';
import { estimateModelArchitecture } from '../utils/format';

const UNCENSORED_KEYWORDS = [
  'ara',
  'ara-abliterated',
  'abliterated',
  'abbliterated',
  'ablation',
  'heretic',
  'fable-heretic',
  'uncensored-heretic',
  'unaligned',
  'de-aligned',
  'dealigned',
  'uncensored',
  'decensored',
  'unfiltered',
  'jailbreak',
  'jailbroken',
  'unrestricted',
  'no-refusal',
  'no-refusals',
  'raw',
  'freedom',
  'sydney',
  'dolphin',
  'mradermacher/abliterated',
  'davidau/defiant-fable-heretic',
  'huihui-ai/abliterated',
];

const FAMILY_KEYWORDS: Record<Exclude<FamilyFilter, 'all'>, string[]> = {
  llama: ['llama'],
  qwen: ['qwen', 'qwq'],
  deepseek: ['deepseek'],
  mistral: ['mistral', 'mixtral', 'codestral', 'pixtral'],
  gemma: ['gemma'],
  phi: ['phi-3', 'phi-3.5', 'phi-4', 'phi3', 'phi4', 'microsoft/phi'],
  lfm: ['lfm', 'liquid'],
  'command-r': ['command-r', 'c4ai-command'],
  starcoder: ['starcoder'],
  glm: ['glm', 'chatglm'],
  yi: ['01-ai/yi', 'yi-1.5', 'yi-large', '/yi-'],
  internlm: ['internlm'],
  exaone: ['exaone'],
  solar: ['solar'],
  smollm: ['smollm', 'smolvlm'],
};

function isUncensoredModel(m: HfModelSearchResult): boolean {
  const haystack = `${m.id} ${m.description || ''} ${(m.tags || []).join(' ')}`.toLowerCase();
  return UNCENSORED_KEYWORDS.some((kw) => haystack.includes(kw));
}

function matchesTask(m: HfModelSearchResult, task: TaskFilter): boolean {
  if (task === 'all') return true;
  const normalize = (tag: string) => tag.trim().toLowerCase().replace(/_/g, '-');
  const tags = (m.tags || []).map(normalize);

  if (task === 'coding') {
    return tags.some((tag) => tag.includes('code') || tag.includes('coding'));
  }
  return tags.includes(normalize(task));
}

function matchesFormat(m: HfModelSearchResult, format: FormatFilter): boolean {
  if (format === 'all') return true;
  const tags = (m.tags || []).map((t) => t.toLowerCase());
  const idLower = m.id.toLowerCase();
  const files = (m.siblings || []).map((s) => s.rfilename.toLowerCase());

  if (format === 'gguf') {
    return tags.includes('gguf') || idLower.includes('gguf') || files.some((f) => f.endsWith('.gguf'));
  }
  if (format === 'safetensors') {
    return tags.includes('safetensors') || files.some((f) => f.endsWith('.safetensors'));
  }
  if (format === 'fp8') {
    return (
      tags.includes('fp8') ||
      tags.includes('w8a8') ||
      idLower.includes('fp8') ||
      files.some((f) => f.includes('fp8'))
    );
  }
  return true;
}

function matchesAlignment(m: HfModelSearchResult, alignment: AlignmentFilter): boolean {
  if (alignment === 'all') return true;
  const uncensored = isUncensoredModel(m);
  return alignment === 'uncensored' ? uncensored : !uncensored;
}

function matchesFamily(m: HfModelSearchResult, family: FamilyFilter): boolean {
  if (family === 'all') return true;
  const haystack = `${m.id} ${(m.tags || []).join(' ')}`.toLowerCase();
  const keywords = FAMILY_KEYWORDS[family];
  return keywords.some((kw) => haystack.includes(kw));
}

function matchesParamSize(m: HfModelSearchResult, paramSize: ParamSizeFilter): boolean {
  if (paramSize === 'all') return true;
  const { paramBillions } = estimateModelArchitecture(m);
  switch (paramSize) {
    case 'under-4b':
      return paramBillions < 4;
    case '7b-9b':
      return paramBillions >= 7 && paramBillions <= 9.5;
    case '12b-16b':
      return paramBillions >= 12 && paramBillions <= 16.5;
    case '20b-40b':
      return paramBillions >= 20 && paramBillions <= 40.5;
    case '70b-plus':
      return paramBillions >= 70;
    default:
      return true;
  }
}

export function applyDiscoveryFilters(
  models: HfModelSearchResult[],
  filters: DiscoveryFilters
): HfModelSearchResult[] {
  return models.filter(
    (m) =>
      matchesTask(m, filters.task) &&
      matchesFormat(m, filters.format) &&
      matchesAlignment(m, filters.alignment) &&
      matchesFamily(m, filters.family) &&
      matchesParamSize(m, filters.paramSize)
  );
}

export function selectHubFilter(filters: DiscoveryFilters): string | undefined {
  if (filters.task !== 'all' && filters.task !== 'coding') return filters.task;
  if (filters.format === 'gguf' || filters.format === 'safetensors') return filters.format;
  return undefined;
}

export const MOCK_HARDWARE_PROFILE: HardwareProfile = {
  gpus: [
    {
      id: 'gpu-0',
      name: 'AMD Radeon RX 7800 XT',
      vendor: 'amd',
      vramTotalBytes: 16 * 1024 * 1024 * 1024,
      vramFreeBytes: 14.8 * 1024 * 1024 * 1024,
      driverVersion: '24.12.1',
      computeCapability: 'gfx1101 (RDNA 3)',
    },
  ],
  systemRamTotalBytes: 64 * 1024 * 1024 * 1024,
  systemRamAvailableBytes: 44.2 * 1024 * 1024 * 1024,
  cpuArchitecture: 'x86_64',
  cpuLogicalCores: 16,
  supportsAvx2: true,
  supportsAvx512: true,
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
    id: 'hf.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-14B:Q4_K_M',
    sizeBytes: 9_190_000_000,
    modifiedAtIso: new Date(Date.now() - 86400000).toISOString(),
    checksumStatus: 'verified',
    files: [
      {
        name: 'DeepSeek-R1-Distill-Qwen-14B-Q4_K_M.gguf',
        sizeBytes: 8_990_000_000,
        role: 'weights',
      },
      {
        name: 'deepseek-r1-mtp-head-f16.gguf',
        sizeBytes: 200_000_000,
        role: 'mtp',
      },
    ],
  },
  {
    runtimeId: 'ollama',
    id: 'hf.co/google/gemma-3-12b-it:Q4_K_M',
    sizeBytes: 8_420_000_000,
    modifiedAtIso: new Date(Date.now() - 3 * 86400000).toISOString(),
    checksumStatus: 'verified',
    files: [
      {
        name: 'gemma-3-12b-it-Q4_K_M.gguf',
        sizeBytes: 7_580_000_000,
        role: 'weights',
      },
      {
        name: 'mmproj-gemma-3-12b-it-f16.gguf',
        sizeBytes: 840_000_000,
        role: 'mmproj',
      },
    ],
  },
  {
    runtimeId: 'llamacpp',
    id: 'hf.co/bartowski/Llama-3.1-8B-Instruct-GGUF:Q5_K_M',
    sizeBytes: 5_730_000_000,
    modifiedAtIso: new Date(Date.now() - 9 * 86400000).toISOString(),
    checksumStatus: 'verified',
    files: [
      {
        name: 'Meta-Llama-3.1-8B-Instruct-Q5_K_M.gguf',
        sizeBytes: 5_730_000_000,
        role: 'weights',
      },
    ],
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
    filters: DiscoveryFilters,
    sort: SortOption
  ): Promise<HfModelSearchResult[]> {
    if (window.electronAPI) {
      const apiFilter = selectHubFilter(filters);

      const searchTerms: string[] = [];
      if (query.trim()) searchTerms.push(query.trim());
      if (filters.family !== 'all' && !query.toLowerCase().includes(filters.family)) {
        searchTerms.push(filters.family === 'lfm' ? 'LFM' : filters.family);
      }
      if (filters.alignment === 'uncensored' && !query.trim()) {
        searchTerms.push('abliterated');
      }
      if (filters.task === 'coding' && !query.toLowerCase().includes('code')) {
        searchTerms.push('coder');
      }

      const raw = await window.electronAPI.searchModels(searchTerms.join(' '), {
        filter: apiFilter,
        sort,
        limit: 50,
      });
      return applyDiscoveryFilters(raw, filters);
    }

    const q = query.trim().toLowerCase();
    const queryFiltered = MOCK_MODELS.filter((m) => {
      return (
        !q ||
        m.id.toLowerCase().includes(q) ||
        m.author.toLowerCase().includes(q) ||
        (m.description || '').toLowerCase().includes(q) ||
        (m.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    });

    let results = applyDiscoveryFilters(queryFiltered, filters);

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

  async getLiveVramUsage(gpuIndex?: number): Promise<{ totalBytes: number; usedBytes: number; freeBytes: number }> {
    if (window.electronAPI) {
      return window.electronAPI.getLiveVramUsage(gpuIndex);
    }
    const total = 16 * 1024 * 1024 * 1024;
    const used = 2.5 * 1024 * 1024 * 1024;
    return { totalBytes: total, usedBytes: used, freeBytes: total - used };
  },

  async getModelReadme(modelId: string): Promise<string | null> {
    if (window.electronAPI) {
      return window.electronAPI.getModelReadme(modelId);
    }
    return `# ${modelId}\n\nOfficial Hugging Face Model Card documentation and model specifications.\n\n### Model Architecture\n- Architecture: Transformer / CausalLM\n- Context Window: Up to 128K\n- Quantization: GGUF / SafeTensors\n\n### Usage\nReady for local deployment into Ollama or llama.cpp.`;
  },

  async getModelGenerationConfig(modelId: string): Promise<{ temperature?: number; top_p?: number; repetition_penalty?: number; top_k?: number } | null> {
    if (window.electronAPI) {
      return window.electronAPI.getGenerationConfig(modelId);
    }
    return { temperature: 0.7, top_p: 0.9, repetition_penalty: 1.1, top_k: 40 };
  },

  async scanLocalModels(): Promise<any[]> {
    if (window.electronAPI) {
      return window.electronAPI.scanLocalModels();
    }
    return [];
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

  async openExternalUrl(url: string): Promise<boolean> {
    if (window.electronAPI && typeof window.electronAPI.openExternalUrl === 'function') {
      return window.electronAPI.openExternalUrl(url);
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  },
};
