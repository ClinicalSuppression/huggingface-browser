import React, { useState } from 'react';
import {
  Server,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Globe,
  SlidersHorizontal,
  RotateCcw,
} from 'lucide-react';
import { DetectedRuntime, RuntimeOptionsConfig } from '../types';
import { DEFAULT_RUNTIME_OPTIONS } from '../utils/format';

interface RuntimesViewProps {
  runtimes: DetectedRuntime[];
  runtimeOptions: RuntimeOptionsConfig;
  onUpdateRuntimeOptions: (next: RuntimeOptionsConfig) => void;
  onRefresh: () => Promise<void>;
}

const RUNTIME_FORMATS: Record<string, string[]> = {
  ollama: ['GGUF', 'Modelfile', 'Safetensors import'],
  llamacpp: ['GGUF', 'Split Shards', 'MMProj Vision'],
  xollama: ['GGUF', 'OpenAI-Compatible API'],
  vllm: ['SafeTensors', 'FP8', 'AWQ', 'GPTQ'],
};

const CTX_CHOICES = [4096, 8192, 16384, 32768, 65536, 131072];

export const RuntimesView: React.FC<RuntimesViewProps> = ({
  runtimes,
  runtimeOptions,
  onUpdateRuntimeOptions,
  onRefresh,
}) => {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState('');

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshStatus('');
    try {
      await onRefresh();
      setRefreshStatus('Runtime scan complete.');
    } catch {
      setRefreshStatus('Runtime scan failed. Try again.');
    } finally {
      setRefreshing(false);
    }
  };

  const resetRuntime = (runtimeId: keyof RuntimeOptionsConfig) => {
    onUpdateRuntimeOptions({
      ...runtimeOptions,
      [runtimeId]: DEFAULT_RUNTIME_OPTIONS[runtimeId],
    });
  };

  return (
    <section aria-label="Runtime Manager" className="flex h-full flex-col">
      <header className="border-b border-white/[0.08] bg-[#090d16]/75 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">Runtime Manager</h1>
            <p className="mt-0.5 text-xs text-slate-400">
              Configure local inference backends, environment variables, and per-service context defaults
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.05] px-4 py-2 text-xs font-medium text-slate-200 hover:bg-white/[0.1] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden={true} />
            {refreshing ? 'Scanning...' : 'Re-detect Runtimes'}
          </button>
          <span className="sr-only" role="status" aria-live="polite">{refreshStatus}</span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {runtimes.map((rt) => {
            const formats = RUNTIME_FORMATS[rt.runtimeId] || ['GGUF'];
            const rtKey = rt.runtimeId as keyof RuntimeOptionsConfig;

            return (
              <div key={rt.runtimeId} className="fluent-card flex flex-col justify-between rounded-xl p-5 space-y-4">
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-lg border ${
                          rt.isHealthy
                            ? 'border-[#38bdf8]/30 bg-[#0078d4]/20 text-[#38bdf8]'
                            : 'border-white/[0.08] bg-white/[0.04] text-slate-400'
                        }`}
                      >
                        <Server className="h-5 w-5" aria-hidden={true} />
                      </div>
                      <div>
                        <h2 className="text-sm font-semibold text-white">{rt.displayName}</h2>
                        <span className="text-xs text-slate-400">
                          {rt.version ? `Version ${rt.version}` : 'Not installed or stopped'}
                        </span>
                      </div>
                    </div>

                    {rt.isHealthy ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden={true} />
                        Online
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-xs font-medium text-slate-400">
                        <XCircle className="h-3.5 w-3.5" aria-hidden={true} />
                        Offline
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 rounded-lg bg-[#090d16]/70 px-3 py-1.5 font-mono text-xs text-slate-300">
                      <Globe className="h-3.5 w-3.5 text-slate-500" aria-hidden={true} />
                      <span>{rt.endpointUrl}</span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {formats.map((fmt) => (
                        <span
                          key={fmt}
                          className="rounded border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[11px] text-slate-300"
                        >
                          {fmt}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Runtime Customization Panel */}
                <div className="border-t border-white/[0.07] pt-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                      <SlidersHorizontal className="h-3.5 w-3.5 text-[#38bdf8]" aria-hidden={true} />
                      Service Options
                    </span>
                    <button
                      type="button"
                      onClick={() => resetRuntime(rtKey)}
                      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden={true} />
                      Reset
                    </button>
                  </div>

                  {rt.runtimeId === 'ollama' && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
                      <div className="flex items-center justify-between rounded-lg border border-white/[0.07] bg-[#090d16]/60 px-3 py-2">
                        <span id="ollama-flash-label" className="font-mono text-[11px] text-slate-200">
                          OLLAMA_FLASH_ATTENTION
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={runtimeOptions.ollama.flashAttention}
                          aria-labelledby="ollama-flash-label"
                          onClick={() =>
                            onUpdateRuntimeOptions({
                              ...runtimeOptions,
                              ollama: {
                                ...runtimeOptions.ollama,
                                flashAttention: !runtimeOptions.ollama.flashAttention,
                              },
                            })
                          }
                          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
                            runtimeOptions.ollama.flashAttention
                              ? 'border-[#38bdf8]/60 bg-[#0078d4]'
                              : 'border-white/[0.15] bg-white/[0.08]'
                          }`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                              runtimeOptions.ollama.flashAttention ? 'translate-x-4' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </div>

                      <label className="space-y-1">
                        <span className="block font-mono text-[11px] text-slate-400">
                          OLLAMA_NUM_PARALLEL
                        </span>
                        <select
                          value={runtimeOptions.ollama.numParallel}
                          onChange={(e) =>
                            onUpdateRuntimeOptions({
                              ...runtimeOptions,
                              ollama: {
                                ...runtimeOptions.ollama,
                                numParallel: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full rounded-lg border border-white/[0.1] bg-[#090d16] px-2.5 py-1.5 text-xs text-slate-100 focus:border-[#38bdf8] focus:outline-none"
                        >
                          {[1, 2, 4, 8].map((n) => (
                            <option key={n} value={n}>
                              {n} parallel request{n > 1 ? 's' : ''}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-1">
                        <span className="block font-mono text-[11px] text-slate-400">
                          OLLAMA_KEEP_ALIVE
                        </span>
                        <select
                          value={runtimeOptions.ollama.keepAlive}
                          onChange={(e) =>
                            onUpdateRuntimeOptions({
                              ...runtimeOptions,
                              ollama: {
                                ...runtimeOptions.ollama,
                                keepAlive: e.target.value as RuntimeOptionsConfig['ollama']['keepAlive'],
                              },
                            })
                          }
                          className="w-full rounded-lg border border-white/[0.1] bg-[#090d16] px-2.5 py-1.5 text-xs text-slate-100 focus:border-[#38bdf8] focus:outline-none"
                        >
                          <option value="5m">5m (5 minutes)</option>
                          <option value="30m">30m (30 minutes)</option>
                          <option value="24h">24h (24 hours)</option>
                          <option value="-1">-1 (Keep loaded)</option>
                        </select>
                      </label>

                      <label className="space-y-1">
                        <span className="block font-mono text-[11px] text-slate-400">
                          Default num_ctx
                        </span>
                        <select
                          value={runtimeOptions.ollama.numCtx}
                          onChange={(e) =>
                            onUpdateRuntimeOptions({
                              ...runtimeOptions,
                              ollama: {
                                ...runtimeOptions.ollama,
                                numCtx: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full rounded-lg border border-white/[0.1] bg-[#090d16] px-2.5 py-1.5 text-xs text-slate-100 focus:border-[#38bdf8] focus:outline-none"
                        >
                          {CTX_CHOICES.map((c) => (
                            <option key={c} value={c}>
                              {c.toLocaleString()} tokens
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}

                  {rt.runtimeId === 'llamacpp' && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 text-xs">
                      <label className="space-y-1">
                        <span className="block font-mono text-[11px] text-slate-400">
                          -ngl (GPU Layers)
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={200}
                          value={runtimeOptions.llamacpp.nGpuLayers}
                          onChange={(e) =>
                            onUpdateRuntimeOptions({
                              ...runtimeOptions,
                              llamacpp: {
                                ...runtimeOptions.llamacpp,
                                nGpuLayers: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full rounded-lg border border-white/[0.1] bg-[#090d16] px-2.5 py-1.5 font-mono text-xs text-slate-100 focus:border-[#38bdf8] focus:outline-none"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="block font-mono text-[11px] text-slate-400">
                          -c (Context)
                        </span>
                        <select
                          value={runtimeOptions.llamacpp.ctxSize}
                          onChange={(e) =>
                            onUpdateRuntimeOptions({
                              ...runtimeOptions,
                              llamacpp: {
                                ...runtimeOptions.llamacpp,
                                ctxSize: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full rounded-lg border border-white/[0.1] bg-[#090d16] px-2.5 py-1.5 text-xs text-slate-100 focus:border-[#38bdf8] focus:outline-none"
                        >
                          {CTX_CHOICES.map((c) => (
                            <option key={c} value={c}>
                              {c.toLocaleString()}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-1">
                        <span className="block font-mono text-[11px] text-slate-400">
                          -t (Threads)
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={64}
                          value={runtimeOptions.llamacpp.threads}
                          onChange={(e) =>
                            onUpdateRuntimeOptions({
                              ...runtimeOptions,
                              llamacpp: {
                                ...runtimeOptions.llamacpp,
                                threads: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full rounded-lg border border-white/[0.1] bg-[#090d16] px-2.5 py-1.5 font-mono text-xs text-slate-100 focus:border-[#38bdf8] focus:outline-none"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="block font-mono text-[11px] text-slate-400">
                          -b (Batch Size)
                        </span>
                        <select
                          value={runtimeOptions.llamacpp.batchSize}
                          onChange={(e) =>
                            onUpdateRuntimeOptions({
                              ...runtimeOptions,
                              llamacpp: {
                                ...runtimeOptions.llamacpp,
                                batchSize: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full rounded-lg border border-white/[0.1] bg-[#090d16] px-2.5 py-1.5 font-mono text-xs text-slate-100 focus:border-[#38bdf8] focus:outline-none"
                        >
                          {[128, 256, 512, 1024, 2048].map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="col-span-2 sm:col-span-2 flex items-center justify-between rounded-lg border border-white/[0.07] bg-[#090d16]/60 px-3 py-2">
                        <span id="llamacpp-flash-label" className="font-mono text-[11px] text-slate-200">
                          --flash-attn
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={runtimeOptions.llamacpp.flashAttn}
                          aria-labelledby="llamacpp-flash-label"
                          onClick={() =>
                            onUpdateRuntimeOptions({
                              ...runtimeOptions,
                              llamacpp: {
                                ...runtimeOptions.llamacpp,
                                flashAttn: !runtimeOptions.llamacpp.flashAttn,
                              },
                            })
                          }
                          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
                            runtimeOptions.llamacpp.flashAttn
                              ? 'border-[#38bdf8]/60 bg-[#0078d4]'
                              : 'border-white/[0.15] bg-white/[0.08]'
                          }`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                              runtimeOptions.llamacpp.flashAttn ? 'translate-x-4' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  )}

                  {rt.runtimeId === 'xollama' && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
                      <label className="space-y-1">
                        <span className="block font-mono text-[11px] text-slate-400">
                          --think-budget (tokens)
                        </span>
                        <input
                          type="number"
                          min={1024}
                          max={32768}
                          step={1024}
                          value={runtimeOptions.xollama.thinkBudget}
                          onChange={(e) =>
                            onUpdateRuntimeOptions({
                              ...runtimeOptions,
                              xollama: {
                                ...runtimeOptions.xollama,
                                thinkBudget: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full rounded-lg border border-white/[0.1] bg-[#090d16] px-2.5 py-1.5 font-mono text-xs text-slate-100 focus:border-[#38bdf8] focus:outline-none"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="block font-mono text-[11px] text-slate-400">
                          Compute Backend
                        </span>
                        <select
                          value={runtimeOptions.xollama.computeBackend}
                          onChange={(e) =>
                            onUpdateRuntimeOptions({
                              ...runtimeOptions,
                              xollama: {
                                ...runtimeOptions.xollama,
                                computeBackend: e.target.value as RuntimeOptionsConfig['xollama']['computeBackend'],
                              },
                            })
                          }
                          className="w-full rounded-lg border border-white/[0.1] bg-[#090d16] px-2.5 py-1.5 text-xs text-slate-100 focus:border-[#38bdf8] focus:outline-none"
                        >
                          <option value="Vulkan">Vulkan (RDNA / Cross-Vendor)</option>
                          <option value="CUDA">CUDA (NVIDIA)</option>
                          <option value="AVX2">AVX2 (CPU)</option>
                          <option value="AVX-512">AVX-512 (CPU)</option>
                        </select>
                      </label>
                    </div>
                  )}

                  {rt.runtimeId === 'vllm' && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label
                            htmlFor="vllm-gpu-util"
                            className="font-mono text-[11px] text-slate-400"
                          >
                            --gpu-memory-utilization
                          </label>
                          <span className="font-mono text-[11px] text-[#7dd3fc]">
                            {runtimeOptions.vllm.gpuMemoryUtilization.toFixed(2)}
                          </span>
                        </div>
                        <input
                          id="vllm-gpu-util"
                          type="range"
                          min={0.5}
                          max={0.98}
                          step={0.02}
                          value={runtimeOptions.vllm.gpuMemoryUtilization}
                          onChange={(e) =>
                            onUpdateRuntimeOptions({
                              ...runtimeOptions,
                              vllm: {
                                ...runtimeOptions.vllm,
                                gpuMemoryUtilization: Number(e.target.value),
                              },
                            })
                          }
                          className="fluent-slider w-full"
                        />
                      </div>

                      <label className="space-y-1">
                        <span className="block font-mono text-[11px] text-slate-400">
                          --max-model-len
                        </span>
                        <select
                          value={runtimeOptions.vllm.maxModelLen}
                          onChange={(e) =>
                            onUpdateRuntimeOptions({
                              ...runtimeOptions,
                              vllm: {
                                ...runtimeOptions.vllm,
                                maxModelLen: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full rounded-lg border border-white/[0.1] bg-[#090d16] px-2.5 py-1.5 text-xs text-slate-100 focus:border-[#38bdf8] focus:outline-none"
                        >
                          {CTX_CHOICES.map((c) => (
                            <option key={c} value={c}>
                              {c.toLocaleString()} tokens
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
