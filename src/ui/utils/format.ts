import { HfModelSearchResult } from '../../types';
import { QuantOption } from '../types';

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
