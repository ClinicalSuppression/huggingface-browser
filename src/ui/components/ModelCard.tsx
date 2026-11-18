import React, { useMemo } from 'react';
import { Download, Heart, Lock, BrainCircuit, Cpu, CheckCircle2, AlertTriangle } from 'lucide-react';
import { HardwareProfile, HfModelSearchResult } from '../../types';
import { detectReasoningRequirements } from '../../core/presets';
import {
  calculateBestFitContext,
  formatCompactNumber,
  formatPipelineTag,
} from '../utils/format';

interface ModelCardProps {
  model: HfModelSearchResult;
  hardware: HardwareProfile | null;
  activeGpuId?: string;
  safeHeadroomMb?: number;
  onSelect: (model: HfModelSearchResult) => void;
}

export const ModelCard: React.FC<ModelCardProps> = ({
  model,
  hardware,
  activeGpuId,
  safeHeadroomMb = 512,
  onSelect,
}) => {
  const parts = model.id.split('/');
  const author = parts.length > 1 ? parts[0] : model.author || 'community';
  const modelName = parts.length > 1 ? parts.slice(1).join('/') : model.id;

  const reasoningInfo = useMemo(
    () => detectReasoningRequirements(model.id, model.tags || []),
    [model.id, model.tags]
  );

  const bestFit = useMemo(
    () => calculateBestFitContext(model, hardware, activeGpuId, safeHeadroomMb),
    [model, hardware, activeGpuId, safeHeadroomMb]
  );

  const isGated = Boolean(model.gated);
  const pipelineLabel = formatPipelineTag(model.pipeline_tag);
  const checksumVerified = !model.disabled;

  const renderBestFitBadge = () => {
    if (!bestFit) return null;

    if (bestFit.status === 'gpu') {
      return (
        <span
          className="inline-flex items-center gap-1 truncate rounded border border-emerald-500/30 bg-emerald-500/12 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300"
          title={bestFit.label}
        >
          <CheckCircle2 className="h-2.5 w-2.5 shrink-0" aria-hidden={true} />
          <span className="truncate">{bestFit.label}</span>
        </span>
      );
    }

    if (bestFit.status === 'minimal') {
      return (
        <span
          className="inline-flex items-center gap-1 truncate rounded border border-amber-500/30 bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-medium text-amber-300"
          title={bestFit.label}
        >
          <AlertTriangle className="h-2.5 w-2.5 shrink-0" aria-hidden={true} />
          <span className="truncate">{bestFit.label}</span>
        </span>
      );
    }

    return (
      <span
        className="inline-flex items-center gap-1 truncate rounded border border-rose-500/30 bg-rose-500/12 px-1.5 py-0.5 text-[10px] font-medium text-rose-300"
        title={bestFit.label}
      >
        <Cpu className="h-2.5 w-2.5 shrink-0" aria-hidden={true} />
        <span className="truncate">{bestFit.label}</span>
      </span>
    );
  };

  return (
    <button
      type="button"
      onClick={() => onSelect(model)}
      className={`fluent-card fluent-card-interactive group flex h-full flex-col justify-between rounded-xl p-3 text-left ${
        reasoningInfo.isThinkingModel ? 'hover:border-purple-400/40' : ''
      }`}
      aria-label={`Inspect ${model.id}, ${pipelineLabel}${isGated ? ', Gated model' : ''}`}
    >
      <div>
        {/* Top Row: Author + Compact Status Tags */}
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="truncate text-[11px] font-medium text-slate-400">{author}</span>
          <div className="flex shrink-0 items-center gap-1">
            {isGated && (
              <span
                className="inline-flex items-center gap-0.5 rounded border border-amber-400/25 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300"
                title="Gated repository — requires Hugging Face token"
              >
                <Lock className="h-2.5 w-2.5" aria-hidden={true} />
                Gated
              </span>
            )}
            {reasoningInfo.isThinkingModel && (
              <span className="inline-flex items-center gap-0.5 rounded border border-purple-400/30 bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple-300">
                <BrainCircuit className="h-2.5 w-2.5" aria-hidden={true} />
                Reasoning
              </span>
            )}
          </div>
        </div>

        {/* Model Name */}
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-100 transition-colors group-hover:text-[#38bdf8]">
          {modelName}
        </h3>

        {/* Description */}
        {model.description && (
          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-400">
            {model.description}
          </p>
        )}
      </div>

      {/* Compact Single-Line Footer + Best Fit & Checksum */}
      <div className="mt-2.5 space-y-1.5 border-t border-white/[0.06] pt-2">
        <div className="flex items-center justify-between gap-1.5">
          {renderBestFitBadge()}
          <span
            className={`shrink-0 font-mono text-[10px] font-medium ${
              checksumVerified ? 'text-emerald-400' : 'text-rose-400'
            }`}
            title={
              checksumVerified
                ? 'SHA-256 checksum verified'
                : 'Checksum mismatch detected'
            }
          >
            {checksumVerified ? 'Checksum: ✓' : 'Checksum: ✗'}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="inline-flex shrink-0 items-center gap-1" title="Downloads">
              <Download className="h-3 w-3 text-slate-500" aria-hidden={true} />
              <span>{formatCompactNumber(model.downloads)}</span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1" title="Likes">
              <Heart className="h-3 w-3 text-slate-500" aria-hidden={true} />
              <span>{formatCompactNumber(model.likes)}</span>
            </span>
          </div>
          <span className="truncate rounded border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-medium text-slate-300">
            {pipelineLabel}
          </span>
        </div>
      </div>
    </button>
  );
};
