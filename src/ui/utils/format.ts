import { HardwareProfile, HfModelSearchResult } from '../../types';
import { AppSettings, QuantOption, RuntimeOptionsConfig } from '../types';

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 GB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(decimals)} GB`;
  }
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb.toFixed(0)} MB`;
  }
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
}

export function formatCompactNumber(num?: number): string {
  if (!num || num <= 0) return '0';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return String(num);
}

export function formatContextLength(tokens: number): string {
  if (tokens >= 1024) {
    const k = Math.round(tokens / 1024);
    return `${k}K`;
  }
  return String(tokens);
}

export function formatRelativeDate(iso?: string): string {
  if (!iso) return 'Recently';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Recently';
  const diffDays = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  const months = Math.floor(diffDays / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export interface ModelArchitectureEstimate {
  readonly paramBillions: number;
  readonly layers: number;
  readonly kvHeads: number;
  readonly headDim: number;
}

/**
 * Infers parameter count and transformer geometry from model ID/tags for instant hardware sizing.
 */
export function estimateModelArchitecture(model: HfModelSearchResult): ModelArchitectureEstimate {
  const card = model.cardData || {};
  const idLower = model.id.toLowerCase();
  const match = idLower.match(/(\d+(?:\.\d+)?)b(?![a-z])/);
  let paramBillions = match ? parseFloat(match[1]) : 8;

  if (idLower.includes('8x7b')) paramBillions = 46.7;
  if (idLower.includes('8x22b')) paramBillions = 141;

  if (paramBillions <= 3.5) {
    return geometryFromCard(card, { paramBillions, layers: 28, kvHeads: 8, headDim: 128 });
  }
  if (paramBillions <= 9) {
    return geometryFromCard(card, { paramBillions, layers: 32, kvHeads: 8, headDim: 128 });
  }
  if (paramBillions <= 16) {
    return geometryFromCard(card, { paramBillions, layers: 40, kvHeads: 8, headDim: 128 });
  }
  if (paramBillions <= 35) {
    return geometryFromCard(card, { paramBillions, layers: 64, kvHeads: 8, headDim: 128 });
  }
  if (paramBillions <= 75) {
    return geometryFromCard(card, { paramBillions, layers: 80, kvHeads: 8, headDim: 128 });
  }
  return geometryFromCard(card, { paramBillions, layers: 96, kvHeads: 8, headDim: 128 });
}

function geometryFromCard(card: Record<string, unknown>, fallback: ModelArchitectureEstimate): ModelArchitectureEstimate {
  const number = (...keys: string[]) => keys.map((key) => Number(card[key])).find((n) => Number.isFinite(n) && n > 0);
  const layers = number('num_hidden_layers') ?? fallback.layers;
  const kvHeads = number('num_key_value_heads', 'num_attention_heads') ?? fallback.kvHeads;
  const hidden = number('hidden_size');
  const headDim = number('head_dim') ?? (hidden && number('num_attention_heads') ? hidden / number('num_attention_heads')! : fallback.headDim);
  return { ...fallback, layers, kvHeads, headDim };
}

const STANDARD_QUANT_PROFILES: Array<{
  id: string;
  label: string;
  bitsPerWeight: number;
  qualityNote: string;
  format: 'gguf' | 'safetensors' | 'fp8';
}> = [
  { id: 'Q2_K', label: 'Q2_K', bitsPerWeight: 2.6, qualityNote: '~89.0% accuracy (Extreme compression for constrained VRAM)', format: 'gguf' },
  { id: 'Q3_K_M', label: 'Q3_K_M', bitsPerWeight: 3.5, qualityNote: '~94.5% accuracy (Significant compression, noticeable logic loss)', format: 'gguf' },
  { id: 'IQ4_XS', label: 'IQ4_XS', bitsPerWeight: 4.25, qualityNote: '~97.8% accuracy (Importance matrix weighted 4-bit)', format: 'gguf' },
  { id: 'Q4_K_M', label: 'Q4_K_M', bitsPerWeight: 4.85, qualityNote: '~98.2% accuracy (Optimal speed & VRAM sweet spot for chat/code)', format: 'gguf' },
  { id: 'Q5_K_M', label: 'Q5_K_M', bitsPerWeight: 5.65, qualityNote: '~99.1% accuracy (Balanced precision, recommended for reasoning)', format: 'gguf' },
  { id: 'Q6_K', label: 'Q6_K', bitsPerWeight: 6.56, qualityNote: '~99.5% accuracy (High fidelity, imperceptible degradation)', format: 'gguf' },
  { id: 'Q8_0', label: 'Q8_0', bitsPerWeight: 8.5, qualityNote: '~99.8% accuracy (Near-lossless, minimal perplexity loss)', format: 'gguf' },
  { id: 'FP8', label: 'FP8', bitsPerWeight: 8.0, qualityNote: '~99.8% accuracy (Near-lossless, minimal perplexity loss)', format: 'fp8' },
];

export function buildQuantOptionsForModel(model: HfModelSearchResult): QuantOption[] {
  const siblings = model.siblings || [];
  const ggufSiblings = siblings.filter(
    (s) => s.rfilename.toLowerCase().endsWith('.gguf') && !s.rfilename.toLowerCase().includes('mmproj')
  );

  const arch = estimateModelArchitecture(model);
  const shortName = model.id.split('/').pop() || model.id;

  if (ggufSiblings.length > 0) {
    const mapped: QuantOption[] = [];
    for (const profile of STANDARD_QUANT_PROFILES) {
      const matched = ggufSiblings.find((s) =>
        s.rfilename.toUpperCase().includes(profile.id.toUpperCase())
      );
      if (matched) {
        const estimatedBytes =
          matched.size && matched.size > 0
            ? matched.size
            : Math.ceil(arch.paramBillions * 1_000_000_000 * (profile.bitsPerWeight / 8) * 1.05);
        mapped.push({
          id: profile.id,
          label: profile.label,
          bitsPerWeight: profile.bitsPerWeight,
          sizeBytes: estimatedBytes,
          filename: matched.rfilename,
          qualityNote: profile.qualityNote,
          format: profile.format,
        });
      }
    }
    if (mapped.length > 0) return mapped;
  }

  return STANDARD_QUANT_PROFILES.map((profile) => {
    const sizeBytes = Math.ceil(
      arch.paramBillions * 1_000_000_000 * (profile.bitsPerWeight / 8) * 1.06
    );
    const ext = profile.format === 'fp8' ? 'safetensors' : 'gguf';
    return {
      id: profile.id,
      label: profile.label,
      bitsPerWeight: profile.bitsPerWeight,
      sizeBytes,
      filename: `${shortName}-${profile.id}.${ext}`,
      qualityNote: profile.qualityNote,
      format: profile.format,
    };
  });
}

export function formatPipelineTag(tag?: string): string {
  if (!tag) return 'Text Generation';
  return tag
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export interface ContextProfile {
  readonly trainedContext: number;
  readonly maxContext: number;
  readonly isRopeScaled: boolean;
  readonly hasKnownMaxContext: boolean;
}

export function estimateContextProfile(model: HfModelSearchResult): ContextProfile {
  const cardData = model.cardData || {};
  const validContext = (value: unknown): number | null => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 2048 ? parsed : null;
  };
  const cardMax = validContext(cardData['max_position_embeddings']) ?? validContext(cardData['context_length']);
  const rawCardOriginal = Number(cardData['original_max_position_embeddings']);
  const cardOriginal = Number.isSafeInteger(rawCardOriginal) && rawCardOriginal >= 2048
    ? rawCardOriginal
    : 0;
  const rope = cardData['rope_scaling'];

  if (cardMax !== null) {
    const trained = cardOriginal && cardOriginal < cardMax ? cardOriginal : cardMax;
    return {
      trainedContext: trained,
      maxContext: cardMax,
      isRopeScaled: !!rope || (!!cardOriginal && cardOriginal < cardMax),
      hasKnownMaxContext: true,
    };
  }

  const idLower = model.id.toLowerCase();
  const tagsLower = (model.tags || []).map((t) => t.toLowerCase());

  // Check explicit context tags
  for (const t of tagsLower) {
    if (t === '256k') return { trainedContext: 32768, maxContext: 262144, isRopeScaled: true , hasKnownMaxContext: true};
    if (t === '128k') return { trainedContext: 8192, maxContext: 131072, isRopeScaled: true , hasKnownMaxContext: true};
    if (t === '64k') return { trainedContext: 8192, maxContext: 65536, isRopeScaled: true , hasKnownMaxContext: true};
    if (t === '32k') return { trainedContext: 8192, maxContext: 32768, isRopeScaled: true , hasKnownMaxContext: true};
    if (t === '16k') return { trainedContext: 16384, maxContext: 16384, isRopeScaled: false , hasKnownMaxContext: true};
    if (t === '8k') return { trainedContext: 8192, maxContext: 8192, isRopeScaled: false , hasKnownMaxContext: true};
    if (t === '4k') return { trainedContext: 4096, maxContext: 4096, isRopeScaled: false , hasKnownMaxContext: true};
  }

  // Known Architecture Family Context Defaults
  if (idLower.includes('llama-3.1') || idLower.includes('llama-3.2') || idLower.includes('llama-3.3') || idLower.includes('llama3.1') || idLower.includes('llama3.2') || idLower.includes('llama3.3')) {
    return { trainedContext: 8192, maxContext: 131072, isRopeScaled: true , hasKnownMaxContext: true};
  }
  if (idLower.includes('llama-3') || idLower.includes('llama3')) {
    return { trainedContext: 8192, maxContext: 8192, isRopeScaled: false , hasKnownMaxContext: true};
  }
  if (idLower.includes('llama-2') || idLower.includes('llama2')) {
    return { trainedContext: 4096, maxContext: 4096, isRopeScaled: false , hasKnownMaxContext: true};
  }
  if (idLower.includes('qwen2.5') || idLower.includes('qwq') || idLower.includes('qwen3')) {
    return { trainedContext: 32768, maxContext: 131072, isRopeScaled: true , hasKnownMaxContext: true};
  }
  if (idLower.includes('qwen2') || idLower.includes('qwen1.5')) {
    return { trainedContext: 32768, maxContext: 32768, isRopeScaled: false , hasKnownMaxContext: true};
  }
  if (idLower.includes('deepseek-r1') || idLower.includes('deepseek-v3')) {
    return { trainedContext: 64512, maxContext: 131072, isRopeScaled: true , hasKnownMaxContext: true};
  }
  if (idLower.includes('gemma-4') || idLower.includes('gemma4')) {
    return { trainedContext: 262144, maxContext: 262144, isRopeScaled: false , hasKnownMaxContext: true};
  }
  if (idLower.includes('gemma-2') || idLower.includes('gemma2')) {
    return { trainedContext: 8192, maxContext: 8192, isRopeScaled: false , hasKnownMaxContext: true};
  }
  if (idLower.includes('gemma-3') || idLower.includes('gemma3')) {
    return { trainedContext: 32768, maxContext: 131072, isRopeScaled: true , hasKnownMaxContext: true};
  }
  if (idLower.includes('phi-4')) {
    return { trainedContext: 16384, maxContext: 16384, isRopeScaled: false , hasKnownMaxContext: true};
  }
  if (idLower.includes('phi-3-mini-128k') || idLower.includes('phi-3-medium-128k')) {
    return { trainedContext: 4096, maxContext: 131072, isRopeScaled: true , hasKnownMaxContext: true};
  }
  if (idLower.includes('phi-3')) {
    return { trainedContext: 4096, maxContext: 4096, isRopeScaled: false , hasKnownMaxContext: true};
  }
  if (idLower.includes('mistral-small') || idLower.includes('mistral-nemo') || idLower.includes('ministral')) {
    return { trainedContext: 32768, maxContext: 32768, isRopeScaled: false , hasKnownMaxContext: true};
  }
  if (idLower.includes('mistral') || idLower.includes('mixtral')) {
    return { trainedContext: 32768, maxContext: 32768, isRopeScaled: false , hasKnownMaxContext: true};
  }
  if (idLower.includes('lfm3') || idLower.includes('lfm-3') || idLower.includes('liquid')) {
    return { trainedContext: 32768, maxContext: 32768, isRopeScaled: false , hasKnownMaxContext: true};
  }
  if (idLower.includes('ltx') || idLower.includes('diffusion') || idLower.includes('image-to-image') || idLower.includes('video')) {
    return { trainedContext: 4096, maxContext: 4096, isRopeScaled: false , hasKnownMaxContext: true};
  }
  if (idLower.includes('command-r')) {
    return { trainedContext: 131072, maxContext: 131072, isRopeScaled: false , hasKnownMaxContext: true};
  }
  if (idLower.includes('solar')) {
    return { trainedContext: 4096, maxContext: 4096, isRopeScaled: false , hasKnownMaxContext: true};
  }
  if (idLower.includes('smollm')) {
    return { trainedContext: 8192, maxContext: 8192, isRopeScaled: false , hasKnownMaxContext: true};
  }

  return { trainedContext: 8192, maxContext: 32768, isRopeScaled: false, hasKnownMaxContext: false };
}

export function estimateMaxContextTokens(model: HfModelSearchResult): number {
  return estimateContextProfile(model).maxContext;
}

export interface BestFitResult {
  readonly status: 'gpu' | 'minimal' | 'cpu';
  readonly label: string;
  readonly tokens: number;
  readonly hasKnownMaxContext: boolean;
}

// Round recommendations down to 2K increments; never advertise more than measured capacity.
const CONTEXT_RECOMMENDATION_STEP = 2048;

function hasKnownContextCeiling(model: HfModelSearchResult): boolean {
  return estimateContextProfile(model).hasKnownMaxContext;
}

export function calculateBestFitContext(
  model: HfModelSearchResult,
  hardware: HardwareProfile | null,
  activeGpuId?: string,
  safeHeadroomMb = 512,
  quantOption?: QuantOption | null
): BestFitResult | null {
  if (!hardware || hardware.gpus.length === 0) return null;

  const arch = estimateModelArchitecture(model);
  const selectedGpu =
    (activeGpuId ? hardware.gpus.find((g) => g.id === activeGpuId) : undefined) || hardware.gpus[0];

  const headroomBytes = safeHeadroomMb * 1024 * 1024;
  const effectiveAvailableVram = Math.max(0, selectedGpu.vramFreeBytes - headroomBytes);

  // Sum any mmproj / mtp siblings if present
  const extraArtifactBytes = (model.siblings || [])
    .filter((s) => {
      const n = s.rfilename.toLowerCase();
      return n.includes('mmproj') || n.includes('mtp');
    })
    .reduce((sum, s) => sum + (s.size || 0), 0);

  // If a specific quantization is selected, use its exact size; otherwise evaluate at primary Q4_K_M
  let weightBytes: number;
  if (quantOption && quantOption.sizeBytes > 0) {
    const quantFiles = (model.siblings || []).filter((s) =>
      s.rfilename.toUpperCase().includes(quantOption.id.toUpperCase())
    );
    const hasCompleteQuantFiles = quantFiles.length > 0 && quantFiles.every(
      (s) => Number.isFinite(s.size) && (s.size || 0) > 0
    );
    const conservativeEstimate = Math.ceil(
      arch.paramBillions * 1_000_000_000 * (quantOption.bitsPerWeight / 8) * 1.06
    );
    const selectedSize = hasCompleteQuantFiles
      ? quantFiles.reduce((sum, s) => sum + (s.size || 0), 0)
      : Math.max(quantOption.sizeBytes, conservativeEstimate);
    weightBytes = Math.ceil((selectedSize + extraArtifactBytes) * 1.15);
  } else {
    // Check if the repo has specific siblings to estimate accurate weight
    const siblings = model.siblings || [];
    const weightSiblings = siblings.filter((s) =>
      /\.GGUF$/i.test(s.rfilename) && !/MMPROJ|MTP/i.test(s.rfilename)
    );
    const q4km = weightSiblings.filter((s) => /Q4_K_M/i.test(s.rfilename));
    const q40 = weightSiblings.filter((s) => /Q4_0/i.test(s.rfilename));
    const selectedQ4 = q4km.length ? q4km : q40;
    const hasCompleteQ4Files = selectedQ4.length > 0 && selectedQ4.every(
      (s) => Number.isFinite(s.size) && (s.size || 0) > 0
    );
    if (hasCompleteQ4Files) {
      weightBytes = Math.ceil((selectedQ4.reduce((sum, s) => sum + (s.size || 0), 0) + extraArtifactBytes) * 1.15);
    } else {
      weightBytes = Math.ceil(
        (Math.max(
          selectedQ4.reduce((sum, s) => sum + (Number.isFinite(s.size) && (s.size || 0) > 0 ? s.size! : 0), 0),
          arch.paramBillions * 1_000_000_000 * (4.85 / 8) * 1.06
        ) + extraArtifactBytes) * 1.15
      );
    }
  }

  if (weightBytes > effectiveAvailableVram) {
    return { status: 'cpu', label: 'Estimated fit: CPU offload', tokens: 0, hasKnownMaxContext: hasKnownContextCeiling(model) };
  }

  const kvAvailable = effectiveAvailableVram - weightBytes;
  const bytesPerToken = 2 * arch.layers * arch.kvHeads * arch.headDim * 2 * 1.25; // FP16 KV cache plus conservative overhead
  const rawSafeTokens = bytesPerToken > 0 ? Math.floor(kvAvailable / bytesPerToken) : 0;
  
  const archMax = hasKnownContextCeiling(model) ? estimateContextProfile(model).maxContext : Infinity;
  const clamped = Math.min(rawSafeTokens, archMax);
  const snapped = Math.floor(clamped / CONTEXT_RECOMMENDATION_STEP) * CONTEXT_RECOMMENDATION_STEP;
  if (snapped < CONTEXT_RECOMMENDATION_STEP) return { status: 'minimal', label: 'Estimated fit: below 2K', tokens: 0, hasKnownMaxContext: hasKnownContextCeiling(model) };

  const ctxLabel = formatContextLength(snapped);
  const quantSuffix = quantOption ? ` (${quantOption.label})` : '';

  return {
    status: 'gpu',
    label: `Estimated recommended context: ${ctxLabel}${quantSuffix}`,
    tokens: snapped,
    hasKnownMaxContext: hasKnownContextCeiling(model),
  };
}

export interface ParsedInstalledModelName {
  readonly title: string;
  readonly author: string | null;
  readonly quant: string | null;
}

export function parseInstalledModelName(rawId: string): ParsedInstalledModelName {
  let cleaned = rawId.trim();
  if (cleaned.startsWith('hf.co/')) {
    cleaned = cleaned.slice('hf.co/'.length);
  } else if (cleaned.startsWith('https://huggingface.co/')) {
    cleaned = cleaned.slice('https://huggingface.co/'.length);
  }

  let quant: string | null = null;
  const colonIdx = cleaned.lastIndexOf(':');
  if (colonIdx > 0) {
    quant = cleaned.slice(colonIdx + 1);
    cleaned = cleaned.slice(0, colonIdx);
  }

  let author: string | null = null;
  let title = cleaned;
  const slashIdx = cleaned.indexOf('/');
  if (slashIdx > 0) {
    author = cleaned.slice(0, slashIdx);
    title = cleaned.slice(slashIdx + 1);
  }

  // Fallback quant extraction from .gguf filename if no :quant tag
  if (!quant && title.toLowerCase().endsWith('.gguf')) {
    const withoutExt = title.slice(0, -5);
    const quantMatch = withoutExt.match(/[-_]((?:IQ|Q)\d+_[A-Z0-9_]+|F16|BF16|Q8_0)$/i);
    if (quantMatch) {
      quant = quantMatch[1].toUpperCase();
      title = withoutExt.slice(0, quantMatch.index);
    } else {
      title = withoutExt;
    }
  }

  return { title, author, quant };
}

export const DEFAULT_RUNTIME_OPTIONS: RuntimeOptionsConfig = {
  ollama: {
    flashAttention: true,
    numParallel: 2,
    keepAlive: '30m',
    numCtx: 8192,
  },
  llamacpp: {
    nGpuLayers: 99,
    ctxSize: 8192,
    flashAttn: true,
    threads: 12,
    batchSize: 512,
  },
  xollama: {
    thinkBudget: 8192,
    computeBackend: 'Vulkan',
  },
  vllm: {
    gpuMemoryUtilization: 0.9,
    maxModelLen: 32768,
  },
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  activeGpuId: 'gpu-0',
  safeVramHeadroomMb: 512,
  defaultPresetIntent: 'instruct',
  modelStoragePath: '%USERPROFILE%\\.cache\\hf-browser\\models',
  localCacheScanPaths: [
    '%USERPROFILE%\\.cache\\huggingface\\hub\\',
    '%USERPROFILE%\\.ollama\\models\\',
    '%USERPROFILE%\\.cache\\lm-studio\\models\\',
  ],
  hardwarePollingRateMs: 2000,
  telemetryOptIn: false,
  runtimeOptions: DEFAULT_RUNTIME_OPTIONS,
};
