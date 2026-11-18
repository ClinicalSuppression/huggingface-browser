import React from 'react';
import { Layers, Database, Scale, Hash, FileText } from 'lucide-react';

interface HfTagPillProps {
  tag: string;
}

export function formatHfTag(rawTag: string): { label: string; iconType?: 'safetensors' | 'gguf' | 'mlx' | 'license' | 'precision' | 'arxiv' } | null {
  const lower = rawTag.toLowerCase();

  // Filter out internal Hugging Face metadata tags
  if (lower.startsWith('region:') || lower.startsWith('base_model:') || lower === 'endpoints_compatible') {
    return null;
  }

  if (lower.startsWith('license:')) {
    const lic = rawTag.slice(8);
    return { label: `License: ${lic}`, iconType: 'license' };
  }

  if (lower === 'safetensors') {
    return { label: 'Safetensors', iconType: 'safetensors' };
  }

  if (lower === 'gguf') {
    return { label: 'GGUF', iconType: 'gguf' };
  }

  if (lower === 'mlx') {
    return { label: 'MLX', iconType: 'mlx' };
  }

  if (lower === '4-bit' || lower === '8-bit' || lower === '2-bit' || lower.includes('precision')) {
    const prec = lower.replace('-precision', '').replace('precision', '').trim();
    return { label: `${prec} precision`, iconType: 'precision' };
  }

  if (lower.startsWith('arxiv:')) {
    return { label: rawTag, iconType: 'arxiv' };
  }

  return { label: rawTag };
}

export const HfTagPill: React.FC<HfTagPillProps> = ({ tag }) => {
  const formatted = formatHfTag(tag);
  if (!formatted) return null;

  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/[0.08] bg-[#111726] px-2 py-0.5 text-[11px] font-medium text-slate-300 hover:border-white/[0.18] hover:text-white transition-colors">
      {formatted.iconType === 'safetensors' && (
        <Layers className="h-3 w-3 text-cyan-400" aria-hidden={true} />
      )}
      {formatted.iconType === 'gguf' && (
        <Database className="h-3 w-3 text-amber-400" aria-hidden={true} />
      )}
      {formatted.iconType === 'mlx' && (
        <span className="rounded bg-white/[0.1] px-1 py-0.2 font-mono text-[9px] font-bold text-white">MLX</span>
      )}
      {formatted.iconType === 'license' && (
        <Scale className="h-3 w-3 text-slate-400" aria-hidden={true} />
      )}
      {formatted.iconType === 'precision' && (
        <Hash className="h-3 w-3 text-purple-400" aria-hidden={true} />
      )}
      {formatted.iconType === 'arxiv' && (
        <FileText className="h-3 w-3 text-indigo-400" aria-hidden={true} />
      )}
      <span className="truncate">{formatted.label}</span>
    </span>
  );
};
