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
  estimateModelArchitecture,
  formatBytes,
  formatContextLength,
  formatPipelineTag,
} from '../utils/format';
import { bridgeService } from '../data/mockService';

interface ModelDetailDrawerProps {
  model: HfModelSearchResult | null;
  hardware: HardwareProfile | null;
  runtimes: DetectedRuntime[];
  onClose: () => void;
  onDeploySuccess?: (runtimeId: RuntimeId, modelTag: string, sizeBytes: number) => void;
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

export const ModelDetailDrawer: React.FC<ModelDetailDrawerProps> = ({
  model,
  hardware,
  runtimes,
  onClose,
  onDeploySuccess,
}) => {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const quantOptions = useMemo(() => (model ? buildQuantOptionsForModel(model) : []), [model]);
  const arch = useMemo(() => (model ? estimateModelArchitecture(model) : null), [model]);
  const reasoningInfo = useMemo(
    () => (model ? detectReasoningRequirements(model.id, model.tags || []) : null),
    [model]
  );

  const [selectedQuantId, setSelectedQuantId] = useState<string>('Q4_K_M');
  const [contextTokens, setContextTokens] = useState<number>(8192);
  const [presetIntent, setPresetIntent] = useState<PresetIntent>('instruct');
  const [thinkBudgetTokens, setThinkBudgetTokens] = useState<number>(8192);
  const [selectedRuntime, setSelectedRuntime] = useState<RuntimeId>('ollama');

  const [isDeploying, setIsDeploying] = useState(false);
  const [deployProgress, setDeployProgress] = useState<InstallProgress | null>(null);
  const [deployDone, setDeployDone] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);

  const [isTesting, setIsTesting] = useState(false);
  const [smokeResult, setSmokeResult] = useState<VerificationResult | null>(null);

  // Reset state whenever a new model is opened
  useEffect(() => {
    if (!model) return;
    const opts = buildQuantOptionsForModel(model);
    const defaultQ = opts.find((o) => o.id === 'Q4_K_M') || opts[0];
    setSelectedQuantId(defaultQ?.id || 'Q4_K_M');
    setContextTokens(8192);

    const reasoning = detectReasoningRequirements(model.id, model.tags || []);
    setPresetIntent(reasoning.isThinkingModel ? 'reasoning' : 'instruct');
    setThinkBudgetTokens(reasoning.recommendedBudget || 8192);

    const firstHealthy = runtimes.find((r) => r.isHealthy);
    setSelectedRuntime(firstHealthy ? firstHealthy.runtimeId : 'ollama');

    setIsDeploying(false);
    setDeployProgress(null);
    setDeployDone(false);
    setDeployError(null);
    setIsTesting(false);
    setSmokeResult(null);

    const timer = setTimeout(() => closeBtnRef.current?.focus(), 40);
    return () => clearTimeout(timer);
  }, [model, runtimes]);

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

  const fitResult = hardware
    ? evaluateHardwareFit(
        arch.paramBillions,
        selectedQuant.bitsPerWeight,
        arch.layers,
        arch.kvHeads,
        arch.headDim,
        contextTokens,
        hardware
      )
    : null;

  const totalFreeVram = hardware
    ? hardware.gpus.reduce((sum, g) => sum + g.vramFreeBytes, 0)
    : 14.5 * 1024 * 1024 * 1024;
  const totalEstimatedVram = fitResult ? fitResult.estimatedVramBytes : weightBytes + kvCacheBytes;

  const weightBarPct = Math.min(100, (weightBytes / Math.max(totalFreeVram, totalEstimatedVram)) * 100);
  const kvBarPct = Math.min(
    100 - weightBarPct,
    (kvCacheBytes / Math.max(totalFreeVram, totalEstimatedVram)) * 100
  );

  const activePreset = getPurposePreset(presetIntent);
  const shortModelTag = `${model.id.split('/').pop() || model.id}:${selectedQuant.id.toLowerCase()}`;

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

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-model-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="fluent-acrylic flex h-full w-full max-w-2xl flex-col border-l border-white/[0.1] shadow-2xl">
        {/* Drawer Header */}
        <header className="flex items-start justify-between gap-4 border-b border-white/[0.08] px-6 py-5">
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
              className="mt-1 truncate text-lg font-semibold tracking-tight text-white"
            >
              {model.id.split('/').slice(1).join('/') || model.id}
            </h2>
          </div>

          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close model details drawer"
            className="rounded-lg border border-white/[0.08] bg-white/[0.04] p-2 text-slate-300 transition-colors hover:bg-white/[0.1] hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden={true} />
          </button>
        </header>

        {/* Scrollable Configuration Body */}
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
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
                return (
                  <button
                    key={q.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setSelectedQuantId(q.id)}
                    className={`rounded-lg border p-2.5 text-left transition-all ${
                      selected
                        ? 'border-[#38bdf8]/60 bg-[#0078d4]/20 shadow-[0_0_0_1px_rgba(56,189,248,0.25)]'
                        : 'border-white/[0.08] bg-white/[0.03] hover:border-white/[0.16] hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white">{q.label}</span>
                      <span className="text-xs font-medium text-[#7dd3fc]">
                        {formatBytes(q.sizeBytes)}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-[11px] text-slate-400">{q.qualityNote}</div>
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
                Real-Time Hardware Sizing
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
                      ? 'Partial Offload'
                      : 'CPU Only'}
                </span>
              )}
            </div>

            {/* Stacked VRAM Breakdown Bar */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-slate-300">
                  Estimated Footprint:{' '}
                  <strong className="text-white">{formatBytes(totalEstimatedVram)}</strong>
                </span>
                <span className="text-slate-400">
                  Available VRAM: <strong className="text-slate-200">{formatBytes(totalFreeVram)}</strong>
                </span>
              </div>

              <div
                className="flex h-3 w-full overflow-hidden rounded-full bg-white/[0.08]"
                role="img"
                aria-label={`VRAM breakdown: Weights ${formatBytes(weightBytes)}, KV Cache ${formatBytes(kvCacheBytes)}`}
              >
                <div
                  className="h-full bg-[#0078d4] transition-all duration-300"
                  style={{ width: `${weightBarPct}%` }}
                  title={`Weights: ${formatBytes(weightBytes)}`}
                />
                <div
                  className="h-full bg-[#a855f7] transition-all duration-300"
                  style={{ width: `${kvBarPct}%` }}
                  title={`KV Cache: ${formatBytes(kvCacheBytes)}`}
                />
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-300">
                <div className="flex items-center gap-4">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#0078d4]" aria-hidden={true} />
                    Weights: <strong>{formatBytes(weightBytes)}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#a855f7]" aria-hidden={true} />
                    KV Cache: <strong>{formatBytes(kvCacheBytes)}</strong>
                  </span>
                </div>

                {fitResult && (
                  <span className="inline-flex items-center gap-1.5 text-slate-200">
                    <Layers className="h-3.5 w-3.5 text-[#38bdf8]" aria-hidden={true} />
                    GPU Offload:{' '}
                    <strong>
                      {fitResult.maxOffloadLayers}/{fitResult.totalLayers} layers
                    </strong>
                  </span>
                )}
              </div>
            </div>

            {/* Context Window Slider (2048 to 128k) */}
            <div className="border-t border-white/[0.06] pt-3">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <label htmlFor="context-slider" className="font-medium text-slate-200">
                  Context Window (n_ctx)
                </label>
                <span className="rounded bg-white/[0.06] px-2 py-0.5 font-mono text-xs text-[#7dd3fc]">
                  {contextTokens.toLocaleString()} tokens ({formatContextLength(contextTokens)})
                </span>
              </div>
              <input
                id="context-slider"
                type="range"
                min={2048}
                max={131072}
                step={2048}
                value={contextTokens}
                onChange={(e) => setContextTokens(Number(e.target.value))}
                className="fluent-slider w-full"
              />
              <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                <span>2K</span>
                <span>32K</span>
                <span>64K</span>
                <span>128K</span>
              </div>
            </div>
          </section>

          {/* 3. Purpose Preset Toggle */}
          <section aria-labelledby="preset-heading" className="space-y-3">
            <h3 id="preset-heading" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Purpose Preset
            </h3>
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
                    onClick={() => setPresetIntent(tab.intent)}
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

            {/* Preset Details + Think Budget Slider when Reasoning selected */}
            <div
              className={`rounded-xl border p-3.5 text-xs ${
                presetIntent === 'reasoning'
                  ? 'border-purple-400/30 bg-purple-500/[0.08]'
                  : 'border-white/[0.08] bg-white/[0.03]'
              }`}
            >
              <p className="text-slate-300">{activePreset.description}</p>
              <div className="mt-2.5 flex flex-wrap gap-3 font-mono text-[11px] text-slate-400">
                <span>temp={activePreset.temperature}</span>
                <span>top_p={activePreset.topP}</span>
                <span>top_k={activePreset.topK}</span>
                <span>min_p={activePreset.minP}</span>
                <span>repeat_penalty={activePreset.repeatPenalty}</span>
              </div>

              {presetIntent === 'reasoning' && (
                <div className="mt-3 border-t border-purple-400/20 pt-3">
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
                    <span className="mt-1 text-[11px] text-slate-400">
                      {isOnline ? detected?.version || 'Online' : 'Not detected'}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 5. Deployment Progress & Live Smoke Test Results */}
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
                  Smoke Test Passed
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
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] bg-[#090d16]/90 px-6 py-4">
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
              {isTesting ? 'Testing...' : 'Live Smoke Test'}
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
      </div>
    </div>
  );
};
