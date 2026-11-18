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
  const idLower = model.id.toLowerCase();
  const match = idLower.match(/(\d+(?:\.\d+)?)b(?![a-z])/);
  let paramBillions = match ? parseFloat(match[1]) : 8;

  if (idLower.includes('8x7b')) paramBillions = 46.7;
  if (idLower.includes('8x22b')) paramBillions = 141;

  if (paramBillions <= 3.5) {
    return { paramBillions, layers: 28, kvHeads: 8, headDim: 128 };
  }
  if (paramBillions <= 9) {
    return { paramBillions, layers: 32, kvHeads: 8, headDim: 128 };
  }
  if (paramBillions <= 16) {
    return { paramBillions, layers: 40, kvHeads: 8, headDim: 128 };
  }
  if (paramBillions <= 35) {
    return { paramBillions, layers: 64, kvHeads: 8, headDim: 128 };
  }
  if (paramBillions <= 75) {
    return { paramBillions, layers: 80, kvHeads: 8, headDim: 128 };
  }
  return { paramBillions, layers: 96, kvHeads: 8, headDim: 128 };
}

const STANDARD_QUANT_PROFILES: Array<{
  id: string;
  label: string;
  bitsPerWeight: number;
  qualityNote: string;
  format: 'gguf' | 'safetensors' | 'fp8';
}> = [
  { id: 'IQ4_XS', label: 'IQ4_XS', bitsPerWeight: 4.25, qualityNote: 'Compact 4-bit', format: 'gguf' },
  { id: 'Q4_K_M', label: 'Q4_K_M', bitsPerWeight: 4.85, qualityNote: 'Recommended balance', format: 'gguf' },
  { id: 'Q5_K_M', label: 'Q5_K_M', bitsPerWeight: 5.65, qualityNote: 'High fidelity', format: 'gguf' },
  { id: 'Q6_K', label: 'Q6_K', bitsPerWeight: 6.56, qualityNote: 'Near-lossless', format: 'gguf' },
  { id: 'Q8_0', label: 'Q8_0', bitsPerWeight: 8.5, qualityNote: '8-bit reference', format: 'gguf' },
  { id: 'FP8', label: 'FP8', bitsPerWeight: 8.0, qualityNote: 'Tensor Core FP8', format: 'fp8' },
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

export function estimateMaxContextTokens(model: HfModelSearchResult): number {
  const cardCtx = model.cardData?.['max_position_embeddings'] ?? model.cardData?.['context_length'];
  if (typeof cardCtx === 'number' && cardCtx >= 2048) {
    return cardCtx;
  }
  const idLower = model.id.toLowerCase();
  if (idLower.includes('llama-3.1') || idLower.includes('llama-3.2') || idLower.includes('llama-3.3')) {
    return 131072;
  }
  if (idLower.includes('llama-3') || idLower.includes('gemma-2') || idLower.includes('gemma2')) {
    return 8192;
  }
  if (idLower.includes('gemma-3') || idLower.includes('qwen2.5') || idLower.includes('qwq') || idLower.includes('deepseek-r1')) {
    return 131072;
  }
  if (idLower.includes('phi-4')) {
    return 16384;
  }
  if (idLower.includes('mistral-small')) {
    return 32768;
  }
  return 32768;
}

export interface BestFitResult {
  readonly status: 'gpu' | 'minimal' | 'cpu';
  readonly label: string;
  readonly tokens: number;
}

const CONTEXT_STEPS = [131072, 65536, 32768, 16384, 8192, 4096, 2048] as const;

export function calculateBestFitContext(
  model: HfModelSearchResult,
  hardware: HardwareProfile | null,
  activeGpuId?: string,
  safeHeadroomMb = 512
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

  // Q4_K_M (4.85 bpw) with 1.15 runtime overhead
  const weightBytes = Math.ceil(
    (arch.paramBillions * 1_000_000_000 * (4.85 / 8) + extraArtifactBytes) * 1.15
  );

  if (weightBytes > effectiveAvailableVram) {
    return {
      status: 'cpu',
      label: 'Best Fit: CPU Offload',
      tokens: 0,
    };
  }

  const kvAvailable = effectiveAvailableVram - weightBytes;
  const bytesPerToken = 2 * arch.layers * arch.kvHeads * arch.headDim * 2; // FP16 KV cache
  const rawSafeTokens = bytesPerToken > 0 ? Math.floor(kvAvailable / bytesPerToken) : 0;
  const archMax = estimateMaxContextTokens(model);
  const clamped = Math.min(rawSafeTokens, archMax);

  const snapped = CONTEXT_STEPS.find((step) => clamped >= step);
  if (!snapped) {
    return {
      status: 'minimal',
      label: 'Best Fit: 2K (Minimal VRAM)',
      tokens: 2048,
    };
  }

  const ctxLabel = formatContextLength(snapped);
  return {
    status: 'gpu',
    label: snapped === 8192 && archMax === 8192 ? `Best Fit: ${ctxLabel} (Full GPU)` : `Best Fit: ${ctxLabel} context`,
    tokens: snapped,
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
