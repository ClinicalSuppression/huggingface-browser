import React, { useMemo } from 'react';
import { Download, Heart, Lock, Cpu, CheckCircle2, AlertTriangle } from 'lucide-react';
import { HardwareProfile, HfModelSearchResult } from '../../types';
import { detectReasoningRequirements } from '../../core/presets';
import { HfTagPill } from './HfTagPill';
import {
  calculateBestFitContext,
  formatCompactNumber,
  formatPipelineTag,
} from '../utils/format';

interface FeatureBadge {
  key: string;
  label: string;
  title: string;
  cls: string;
}

function detectFeatureBadges(model: HfModelSearchResult, isReasoning: boolean): FeatureBadge[] {
  const badges: FeatureBadge[] = [];
  const lowerId = model.id.toLowerCase();
  const lowerTags = (model.tags || []).map((t) => t.toLowerCase());
  const pipeline = (model.pipeline_tag || '').toLowerCase();
  const siblingNames = (model.siblings || []).map((s) => s.rfilename.toLowerCase());

  if (
    lowerTags.some((t) => t === 'mtp' || t.includes('mtp')) ||
    siblingNames.some((f) => f.includes('mtp')) ||
    lowerId.includes('-mtp')
  ) {
    badges.push({
      key: 'mtp',
      label: 'MTP',
      title: 'Multi-Token Prediction supported',
      cls: 'border-amber-400/30 bg-amber-500/15 text-amber-300',
    });
  }

  if (
    pipeline === 'image-text-to-text' ||
    lowerTags.some((t) => t === 'vision' || t === 'image-text-to-text' || t === 'multimodal') ||
    siblingNames.some((f) => f.includes('mmproj'))
  ) {
    badges.push({
      key: 'vision',
      label: 'Vision',
      title: 'Vision-Language / Multimodal input',
      cls: 'border-cyan-400/30 bg-cyan-500/15 text-cyan-300',
    });
  }

  if (
    pipeline === 'text-to-image' ||
    pipeline === 'image-to-image' ||
    lowerTags.some((t) => t === 'diffusion' || t === 'text-to-image' || t === 'image-to-image')
  ) {
    badges.push({
      key: 'imagegen',
      label: 'ImageGen',
      title: 'Diffusion / Image Generation',
      cls: 'border-pink-400/30 bg-pink-500/15 text-pink-300',
    });
  }

  if (lowerTags.some((t) => t === 'tools' || t === 'tool-use' || t === 'function-calling')) {
    badges.push({
      key: 'tools',
      label: 'Tools',
      title: 'Function Calling / Tool Use',
      cls: 'border-sky-400/30 bg-sky-500/15 text-sky-300',
    });
  }

  if (
    isReasoning ||
    lowerTags.some((t) => t === 'reasoning' || t === 'thinking' || t === 'deepseek-r1' || t === 'qwq')
  ) {
    badges.push({
      key: 'reasoning',
      label: 'Reasoning',
      title: 'Deep Thinking / Reasoning model',
      cls: 'border-purple-400/30 bg-purple-500/15 text-purple-300',
    });
  }

  if (
    pipeline.includes('audio') ||
    pipeline.includes('speech') ||
    lowerTags.some((t) => t === 'audio' || t === 'speech' || t === 'asr')
  ) {
    badges.push({
      key: 'audio',
      label: 'Audio',
      title: 'Audio / Speech / ASR',
      cls: 'border-teal-400/30 bg-teal-500/15 text-teal-300',
    });
  }

  if (
    lowerTags.some((t) => t === 'code' || t === 'coding' || t === 'coder') ||
    lowerId.includes('coder')
  ) {
    badges.push({
      key: 'code',
      label: 'Code',
      title: 'Coding Assistant',
      cls: 'border-indigo-400/30 bg-indigo-500/15 text-indigo-300',
    });
  }

  const hasHeretic = lowerTags.includes('heretic') || lowerId.includes('heretic');
  const hasAra = lowerTags.includes('ara');
  const hasUncensored =
    lowerTags.some((t) => t === 'uncensored' || t === 'abliterated') ||
    lowerId.includes('uncensored') ||
    lowerId.includes('abliterated');

  if (hasHeretic || hasAra || hasUncensored) {
    const label = hasHeretic ? 'Heretic' : hasAra ? 'ARA' : 'Uncensored';
    badges.push({
      key: 'uncensored',
      label,
      title: 'Uncensored / Ablated alignment',
      cls: 'border-rose-400/30 bg-rose-500/15 text-rose-300',
    });
  }

  return badges;
}

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
  const featureBadges = useMemo(
    () => detectFeatureBadges(model, reasoningInfo.isThinkingModel),
    [model, reasoningInfo.isThinkingModel]
  );

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
        {/* Top Row: Author + Gated Tag */}
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

        {/* Hugging Face Tags Row (Mirroring HF.co) */}
        {model.tags && model.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1 overflow-hidden max-h-12">
            {model.tags.slice(0, 4).map((t) => (
              <HfTagPill key={t} tag={t} />
            ))}
            {model.tags.length > 4 && (
              <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
                +{model.tags.length - 4}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Compact Footer: Best Fit, Feature Badges & Stats */}
      <div className="mt-2.5 space-y-1.5 border-t border-white/[0.06] pt-2">
        <div className="flex items-center justify-between gap-1.5">
          {renderBestFitBadge()}
        </div>

        {featureBadges.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {featureBadges.map((badge) => (
              <span
                key={badge.key}
                title={badge.title}
                className={`rounded border px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wide ${badge.cls}`}
              >
                {badge.label}
              </span>
            ))}
          </div>
        )}

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
