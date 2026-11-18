import React, { useMemo } from 'react';
import { Download, Heart, Lock, BrainCircuit, Cpu, CheckCircle2, AlertTriangle } from 'lucide-react';
import { HardwareProfile, HfModelSearchResult } from '../../types';
import { evaluateHardwareFit } from '../../core/sizing';
import { detectReasoningRequirements } from '../../core/presets';
import {
  estimateModelArchitecture,
  formatCompactNumber,
  formatPipelineTag,
} from '../utils/format';

interface ModelCardProps {
  model: HfModelSearchResult;
  hardware: HardwareProfile | null;
  onSelect: (model: HfModelSearchResult) => void;
}

export const ModelCard: React.FC<ModelCardProps> = ({ model, hardware, onSelect }) => {
  const parts = model.id.split('/');
  const author = parts.length > 1 ? parts[0] : model.author || 'community';
  const modelName = parts.length > 1 ? parts.slice(1).join('/') : model.id;

  const reasoningInfo = useMemo(
    () => detectReasoningRequirements(model.id, model.tags || []),
    [model.id, model.tags]
  );

  const fitResult = useMemo(() => {
    if (!hardware) return null;
    const arch = estimateModelArchitecture(model);
    // Evaluate at default Q4_K_M (4.85 bpw) and 8K context
    return evaluateHardwareFit(
      arch.paramBillions,
      4.85,
      arch.layers,
      arch.kvHeads,
      arch.headDim,
      8192,
      hardware
    );
  }, [model, hardware]);

  const isGated = Boolean(model.gated);
  const pipelineLabel = formatPipelineTag(model.pipeline_tag);

  const renderFitBadge = () => {
    if (!fitResult) return null;

    if (fitResult.status === 'supported') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/12 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
          <CheckCircle2 className="h-3 w-3" aria-hidden={true} />
          Full GPU Fit
        </span>
      );
    }

    if (fitResult.status === 'conditional') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/12 px-2 py-0.5 text-[11px] font-medium text-amber-300">
          <AlertTriangle className="h-3 w-3" aria-hidden={true} />
          Partial Offload
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/12 px-2 py-0.5 text-[11px] font-medium text-rose-300">
        <Cpu className="h-3 w-3" aria-hidden={true} />
        CPU Only
      </span>
    );
  };

  return (
    <button
      type="button"
      onClick={() => onSelect(model)}
      className={`fluent-card fluent-card-interactive group flex h-full flex-col justify-between rounded-xl p-4 text-left ${
        reasoningInfo.isThinkingModel ? 'hover:border-purple-400/40' : ''
      }`}
      aria-label={`Inspect ${model.id}, ${pipelineLabel}${isGated ? ', Gated model' : ''}`}
    >
      <div>
        {/* Top Row: Author + Badges */}
        <div className="mb-2 flex items-start justify-between gap-2">
          <span className="truncate text-xs font-medium text-slate-400">{author}</span>
          <div className="flex shrink-0 items-center gap-1.5">
            {isGated && (
              <span
                className="inline-flex items-center gap-1 rounded-md border border-amber-400/25 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300"
                title="Gated repository — requires Hugging Face token"
              >
                <Lock className="h-2.5 w-2.5" aria-hidden={true} />
                Gated
              </span>
            )}
            {reasoningInfo.isThinkingModel && (
              <span className="inline-flex items-center gap-1 rounded-md border border-purple-400/30 bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple-300">
                <BrainCircuit className="h-2.5 w-2.5" aria-hidden={true} />
                Reasoning
              </span>
            )}
          </div>
        </div>

        {/* Model Name */}
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-slate-100 group-hover:text-[#38bdf8] transition-colors">
          {modelName}
        </h3>

        {/* Description */}
        {model.description && (
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-400">
            {model.description}
          </p>
        )}
      </div>

      {/* Bottom Metadata & Fit */}
      <div className="mt-4 space-y-2.5 pt-3 border-t border-white/[0.06]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-slate-300">
            {pipelineLabel}
          </span>
          {renderFitBadge()}
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-3.5">
            <span className="inline-flex items-center gap-1" title="Downloads">
              <Download className="h-3.5 w-3.5 text-slate-500" aria-hidden={true} />
              <span>{formatCompactNumber(model.downloads)}</span>
            </span>
            <span className="inline-flex items-center gap-1" title="Likes">
              <Heart className="h-3.5 w-3.5 text-slate-500" aria-hidden={true} />
              <span>{formatCompactNumber(model.likes)}</span>
            </span>
          </div>
          <span className="text-[11px] font-medium text-[#38bdf8] opacity-0 transition-opacity group-hover:opacity-100">
            Configure &rarr;
          </span>
        </div>
      </div>
    </button>
  );
};
