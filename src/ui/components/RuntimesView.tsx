import React, { useState } from 'react';
import { Server, RefreshCw, CheckCircle2, XCircle, Globe, Sliders, ChevronDown, ChevronUp, Save, Check } from 'lucide-react';
import { DetectedRuntime } from '../types';

interface RuntimesViewProps {
  runtimes: DetectedRuntime[];
  onRefresh: () => Promise<void>;
}

const RUNTIME_FORMATS: Record<string, string[]> = {
  ollama: ['GGUF', 'Modelfile', 'Safetensors import'],
  llamacpp: ['GGUF', 'Split Shards', 'MMProj Vision'],
  xollama: ['GGUF', 'OpenAI-Compatible API', 'AVX-512'],
  vllm: ['SafeTensors', 'FP8', 'AWQ', 'GPTQ'],
};

interface RuntimeConfigs {
  ollama: {
    numCtx: number;
    flashAttention: boolean;
    numParallel: number;
    keepAlive: string;
    modelsDir: string;
  };
  llamacpp: {
    nGpuLayers: number;
    ctxSize: number;
    flashAttn: boolean;
    threads: number;
    batchSize: number;
  };
  xollama: {
    thinkBudget: number;
    computeBackend: string;
  };
  vllm: {
    gpuMemoryUtilization: number;
    maxModelLen: number;
    kvCacheDtype: string;
  };
}

export const RuntimesView: React.FC<RuntimesViewProps> = ({ runtimes, onRefresh }) => {
  const [refreshing, setRefreshing] = useState(false);
  const [expandedRuntime, setExpandedRuntime] = useState<string | null>('ollama');
  const [savedRuntime, setSavedRuntime] = useState<string | null>(null);

  const [configs, setConfigs] = useState<RuntimeConfigs>({
    ollama: {
      numCtx: 8192,
      flashAttention: true,
      numParallel: 2,
      keepAlive: '30m',
      modelsDir: '~/.ollama/models',
    },
    llamacpp: {
      nGpuLayers: 999,
      ctxSize: 8192,
      flashAttn: true,
      threads: 8,
      batchSize: 512,
    },
    xollama: {
      thinkBudget: 8192,
      computeBackend: 'ROCm',
    },
    vllm: {
      gpuMemoryUtilization: 0.90,
      maxModelLen: 8192,
      kvCacheDtype: 'auto',
    },
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };

  const handleSaveConfig = (runtimeId: string) => {
    setSavedRuntime(runtimeId);
    setTimeout(() => setSavedRuntime(null), 2000);
  };

  return (
    <section aria-label="Runtime Manager" className="flex h-full flex-col">
      <header className="border-b border-white/[0.08] bg-[#090d16]/75 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white flex items-center gap-2">
              <Server className="h-5 w-5 text-[#38bdf8]" aria-hidden={true} />
              Runtime Manager
            </h1>
            <p className="mt-0.5 text-xs text-slate-400">
              Configure daemon parameters, context windows, and acceleration backends for local serving engines
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
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 max-w-5xl">
        <div className="grid grid-cols-1 gap-4">
          {runtimes.map((rt) => {
            const formats = RUNTIME_FORMATS[rt.runtimeId] || ['GGUF'];
            const isExpanded = expandedRuntime === rt.runtimeId;
            const isSaved = savedRuntime === rt.runtimeId;

            return (
              <div key={rt.runtimeId} className="fluent-card rounded-xl p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
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
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold text-white">{rt.displayName}</h2>
                        {rt.isHealthy ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" aria-hidden={true} />
                            Online
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-slate-400">
                            <XCircle className="h-3 w-3" aria-hidden={true} />
                            Offline
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400">
                        {rt.version ? `Version ${rt.version}` : 'Not installed or stopped'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedRuntime(isExpanded ? null : rt.runtimeId)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/[0.08]"
                    >
                      <Sliders className="h-3.5 w-3.5 text-[#38bdf8]" />
                      <span>Configure Options</span>
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-lg bg-[#090d16]/70 px-3 py-2 font-mono text-xs text-slate-300">
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

                {/* Collapsible Configuration Options Panel */}
                {isExpanded && (
                  <div className="mt-4 border-t border-white/[0.08] pt-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#38bdf8]">
                        {rt.displayName} Parameters &amp; Service Customization
                      </h3>
                      <button
                        type="button"
                        onClick={() => handleSaveConfig(rt.runtimeId)}
                        className="inline-flex items-center gap-1.5 rounded-md bg-[#0078d4] px-3 py-1 text-xs font-medium text-white hover:bg-[#1084d8]"
                      >
                        {isSaved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                        {isSaved ? 'Saved!' : 'Save Configuration'}
                      </button>
                    </div>

                    {/* Ollama Options */}
                    {rt.runtimeId === 'ollama' && (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
                        <div>
                          <label className="block text-slate-300 font-medium mb-1">Default Context Window (num_ctx)</label>
                          <input
                            type="number"
                            min={2048}
                            max={131072}
                            step={1024}
                            value={configs.ollama.numCtx}
                            onChange={(e) => setConfigs({ ...configs, ollama: { ...configs.ollama, numCtx: Number(e.target.value) } })}
                            className="w-full rounded border border-white/[0.1] bg-[#090d16] px-2.5 py-1.5 text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-300 font-medium mb-1">Model Unload Timeout (OLLAMA_KEEP_ALIVE)</label>
                          <select
                            value={configs.ollama.keepAlive}
                            onChange={(e) => setConfigs({ ...configs, ollama: { ...configs.ollama, keepAlive: e.target.value } })}
                            className="w-full rounded border border-white/[0.1] bg-[#090d16] px-2.5 py-1.5 text-white"
                          >
                            <option value="5m">5 minutes</option>
                            <option value="30m">30 minutes (Default)</option>
                            <option value="24h">24 hours</option>
                            <option value="-1">Never unload (-1)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-slate-300 font-medium mb-1">Parallel Streams (OLLAMA_NUM_PARALLEL)</label>
                          <input
                            type="number"
                            min={1}
                            max={8}
                            value={configs.ollama.numParallel}
                            onChange={(e) => setConfigs({ ...configs, ollama: { ...configs.ollama, numParallel: Number(e.target.value) } })}
                            className="w-full rounded border border-white/[0.1] bg-[#090d16] px-2.5 py-1.5 text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-300 font-medium mb-1">Flash Attention (OLLAMA_FLASH_ATTENTION)</label>
                          <button
                            type="button"
                            onClick={() => setConfigs({ ...configs, ollama: { ...configs.ollama, flashAttention: !configs.ollama.flashAttention } })}
                            className={`w-full rounded border px-2.5 py-1.5 text-left font-medium ${
                              configs.ollama.flashAttention ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-white/[0.1] bg-white/[0.03] text-slate-400'
                            }`}
                          >
                            {configs.ollama.flashAttention ? 'Enabled (Fast long-context inference)' : 'Disabled'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* llama.cpp Options */}
                    {rt.runtimeId === 'llamacpp' && (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
                        <div>
                          <label className="block text-slate-300 font-medium mb-1">GPU Offload Layers (-ngl / --n-gpu-layers)</label>
                          <input
                            type="number"
                            min={0}
                            max={999}
                            value={configs.llamacpp.nGpuLayers}
                            onChange={(e) => setConfigs({ ...configs, llamacpp: { ...configs.llamacpp, nGpuLayers: Number(e.target.value) } })}
                            className="w-full rounded border border-white/[0.1] bg-[#090d16] px-2.5 py-1.5 text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-300 font-medium mb-1">Context Size (-c / --ctx-size)</label>
                          <input
                            type="number"
                            min={2048}
                            max={131072}
                            step={1024}
                            value={configs.llamacpp.ctxSize}
                            onChange={(e) => setConfigs({ ...configs, llamacpp: { ...configs.llamacpp, ctxSize: Number(e.target.value) } })}
                            className="w-full rounded border border-white/[0.1] bg-[#090d16] px-2.5 py-1.5 text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-300 font-medium mb-1">CPU Compute Threads (-t / --threads)</label>
                          <input
                            type="number"
                            min={1}
                            max={32}
                            value={configs.llamacpp.threads}
                            onChange={(e) => setConfigs({ ...configs, llamacpp: { ...configs.llamacpp, threads: Number(e.target.value) } })}
                            className="w-full rounded border border-white/[0.1] bg-[#090d16] px-2.5 py-1.5 text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-300 font-medium mb-1">Flash Attention (--flash-attn)</label>
                          <button
                            type="button"
                            onClick={() => setConfigs({ ...configs, llamacpp: { ...configs.llamacpp, flashAttn: !configs.llamacpp.flashAttn } })}
                            className={`w-full rounded border px-2.5 py-1.5 text-left font-medium ${
                              configs.llamacpp.flashAttn ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-white/[0.1] bg-white/[0.03] text-slate-400'
                            }`}
                          >
                            {configs.llamacpp.flashAttn ? 'Enabled (Reduced VRAM footprint)' : 'Disabled'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* xollama Options */}
                    {rt.runtimeId === 'xollama' && (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
                        <div>
                          <label className="block text-slate-300 font-medium mb-1">Native Reasoning Budget (--think-budget)</label>
                          <select
                            value={configs.xollama.thinkBudget}
                            onChange={(e) => setConfigs({ ...configs, xollama: { ...configs.xollama, thinkBudget: Number(e.target.value) } })}
                            className="w-full rounded border border-white/[0.1] bg-[#090d16] px-2.5 py-1.5 text-white font-mono"
                          >
                            <option value={4096}>4,096 tokens</option>
                            <option value={8192}>8,192 tokens (Standard)</option>
                            <option value={16384}>16,384 tokens (DeepSeek R1)</option>
                            <option value={32768}>32,768 tokens (Extended)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-slate-300 font-medium mb-1">Compute Backend Engine</label>
                          <select
                            value={configs.xollama.computeBackend}
                            onChange={(e) => setConfigs({ ...configs, xollama: { ...configs.xollama, computeBackend: e.target.value } })}
                            className="w-full rounded border border-white/[0.1] bg-[#090d16] px-2.5 py-1.5 text-white font-mono"
                          >
                            <option value="ROCm">AMD ROCm (Optimal for RX 7800 XT)</option>
                            <option value="Vulkan">Vulkan Compute</option>
                            <option value="AVX2">CPU AVX2 Optimized</option>
                            <option value="AVX-512">CPU AVX-512 Optimized</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {/* vLLM Options */}
                    {rt.runtimeId === 'vllm' && (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
                        <div>
                          <label className="block text-slate-300 font-medium mb-1">GPU Memory Utilization (--gpu-memory-utilization)</label>
                          <input
                            type="number"
                            min={0.50}
                            max={0.95}
                            step={0.05}
                            value={configs.vllm.gpuMemoryUtilization}
                            onChange={(e) => setConfigs({ ...configs, vllm: { ...configs.vllm, gpuMemoryUtilization: Number(e.target.value) } })}
                            className="w-full rounded border border-white/[0.1] bg-[#090d16] px-2.5 py-1.5 text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-300 font-medium mb-1">Max Model Length (--max-model-len)</label>
                          <input
                            type="number"
                            min={2048}
                            max={131072}
                            step={2048}
                            value={configs.vllm.maxModelLen}
                            onChange={(e) => setConfigs({ ...configs, vllm: { ...configs.vllm, maxModelLen: Number(e.target.value) } })}
                            className="w-full rounded border border-white/[0.1] bg-[#090d16] px-2.5 py-1.5 text-white font-mono"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
