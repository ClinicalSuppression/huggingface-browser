import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Lock,
  BrainCircuit,
  Cpu,
  HardDrive,
  Play,
  Download,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Layers,
  Terminal,
  Loader2,
  StopCircle,
  ExternalLink,
  Sliders,
  FileText,
  RotateCcw,
  Globe,
  RotateCw,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import {
  HardwareProfile,
  HfModelSearchResult,
  InstallProgress,
  PresetIntent,
  RuntimeId,
  VerificationResult,
} from '../../types';
import {
  calculateKvCacheMemoryBytes,
  calculateWeightMemoryBytes,
  evaluateHardwareFit,
} from '../../core/sizing';
import { detectReasoningRequirements, getPurposePreset } from '../../core/presets';
import { DetectedRuntime, QuantOption } from '../types';
import {
  buildQuantOptionsForModel,
  estimateMaxContextTokens,
  estimateModelArchitecture,
  formatBytes,
  formatContextLength,
  formatPipelineTag,
} from '../utils/format';
import { bridgeService } from '../data/mockService';

interface ModelDetailDrawerProps {
  model: HfModelSearchResult | null;
  hardware: HardwareProfile | null;
  activeGpuId?: string;
  safeHeadroomMb?: number;
  defaultPresetIntent?: PresetIntent;
  runtimes: DetectedRuntime[];
  onClose: () => void;
  onDeploySuccess?: (runtimeId: RuntimeId, modelTag: string, sizeBytes: number) => void;
}

type DrawerTabId = 'webpage' | 'deploy' | 'readme';

interface AuthorGenConfig {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  repetition_penalty?: number;
}

interface ModelConfigContextInfo {
  trainedContext: number;
  maxContext: number;
  isRopeScaled: boolean;
}

interface EditablePresetParams {
  temperature: number;
  topP: number;
  topK: number;
  minP: number;
  repeatPenalty: number;
}

const PRESET_TABS: Array<{ intent: PresetIntent; label: string }> = [
  { intent: 'instruct', label: 'Instruct / Chat' },
  { intent: 'reasoning', label: 'Reasoning / Deep Thinking' },
  { intent: 'coding', label: 'Coding' },
  { intent: 'creative', label: 'Creative' },
];

const RUNTIME_ORDER: Array<{ id: RuntimeId; label: string }> = [
  { id: 'ollama', label: 'Ollama' },
  { id: 'llamacpp', label: 'llama.cpp' },
  { id: 'xollama', label: 'xollama' },
  { id: 'vllm', label: 'vLLM' },
];

function stripYamlFrontmatter(md: string): string {
  if (!md.startsWith('---')) return md;
  const endIdx = md.indexOf('\n---', 3);
  if (endIdx === -1) return md;
  return md.slice(endIdx + 4).trimStart();
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  return tokens.map((token, idx) => {
    if (token.startsWith('`') && token.endsWith('`') && token.length >= 2) {
      return (
        <code
          key={idx}
          className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[11px] text-[#7dd3fc]"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.startsWith('**') && token.endsWith('**') && token.length >= 4) {
      return (
        <strong key={idx} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>
      );
    }
    const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const href = linkMatch[2];
      return (
        <a
          key={idx}
          href={href}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => {
            if (href.startsWith('http://') || href.startsWith('https://')) {
              e.preventDefault();
              void bridgeService.openExternalUrl(href);
            }
          }}
          className="text-[#38bdf8] underline hover:text-[#7dd3fc]"
        >
          {linkMatch[1]}
        </a>
      );
    }
    return token;
  });
}

function SanitizedMarkdownView({ markdown }: { markdown: string }) {
  const cleaned = stripYamlFrontmatter(markdown);
  const lines = cleaned.split('\n');

  return (
    <div className="space-y-3 font-sans text-xs leading-relaxed text-slate-300">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-2" />;
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h1 key={idx} className="pt-2 text-base font-bold text-white">
              {trimmed.slice(2)}
            </h1>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h2 key={idx} className="pt-2 text-sm font-semibold text-white border-b border-white/[0.08] pb-1">
              {trimmed.slice(3)}
            </h2>
          );
        }
        if (trimmed.startsWith('### ')) {
          return (
            <h3 key={idx} className="pt-1.5 text-xs font-semibold text-[#7dd3fc]">
              {trimmed.slice(4)}
            </h3>
          );
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <li key={idx} className="ml-4 list-disc text-slate-300">
              {renderInlineMarkdown(trimmed.slice(2))}
            </li>
          );
        }
        if (trimmed.startsWith('> ')) {
          return (
            <blockquote
              key={idx}
              className="border-l-2 border-[#38bdf8]/50 bg-white/[0.02] px-3 py-1.5 text-slate-400 italic"
            >
              {renderInlineMarkdown(trimmed.slice(2))}
            </blockquote>
          );
        }
        return <p key={idx}>{renderInlineMarkdown(trimmed)}</p>;
      })}
    </div>
  );
}

export const ModelDetailDrawer: React.FC<ModelDetailDrawerProps> = ({
  model,
  hardware,
  activeGpuId,
  safeHeadroomMb = 512,
  defaultPresetIntent = 'instruct',
  runtimes,
  onClose,
  onDeploySuccess,
}) => {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const webviewRef = useRef<any>(null);

  const quantOptions = useMemo(() => (model ? buildQuantOptionsForModel(model) : []), [model]);
  const arch = useMemo(() => (model ? estimateModelArchitecture(model) : null), [model]);
  const estimatedMaxContext = useMemo(
    () => (model ? estimateMaxContextTokens(model) : 32768),
    [model]
  );
  const [configContextInfo, setConfigContextInfo] = useState<ModelConfigContextInfo | null>(null);
  const maxContextTokens = configContextInfo?.maxContext ?? estimatedMaxContext;
  const trainedContextTokens = configContextInfo?.trainedContext ?? estimatedMaxContext;
  const isRopeScaled = configContextInfo?.isRopeScaled ?? false;
  const reasoningInfo = useMemo(
    () => (model ? detectReasoningRequirements(model.id, model.tags || []) : null),
    [model]
  );

  // 16K Discrete Context Steps
  const discreteContextSteps = useMemo(() => {
    const steps: number[] = [];
    if (maxContextTokens <= 4096) {
      const low = Math.min(2048, maxContextTokens);
      steps.push(low);
      if (maxContextTokens > low) {
        steps.push(maxContextTokens);
      }
    } else if (maxContextTokens <= 8192) {
      steps.push(4096, maxContextTokens);
    } else {
      steps.push(8192); // Base starting step
      for (let t = 16384; t <= maxContextTokens; t += 16384) {
        steps.push(t);
      }
      if (!steps.includes(maxContextTokens)) {
        steps.push(maxContextTokens);
      }
    }
    return steps;
  }, [maxContextTokens]);

  const [activeTab, setActiveTab] = useState<DrawerTabId>('webpage');
  const [selectedQuantId, setSelectedQuantId] = useState<string>('Q4_K_M');
  const [contextTokens, setContextTokens] = useState<number>(8192);
  const [presetIntent, setPresetIntent] = useState<PresetIntent>(defaultPresetIntent);
  const [authorConfig, setAuthorConfig] = useState<AuthorGenConfig | null>(null);
  const [presetParams, setPresetParams] = useState<EditablePresetParams>({
    temperature: 0.7,
    topP: 0.9,
    topK: 40,
    minP: 0.05,
    repeatPenalty: 1.1,
  });
  const [thinkBudgetTokens, setThinkBudgetTokens] = useState<number>(8192);
  const [selectedRuntime, setSelectedRuntime] = useState<RuntimeId>('ollama');

  const [readmeMarkdown, setReadmeMarkdown] = useState<string>('');
  const [isLoadingReadme, setIsLoadingReadme] = useState(false);
  const [webviewError, setWebviewError] = useState<string | null>(null);

  const [isDeploying, setIsDeploying] = useState(false);
  const [deployProgress, setDeployProgress] = useState<InstallProgress | null>(null);
  const [deployDone, setDeployDone] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);

  const [isTesting, setIsTesting] = useState(false);
  const [smokeResult, setSmokeResult] = useState<VerificationResult | null>(null);

  // Drag-to-resize panel width (default ~560px / 38% screen width, persisted in localStorage)
  const [drawerWidth, setDrawerWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('hf_browser_drawer_width');
      if (saved) {
        const parsed = Number(saved);
        if (parsed >= 420 && parsed <= 1600) return parsed;
      }
    } catch {}
    return Math.min(580, Math.max(480, Math.round(window.innerWidth * 0.38)));
  });
  const [isResizing, setIsResizing] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [prevWidth, setPrevWidth] = useState<number>(580);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      const minWidth = 420;
      const maxWidth = Math.round(window.innerWidth * 0.85);
      const clamped = Math.max(minWidth, Math.min(maxWidth, newWidth));
      setDrawerWidth(clamped);
      if (isMaximized) setIsMaximized(false);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      try {
        localStorage.setItem('hf_browser_drawer_width', String(drawerWidth));
      } catch {}
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, drawerWidth, isMaximized]);

  const toggleMaximize = () => {
    if (isMaximized) {
      setDrawerWidth(prevWidth || 580);
      setIsMaximized(false);
    } else {
      setPrevWidth(drawerWidth);
      setDrawerWidth(Math.round(window.innerWidth * 0.85));
      setIsMaximized(true);
    }
  };

  const currentStepIndex = useMemo(() => {
    let closestIdx = 0;
    let minDiff = Infinity;
    discreteContextSteps.forEach((s, idx) => {
      const diff = Math.abs(s - contextTokens);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });
    return closestIdx;
  }, [contextTokens, discreteContextSteps]);

  const buildDefaultParamsForIntent = (
    intent: PresetIntent,
    authorCfg: AuthorGenConfig | null
  ): EditablePresetParams => {
    const base = getPurposePreset(intent);
    return {
      temperature: authorCfg?.temperature ?? base.temperature,
      topP: authorCfg?.top_p ?? base.topP,
      topK: authorCfg?.top_k ?? base.topK,
      minP: base.minP,
      repeatPenalty: authorCfg?.repetition_penalty ?? base.repeatPenalty,
    };
  };

  // Reset state & fetch README + generation_config.json whenever a new model is opened
  useEffect(() => {
    if (!model) return;
    setActiveTab('webpage'); // Default to live webpage on the right!
    setWebviewError(null);

    const opts = buildQuantOptionsForModel(model);
    const defaultQ = opts.find((o) => o.id === 'Q4_K_M') || opts[0];
    setSelectedQuantId(defaultQ?.id || 'Q4_K_M');

    const archMax = estimateMaxContextTokens(model);
    setConfigContextInfo(null);
    setContextTokens(Math.min(8192, archMax));

    const reasoning = detectReasoningRequirements(model.id, model.tags || []);
    const initialIntent = reasoning.isThinkingModel ? 'reasoning' : defaultPresetIntent;
    setPresetIntent(initialIntent);
    setThinkBudgetTokens(reasoning.recommendedBudget || 8192);
    setAuthorConfig(null);
    setPresetParams(buildDefaultParamsForIntent(initialIntent, null));

    const firstHealthy = runtimes.find((r) => r.isHealthy);
    setSelectedRuntime(firstHealthy ? firstHealthy.runtimeId : 'ollama');

    setIsDeploying(false);
    setDeployProgress(null);
    setDeployDone(false);
    setDeployError(null);
    setIsTesting(false);
    setSmokeResult(null);

    const controller = new AbortController();

    // Fetch model config.json for trained vs. RoPE-scaled max context
    fetch(`https://huggingface.co/${model.id}/raw/main/config.json`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Record<string, any> | null) => {
        if (!data || controller.signal.aborted) return;
        const rawMax =
          (typeof data.max_position_embeddings === 'number' && data.max_position_embeddings) ||
          (typeof data.context_length === 'number' && data.context_length) ||
          (typeof data.n_ctx === 'number' && data.n_ctx) ||
          archMax;
        const ropeScaling =
          data.rope_scaling && typeof data.rope_scaling === 'object' ? data.rope_scaling : null;
        const origFromRope =
          ropeScaling && typeof ropeScaling.original_max_position_embeddings === 'number'
            ? ropeScaling.original_max_position_embeddings
            : typeof data.original_max_position_embeddings === 'number'
              ? data.original_max_position_embeddings
              : null;

        if (origFromRope && origFromRope > 0 && rawMax > origFromRope) {
          setConfigContextInfo({
            trainedContext: origFromRope,
            maxContext: rawMax,
            isRopeScaled: true,
          });
        } else if (ropeScaling && typeof ropeScaling.factor === 'number' && ropeScaling.factor > 1) {
          setConfigContextInfo({
            trainedContext: Math.round(rawMax / ropeScaling.factor),
            maxContext: rawMax,
            isRopeScaled: true,
          });
        } else {
          setConfigContextInfo({
            trainedContext: rawMax,
            maxContext: rawMax,
            isRopeScaled: false,
          });
        }
      })
      .catch(() => {
        // Offline or missing config.json
      });

    // Fetch author generation_config.json if available
    fetch(`https://huggingface.co/${model.id}/raw/main/generation_config.json`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AuthorGenConfig | null) => {
        if (!data || controller.signal.aborted) return;
        const parsed: AuthorGenConfig = {
          temperature: typeof data.temperature === 'number' ? data.temperature : undefined,
          top_p: typeof data.top_p === 'number' ? data.top_p : undefined,
          top_k: typeof data.top_k === 'number' ? data.top_k : undefined,
          repetition_penalty:
            typeof data.repetition_penalty === 'number' ? data.repetition_penalty : undefined,
        };
        setAuthorConfig(parsed);
        setPresetParams(buildDefaultParamsForIntent(initialIntent, parsed));
      })
      .catch(() => {
        // Offline or missing generation_config.json
      });

    // Fetch Hugging Face README.md
    setIsLoadingReadme(true);
    setReadmeMarkdown('');
    fetch(`https://huggingface.co/${model.id}/raw/main/README.md`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((md) => {
        if (!controller.signal.aborted) {
          setReadmeMarkdown(md);
          setIsLoadingReadme(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          const fallback = [
            `# ${model.id}`,
            '',
            model.description || 'Hugging Face repository model card.',
            '',
            '## Repository Details',
            `- **Author:** ${model.author}`,
            `- **Pipeline:** ${formatPipelineTag(model.pipeline_tag)}`,
            `- **Downloads:** ${(model.downloads || 0).toLocaleString()}`,
            `- **Likes:** ${(model.likes || 0).toLocaleString()}`,
          ].join('\n');
          setReadmeMarkdown(fallback);
          setIsLoadingReadme(false);
        }
      });

    const timer = setTimeout(() => closeBtnRef.current?.focus(), 40);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [model, runtimes, defaultPresetIntent]);

  // Escape key closes drawer
  useEffect(() => {
    if (!model) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [model, onClose]);

  // Webview load error resilience
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv || !model || activeTab !== 'webpage') return;

    const handleFailLoad = (e: any) => {
      if (e?.isMainFrame === false) return;
      setWebviewError(e?.errorDescription || 'Unable to connect to Hugging Face Hub.');
    };
    const handleFinishLoad = () => {
      setWebviewError(null);
    };

    wv.addEventListener('did-fail-load', handleFailLoad);
    wv.addEventListener('did-finish-load', handleFinishLoad);
    return () => {
      wv.removeEventListener('did-fail-load', handleFailLoad);
      wv.removeEventListener('did-finish-load', handleFinishLoad);
    };
  }, [model, activeTab]);

  if (!model || !arch) return null;

  const selectedQuant: QuantOption =
    quantOptions.find((q) => q.id === selectedQuantId) || quantOptions[0];

  const weightBytes = calculateWeightMemoryBytes(arch.paramBillions, selectedQuant.bitsPerWeight);
  const kvCacheBytes = calculateKvCacheMemoryBytes(
    arch.layers,
    arch.kvHeads,
    arch.headDim,
    contextTokens
  );
  const headroomBytes = safeHeadroomMb * 1024 * 1024;

  const activeGpu =
    (activeGpuId ? hardware?.gpus.find((g) => g.id === activeGpuId) : undefined) ||
    hardware?.gpus[0];

  const totalFreeVram = activeGpu
    ? activeGpu.vramFreeBytes
    : hardware
      ? hardware.gpus.reduce((sum, g) => sum + g.vramFreeBytes, 0)
      : 14.8 * 1024 * 1024 * 1024;

  const effectiveFreeVram = Math.max(0, totalFreeVram - headroomBytes);

  const fitResult = hardware
    ? evaluateHardwareFit(
        arch.paramBillions,
        selectedQuant.bitsPerWeight,
        arch.layers,
        arch.kvHeads,
        arch.headDim,
        contextTokens,
        {
          ...hardware,
          gpus: activeGpu
            ? [{ ...activeGpu, vramFreeBytes: effectiveFreeVram }]
            : hardware.gpus,
        }
      )
    : null;

  const totalEstimatedVram = weightBytes + kvCacheBytes + headroomBytes;
  const barScaleDenom = Math.max(totalFreeVram, totalEstimatedVram, 1);

  const weightBarPct = Math.min(100, (weightBytes / barScaleDenom) * 100);
  const kvBarPct = Math.min(100 - weightBarPct, (kvCacheBytes / barScaleDenom) * 100);
  const headroomBarPct = Math.min(
    100 - weightBarPct - kvBarPct,
    (headroomBytes / barScaleDenom) * 100
  );

  const activePreset = getPurposePreset(presetIntent);
  const shortModelTag = `hf.co/${model.id}:${selectedQuant.id}`;
  const hasAuthorDefaults = Boolean(
    authorConfig &&
      (authorConfig.temperature !== undefined ||
        authorConfig.top_p !== undefined ||
        authorConfig.top_k !== undefined ||
        authorConfig.repetition_penalty !== undefined)
  );

  const handleSelectPresetTab = (intent: PresetIntent) => {
    setPresetIntent(intent);
    setPresetParams(buildDefaultParamsForIntent(intent, authorConfig));
  };

  const handleRestoreDefaults = () => {
    setPresetParams(buildDefaultParamsForIntent(presetIntent, authorConfig));
    if (presetIntent === 'reasoning') {
      setThinkBudgetTokens(reasoningInfo?.recommendedBudget || 8192);
    }
  };

  const handleDeploy = async () => {
    if (isDeploying) return;
    setIsDeploying(true);
    setDeployDone(false);
    setDeployError(null);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const result = await bridgeService.simulateOrRunDeploy(
      selectedRuntime,
      model.id,
      selectedQuant.sizeBytes,
      (prog) => setDeployProgress(prog),
      controller.signal
    );

    setIsDeploying(false);
    if (result.success) {
      setDeployDone(true);
      onDeploySuccess?.(selectedRuntime, shortModelTag, selectedQuant.sizeBytes);
    } else {
      setDeployError(result.error || 'Deployment failed');
    }
  };

  const handleCancelDeploy = () => {
    abortControllerRef.current?.abort();
    setIsDeploying(false);
  };

  const handleSmokeTest = async () => {
    if (isTesting) return;
    setIsTesting(true);
    setSmokeResult(null);
    const res = await bridgeService.runSmokeTest(selectedRuntime, shortModelTag);
    setSmokeResult(res);
    setIsTesting(false);
  };

  const handleOpenInBrowser = () => {
    void bridgeService.openExternalUrl(`https://huggingface.co/${model.id}`);
  };

  return (
    <aside
      role="region"
      aria-label="Model Inspector &amp; Webpage"
      className="relative h-full shrink-0 flex flex-col border-l border-white/[0.1] shadow-2xl bg-[#090d16] select-none"
      style={{ width: `${drawerWidth}px` }}
    >
      {/* Draggable Left Resize Handle */}
      <div
        onMouseDown={handleMouseDown}
        className={`absolute inset-y-0 -left-2 w-4 cursor-col-resize z-50 flex items-center justify-center transition-colors group ${
          isResizing ? 'bg-[#38bdf8]/40' : 'hover:bg-[#38bdf8]/20'
        }`}
        title="Drag left/right to resize panel"
      >
        <div className="h-10 w-1 rounded-full bg-white/20 group-hover:bg-[#38bdf8] transition-colors" />
      </div>

      {/* Drawer Header */}
      <header className="flex items-start justify-between gap-4 border-b border-white/[0.08] px-6 py-3.5 bg-[#0b0f19]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-400">{model.author}</span>
            <span className="rounded border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[11px] text-slate-300">
              {formatPipelineTag(model.pipeline_tag)}
            </span>
            {Boolean(model.gated) && (
              <span className="inline-flex items-center gap-1 rounded border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                <Lock className="h-3 w-3" aria-hidden={true} />
                Gated Repo
              </span>
            )}
            {reasoningInfo?.isThinkingModel && (
              <span className="inline-flex items-center gap-1 rounded border border-purple-400/30 bg-purple-500/15 px-2 py-0.5 text-[11px] font-medium text-purple-300">
                <BrainCircuit className="h-3 w-3" aria-hidden={true} />
                Thinking Model
              </span>
            )}
          </div>
          <h2
            id="drawer-model-title"
            className="mt-1 truncate text-base font-semibold tracking-tight text-white"
          >
            {model.id.split('/').slice(1).join('/') || model.id}
          </h2>
          <p className="mt-0.5 text-[11px] font-mono text-slate-400">
            Trained Context: {formatContextLength(trainedContextTokens)} &middot; Max Context:{' '}
            {formatContextLength(maxContextTokens)}
            {isRopeScaled ? ' (RoPE Scaled)' : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleMaximize}
            title={isMaximized ? 'Restore panel width' : 'Maximize panel width'}
            className="rounded-lg border border-white/[0.08] bg-white/[0.04] p-2 text-slate-300 transition-colors hover:bg-white/[0.1] hover:text-white"
          >
            {isMaximized ? (
              <Minimize2 className="h-4 w-4" aria-hidden={true} />
            ) : (
              <Maximize2 className="h-4 w-4" aria-hidden={true} />
            )}
          </button>
          <button
            type="button"
            onClick={handleOpenInBrowser}
            title="Open in Browser"
            aria-label="Open in Browser"
            className="rounded-lg border border-white/[0.08] bg-white/[0.04] p-2 text-slate-300 transition-colors hover:bg-white/[0.1] hover:text-white"
          >
            <ExternalLink className="h-4 w-4" aria-hidden={true} />
          </button>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close model details drawer"
            className="rounded-lg border border-white/[0.08] bg-white/[0.04] p-2 text-slate-300 transition-colors hover:bg-white/[0.1] hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden={true} />
          </button>
        </div>
      </header>

      {/* Top Navigation Tabs */}
      <div
        role="tablist"
        aria-label="Model detail views"
        className="flex items-center justify-between border-b border-white/[0.08] bg-[#0c1220] px-6 py-2"
      >
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            role="tab"
            id="tab-webpage"
            aria-selected={activeTab === 'webpage'}
            aria-controls="panel-webpage"
            onClick={() => setActiveTab('webpage')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'webpage'
                ? 'bg-[#0078d4]/25 text-[#7dd3fc] border border-[#38bdf8]/40'
                : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200 border border-transparent'
            }`}
          >
            <Globe className="h-3.5 w-3.5" aria-hidden={true} />
            Hugging Face Webpage
          </button>

          <button
            type="button"
            role="tab"
            id="tab-deploy"
            aria-selected={activeTab === 'deploy'}
            aria-controls="panel-deploy"
            onClick={() => setActiveTab('deploy')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'deploy'
                ? 'bg-[#0078d4]/25 text-[#7dd3fc] border border-[#38bdf8]/40'
                : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200 border border-transparent'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" aria-hidden={true} />
            Deployment &amp; Sizing
          </button>

          <button
            type="button"
            role="tab"
            id="tab-readme"
            aria-selected={activeTab === 'readme'}
            aria-controls="panel-readme"
            onClick={() => setActiveTab('readme')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'readme'
                ? 'bg-[#0078d4]/25 text-[#7dd3fc] border border-[#38bdf8]/40'
                : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200 border border-transparent'
            }`}
          >
            <FileText className="h-3.5 w-3.5" aria-hidden={true} />
            Model Card &amp; README
          </button>
        </div>

        {activeTab === 'webpage' && (
          <button
            type="button"
            onClick={() => setActiveTab('deploy')}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#0078d4] px-3 py-1 text-xs font-semibold text-white hover:bg-[#1084d8] shadow-sm shadow-[#0078d4]/30"
          >
            <Download className="h-3 w-3" />
            Deploy Model
          </button>
        )}
      </div>

      {/* Tab Panel 1: Live Hugging Face Webpage */}
      {activeTab === 'webpage' && (
        <div id="panel-webpage" role="tabpanel" aria-labelledby="tab-webpage" className="flex flex-1 flex-col overflow-hidden bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-100 px-4 py-1.5 text-xs text-slate-700">
            <div className="flex items-center gap-2 font-mono text-[11px] truncate">
              <Globe className="h-3.5 w-3.5 text-[#0078d4] shrink-0" />
              <span className="truncate">https://huggingface.co/{model.id}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setWebviewError(null);
                  if (webviewRef.current) {
                    try { webviewRef.current.reload(); } catch {}
                  }
                }}
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50"
              >
                <RotateCw className="h-3 w-3" />
                Reload
              </button>
              <button
                type="button"
                onClick={handleOpenInBrowser}
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50"
              >
                <ExternalLink className="h-3 w-3" />
                Open in Browser
              </button>
            </div>
          </div>
          {webviewError && (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-950"
            >
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden={true} />
                <span className="truncate">
                  Unable to connect to Hugging Face Hub ({webviewError})
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setWebviewError(null);
                    if (webviewRef.current) {
                      try { webviewRef.current.reload(); } catch {}
                    }
                  }}
                  className="rounded border border-amber-400 bg-white px-2.5 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
                >
                  Reload
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('readme')}
                  className="rounded bg-amber-900 px-2.5 py-0.5 text-[11px] font-medium text-white hover:bg-amber-800"
                >
                  Switch to README
                </button>
              </div>
            </div>
          )}
          <webview
            ref={webviewRef}
            src={`https://huggingface.co/${model.id}`}
            className={`flex-1 w-full h-full border-0 bg-white ${isResizing ? 'pointer-events-none' : ''}`}
            allowpopups={true}
          />
        </div>
      )}

      {/* Tab Panel 2: Deployment & Sizing */}
      {activeTab === 'deploy' && (
        <>
          <div
            id="panel-deploy"
            role="tabpanel"
            aria-labelledby="tab-deploy"
            className="flex-1 space-y-6 overflow-y-auto px-6 py-5"
          >
            {/* 1. GGUF Quantization Selector */}
            <section aria-labelledby="quant-heading">
              <div className="mb-2.5 flex items-center justify-between">
                <h3 id="quant-heading" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Quantization Artifact
                </h3>
                <span className="text-xs text-slate-400">{selectedQuant.filename}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Quantization format">
                {quantOptions.map((q) => {
                  const selected = q.id === selectedQuant.id;
                  const qWeightBytes = calculateWeightMemoryBytes(arch.paramBillions, q.bitsPerWeight);
                  const qRequiredVram = qWeightBytes + kvCacheBytes + headroomBytes;
                  const qOffloadPct =
                    qWeightBytes > 0
                      ? Math.max(0, Math.round(((qRequiredVram - totalFreeVram) / qWeightBytes) * 100))
                      : 0;

                  const outlineClass =
                    qOffloadPct === 0
                      ? 'border-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/15'
                      : qOffloadPct <= 20
                        ? 'border-amber-400 bg-amber-400/10 hover:bg-amber-400/15'
                        : 'border-rose-500 bg-rose-500/10 hover:bg-rose-500/15';

                  const fitBadgeText =
                    qOffloadPct === 0 ? 'Full VRAM' : `${qOffloadPct}% Offload`;
                  const fitBadgeClass =
                    qOffloadPct === 0
                      ? 'text-emerald-300'
                      : qOffloadPct <= 20
                        ? 'text-amber-300'
                        : 'text-rose-300';

                  return (
                    <button
                      key={q.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setSelectedQuantId(q.id)}
                      title={
                        qOffloadPct === 0
                          ? 'Fits comfortably in VRAM (0% offload)'
                          : qOffloadPct <= 20
                            ? `Borderline fit (${qOffloadPct}% offloaded to system RAM)`
                            : `Severely offloaded (${qOffloadPct}% offloaded to system RAM)`
                      }
                      className={`rounded-lg border p-2.5 text-left transition-all ${outlineClass} ${
                        selected ? 'ring-2 ring-[#38bdf8] shadow-[0_0_0_1px_rgba(56,189,248,0.35)]' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold text-white">{q.label}</span>
                        <span className="text-xs font-medium text-[#7dd3fc]">
                          {formatBytes(q.sizeBytes)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-1">
                        <span className="truncate text-[10.5px] text-slate-400">{q.qualityNote}</span>
                        <span className={`shrink-0 font-mono text-[10px] font-semibold ${fitBadgeClass}`}>
                          {fitBadgeText}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 2. Real-time Hardware Sizing Meter */}
            <section
              aria-labelledby="sizing-heading"
              className="fluent-card rounded-xl p-4 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3
                  id="sizing-heading"
                  className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-200"
                >
                  <Cpu className="h-4 w-4 text-[#38bdf8]" aria-hidden={true} />
                  Real-Time Hardware Sizing ({activeGpu?.name || 'GPU'})
                </h3>

                {fitResult && (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-medium ${
                      fitResult.status === 'supported'
                        ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300'
                        : fitResult.status === 'conditional'
                          ? 'border-amber-500/35 bg-amber-500/15 text-amber-300'
                          : 'border-rose-500/35 bg-rose-500/15 text-rose-300'
                    }`}
                  >
                    {fitResult.status === 'supported' ? (
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden={true} />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden={true} />
                    )}
                    {fitResult.status === 'supported'
                      ? 'Full GPU Fit'
                      : fitResult.status === 'conditional'
                        ? 'Partial GPU Offload'
                        : 'Cannot Run in VRAM'}
                  </span>
                )}
              </div>

              {/* Stacked Memory Allocation Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-300">
                    Total Footprint + Headroom:{' '}
                    <strong className="text-white">{formatBytes(totalEstimatedVram)}</strong>
                  </span>
                  <span className="text-slate-400">
                    Live Free VRAM:{' '}
                    <strong className="text-[#38bdf8]">{formatBytes(totalFreeVram)}</strong>
                  </span>
                </div>

                <div
                  role="img"
                  aria-label={`VRAM allocation: Weights ${formatBytes(weightBytes)}, KV Cache ${formatBytes(kvCacheBytes)}, Headroom ${formatBytes(headroomBytes)} out of ${formatBytes(totalFreeVram)} free`}
                  className="relative h-3 w-full overflow-hidden rounded-full bg-white/[0.08]"
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-[#0078d4] transition-all duration-200"
                    style={{ width: `${weightBarPct}%` }}
                    title={`Model Weights: ${formatBytes(weightBytes)}`}
                  />
                  <div
                    className="absolute inset-y-0 bg-[#a855f7] transition-all duration-200"
                    style={{ left: `${weightBarPct}%`, width: `${kvBarPct}%` }}
                    title={`KV Cache: ${formatBytes(kvCacheBytes)}`}
                  />
                  <div
                    className="absolute inset-y-0 bg-amber-500 transition-all duration-200"
                    style={{ left: `${weightBarPct + kvBarPct}%`, width: `${headroomBarPct}%` }}
                    title={`Safe Headroom: ${formatBytes(headroomBytes)}`}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#0078d4]" aria-hidden={true} />
                      Weights: {formatBytes(weightBytes)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#a855f7]" aria-hidden={true} />
                      KV Cache: {formatBytes(kvCacheBytes)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-500" aria-hidden={true} />
                      Headroom: {formatBytes(headroomBytes)}
                    </span>
                  </div>

                  {fitResult && (
                    <span className="flex items-center gap-1 text-slate-300 font-mono">
                      <Layers className="h-3.5 w-3.5 text-[#38bdf8]" aria-hidden={true} />
                      GPU Offload:{' '}
                      <strong>
                        {fitResult.maxOffloadLayers}/{fitResult.totalLayers} layers
                      </strong>
                    </span>
                  )}
                </div>
              </div>

              {/* Context Window Slider in 16K Discrete Divisions with Notches & Aligned Labels */}
              <div className="border-t border-white/[0.06] pt-3">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <label htmlFor="context-slider" className="font-medium text-slate-200">
                    Context Window (16K divisions)
                  </label>
                  <span className="rounded bg-white/[0.06] px-2 py-0.5 font-mono text-xs text-[#7dd3fc]">
                    {contextTokens.toLocaleString()} tokens ({formatContextLength(contextTokens)})
                  </span>
                </div>
                <p className="mb-1.5 text-[11px] font-mono text-slate-400">
                  Trained Context: {formatContextLength(trainedContextTokens)} &middot; Max Context:{' '}
                  {formatContextLength(maxContextTokens)}
                  {isRopeScaled ? ' (RoPE Scaled)' : ''}
                </p>

                {/* Notched Slider Bar */}
                <div className="relative my-3 w-full">
                  <div className="h-2 w-full rounded-full bg-white/[0.08]" />
                  <div
                    className="absolute top-0 left-0 h-2 rounded-full bg-gradient-to-r from-[#0078d4] to-[#38bdf8] transition-all"
                    style={{
                      width: `${discreteContextSteps.length > 1 ? (currentStepIndex / (discreteContextSteps.length - 1)) * 100 : 100}%`,
                    }}
                  />

                  {/* Circular Notches along the track */}
                  {discreteContextSteps.map((step, idx) => {
                    const pct = discreteContextSteps.length > 1 ? (idx / (discreteContextSteps.length - 1)) * 100 : 0;
                    const isReached = idx <= currentStepIndex;
                    const isCurrent = idx === currentStepIndex;
                    return (
                      <span
                        key={step}
                        className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full border transition-all ${
                          isCurrent
                            ? 'h-3.5 w-3.5 border-white bg-[#38bdf8] shadow-[0_0_8px_rgba(56,189,248,0.8)] z-10'
                            : isReached
                              ? 'h-2 w-2 border-[#38bdf8] bg-[#0078d4]'
                              : 'h-2 w-2 border-white/20 bg-[#090d16]'
                        }`}
                        style={{ left: `${pct}%` }}
                        title={`${formatContextLength(step)} (${step.toLocaleString()} tokens)`}
                      />
                    );
                  })}

                  <input
                    id="context-slider"
                    type="range"
                    min={0}
                    max={discreteContextSteps.length - 1}
                    step={1}
                    value={currentStepIndex}
                    onChange={(e) => setContextTokens(discreteContextSteps[Number(e.target.value)])}
                    className="absolute inset-0 h-full w-full opacity-0 cursor-pointer z-20"
                  />
                </div>

                {/* Aligned Labels Underneath Each Notch */}
                <div className="relative mt-2 h-4 w-full text-[10px] text-slate-400 font-mono">
                  {discreteContextSteps.map((step, idx) => {
                    const pct = discreteContextSteps.length > 1 ? (idx / (discreteContextSteps.length - 1)) * 100 : 0;
                    const isSelected = idx === currentStepIndex;
                    return (
                      <span
                        key={step}
                        className={`absolute -translate-x-1/2 transition-colors ${
                          isSelected ? 'text-[#7dd3fc] font-bold' : 'text-slate-500'
                        }`}
                        style={{ left: `${pct}%` }}
                      >
                        {formatContextLength(step)}
                      </span>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* 3. Purpose Preset Editor + Restore Defaults */}
            <section aria-labelledby="preset-heading" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 id="preset-heading" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Purpose Preset
                  </h3>
                  <span className="rounded border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] text-slate-400">
                    {hasAuthorDefaults ? 'Author generation_config.json' : 'Preset Baseline'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleRestoreDefaults}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-slate-200 transition-colors hover:bg-white/[0.1] hover:text-white"
                >
                  <RotateCcw className="h-3 w-3 text-[#38bdf8]" aria-hidden={true} />
                  Restore Defaults
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist" aria-label="Inference purpose presets">
                {PRESET_TABS.map((tab) => {
                  const isSelected = presetIntent === tab.intent;
                  const isReasoning = tab.intent === 'reasoning';
                  return (
                    <button
                      key={tab.intent}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => handleSelectPresetTab(tab.intent)}
                      className={`rounded-lg border px-2.5 py-2 text-center text-xs font-medium transition-all ${
                        isSelected
                          ? isReasoning
                            ? 'border-purple-400/60 bg-purple-500/20 text-purple-200'
                            : 'border-[#38bdf8]/60 bg-[#0078d4]/25 text-[#7dd3fc]'
                          : 'border-white/[0.08] bg-white/[0.03] text-slate-300 hover:bg-white/[0.06] hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Editable Preset Parameters + Think Budget Slider */}
              <div
                className={`rounded-xl border p-3.5 text-xs space-y-3 ${
                  presetIntent === 'reasoning'
                    ? 'border-purple-400/30 bg-purple-500/[0.08]'
                    : 'border-white/[0.08] bg-white/[0.03]'
                }`}
              >
                <p className="text-slate-300">{activePreset.description}</p>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                  <label className="space-y-1">
                    <span className="block text-[11px] text-slate-400">Temperature</span>
                    <input
                      type="number"
                      step={0.05}
                      min={0}
                      max={2}
                      value={presetParams.temperature}
                      onChange={(e) =>
                        setPresetParams((p) => ({ ...p, temperature: Number(e.target.value) }))
                      }
                      className="w-full rounded border border-white/[0.1] bg-[#090d16] px-2 py-1 font-mono text-xs text-white focus:border-[#38bdf8] focus:outline-none"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[11px] text-slate-400">top_p</span>
                    <input
                      type="number"
                      step={0.01}
                      min={0}
                      max={1}
                      value={presetParams.topP}
                      onChange={(e) =>
                        setPresetParams((p) => ({ ...p, topP: Number(e.target.value) }))
                      }
                      className="w-full rounded border border-white/[0.1] bg-[#090d16] px-2 py-1 font-mono text-xs text-white focus:border-[#38bdf8] focus:outline-none"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[11px] text-slate-400">top_k</span>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={presetParams.topK}
                      onChange={(e) =>
                        setPresetParams((p) => ({ ...p, topK: Number(e.target.value) }))
                      }
                      className="w-full rounded border border-white/[0.1] bg-[#090d16] px-2 py-1 font-mono text-xs text-white focus:border-[#38bdf8] focus:outline-none"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[11px] text-slate-400">min_p</span>
                    <input
                      type="number"
                      step={0.01}
                      min={0}
                      max={1}
                      value={presetParams.minP}
                      onChange={(e) =>
                        setPresetParams((p) => ({ ...p, minP: Number(e.target.value) }))
                      }
                      className="w-full rounded border border-white/[0.1] bg-[#090d16] px-2 py-1 font-mono text-xs text-white focus:border-[#38bdf8] focus:outline-none"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[11px] text-slate-400">repeat_penalty</span>
                    <input
                      type="number"
                      step={0.05}
                      min={0.5}
                      max={2}
                      value={presetParams.repeatPenalty}
                      onChange={(e) =>
                        setPresetParams((p) => ({ ...p, repeatPenalty: Number(e.target.value) }))
                      }
                      className="w-full rounded border border-white/[0.1] bg-[#090d16] px-2 py-1 font-mono text-xs text-white focus:border-[#38bdf8] focus:outline-none"
                    />
                  </label>
                </div>

                {presetIntent === 'reasoning' && (
                  <div className="border-t border-purple-400/20 pt-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <label htmlFor="think-budget-slider" className="font-medium text-purple-200">
                        Think-Budget Tokens
                      </label>
                      <span className="rounded bg-purple-500/20 px-2 py-0.5 font-mono text-xs text-purple-200">
                        {thinkBudgetTokens.toLocaleString()} tokens
                      </span>
                    </div>
                    <input
                      id="think-budget-slider"
                      type="range"
                      min={1024}
                      max={32768}
                      step={1024}
                      value={thinkBudgetTokens}
                      onChange={(e) => setThinkBudgetTokens(Number(e.target.value))}
                      className="fluent-slider fluent-slider-purple w-full"
                    />
                  </div>
                )}
              </div>
            </section>

            {/* 4. Runtime Selector */}
            <section aria-labelledby="runtime-heading" className="space-y-2.5">
              <h3 id="runtime-heading" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Target Local Runtime
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Target runtime">
                {RUNTIME_ORDER.map((rt) => {
                  const detected = runtimes.find((r) => r.runtimeId === rt.id);
                  const isOnline = detected?.isHealthy ?? false;
                  const isSelected = selectedRuntime === rt.id;

                  return (
                    <button
                      key={rt.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setSelectedRuntime(rt.id)}
                      className={`flex flex-col justify-between rounded-lg border p-2.5 text-left transition-all ${
                        isSelected
                          ? 'border-[#38bdf8]/60 bg-[#0078d4]/20'
                          : 'border-white/[0.08] bg-white/[0.03] hover:border-white/[0.16] hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white">{rt.label}</span>
                        <span
                          className={`h-2 w-2 rounded-full ${
                            isOnline ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]' : 'bg-slate-600'
                          }`}
                          title={isOnline ? 'Detected & Online' : 'Not Detected'}
                        />
                      </div>
                      <span className="mt-1 text-[10px] text-slate-400">
                        {isOnline ? 'Active' : 'Offline'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 5. Inference & Speed Test Explainer + Results */}
            <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Zap className="h-3.5 w-3.5 text-[#38bdf8]" aria-hidden={true} />
                Test Inference &amp; Speed
              </div>
              <p className="text-[11px] leading-relaxed text-slate-400">
                Loads the model into local memory and runs a minimal 1-token test prompt to verify inference and measure response latency (Time-to-First-Token) and generation speed (tokens/sec).
              </p>
            </section>

            {/* Deployment Progress & Test Results */}
            {(isDeploying || deployProgress || deployDone || deployError) && (
              <section
                aria-live="polite"
                className="fluent-card rounded-xl p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-200">
                    {deployDone
                      ? `Deployed to ${selectedRuntime} successfully`
                      : deployError
                        ? deployError
                        : deployProgress?.stepDescription || 'Preparing deployment...'}
                  </span>
                  {deployProgress && (
                    <span className="font-mono text-[#7dd3fc]">{deployProgress.percentComplete}%</span>
                  )}
                </div>

                <div
                  role="progressbar"
                  aria-valuenow={deployProgress?.percentComplete ?? 0}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="h-2 w-full overflow-hidden rounded-full bg-white/[0.08]"
                >
                  <div
                    className={`h-full transition-all duration-150 ${
                      deployDone
                        ? 'bg-emerald-400'
                        : deployError
                          ? 'bg-rose-500'
                          : 'bg-gradient-to-r from-[#0078d4] to-[#38bdf8]'
                    }`}
                    style={{ width: `${deployDone ? 100 : deployProgress?.percentComplete ?? 0}%` }}
                  />
                </div>
              </section>
            )}

            {smokeResult && (
              <section
                aria-live="polite"
                className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.07] p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                    <Zap className="h-4 w-4" aria-hidden={true} />
                    Inference &amp; Speed Test Passed
                  </span>
                  <div className="flex items-center gap-3 font-mono text-xs text-slate-200">
                    <span>
                      TTFT: <strong className="text-emerald-300">{smokeResult.latencyToFirstTokenMs} ms</strong>
                    </span>
                    <span>
                      Speed: <strong className="text-[#7dd3fc]">{smokeResult.tokensPerSecond.toFixed(1)} tok/s</strong>
                    </span>
                  </div>
                </div>
                {smokeResult.rawOutputSample && (
                  <div className="flex items-start gap-2 rounded-lg bg-[#090d16]/70 p-2.5 font-mono text-[11px] text-slate-300">
                    <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden={true} />
                    <span>{smokeResult.rawOutputSample}</span>
                  </div>
                )}
              </section>
            )}
          </div>

          {/* Sticky Footer: Disk Space Preview, One-Click Deploy & Smoke Test */}
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] bg-[#090d16]/95 px-6 py-4">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <HardDrive className="h-4 w-4 text-slate-400" aria-hidden={true} />
              <span>
                Disk required: <strong className="text-white">{formatBytes(selectedQuant.sizeBytes)}</strong>
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleSmokeTest}
                disabled={isTesting || isDeploying}
                className="inline-flex items-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.05] px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-white/[0.1] hover:text-white disabled:opacity-50"
              >
                {isTesting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#38bdf8]" aria-hidden={true} />
                ) : (
                  <Play className="h-3.5 w-3.5 text-[#38bdf8]" aria-hidden={true} />
                )}
                {isTesting ? 'Testing...' : 'Test Inference & Speed'}
              </button>

              {isDeploying ? (
                <button
                  type="button"
                  onClick={handleCancelDeploy}
                  className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/20 px-4 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/30"
                >
                  <StopCircle className="h-4 w-4" aria-hidden={true} />
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleDeploy}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#0078d4] px-4 py-2 text-xs font-semibold text-white shadow-md shadow-[#0078d4]/30 transition-colors hover:bg-[#1084d8]"
                >
                  <Download className="h-4 w-4" aria-hidden={true} />
                  {deployDone ? 'Redeploy Model' : 'One-Click Deploy'}
                </button>
              )}
            </div>
          </footer>
        </>
      )}

      {/* Tab Panel 3: Model Card & README */}
      {activeTab === 'readme' && (
        <div
          id="panel-readme"
          role="tabpanel"
          aria-labelledby="tab-readme"
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-6 py-3">
            <span className="truncate font-mono text-xs text-slate-400">
              huggingface.co/{model.id}
            </span>
            <button
              type="button"
              onClick={handleOpenInBrowser}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#38bdf8]/35 bg-[#0078d4]/20 px-3 py-1.5 text-xs font-medium text-[#7dd3fc] transition-colors hover:bg-[#0078d4]/35"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden={true} />
              Open in Browser
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {isLoadingReadme ? (
              <div className="flex items-center gap-2.5 text-xs text-slate-400" aria-busy="true">
                <Loader2 className="h-4 w-4 animate-spin text-[#38bdf8]" aria-hidden={true} />
                Fetching README.md from Hugging Face Hub...
              </div>
            ) : (
              <SanitizedMarkdownView markdown={readmeMarkdown} />
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
