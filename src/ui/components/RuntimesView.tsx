import React, { useState } from 'react';
import { Server, RefreshCw, CheckCircle2, XCircle, Globe } from 'lucide-react';
import { DetectedRuntime } from '../types';

interface RuntimesViewProps {
  runtimes: DetectedRuntime[];
  onRefresh: () => Promise<void>;
}

const RUNTIME_FORMATS: Record<string, string[]> = {
  ollama: ['GGUF', 'Modelfile', 'Safetensors import'],
  llamacpp: ['GGUF', 'Split Shards', 'MMProj Vision'],
  xollama: ['GGUF', 'OpenAI-Compatible API'],
  vllm: ['SafeTensors', 'FP8', 'AWQ', 'GPTQ'],
};

export const RuntimesView: React.FC<RuntimesViewProps> = ({ runtimes, onRefresh }) => {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };

  return (
    <section aria-label="Runtimes Manager" className="flex h-full flex-col">
      <header className="border-b border-white/[0.08] bg-[#090d16]/75 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">Runtimes Manager</h1>
            <p className="mt-0.5 text-xs text-slate-400">
              Local inference backends detected on your Windows workstation
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

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {runtimes.map((rt) => {
            const formats = RUNTIME_FORMATS[rt.runtimeId] || ['GGUF'];
            return (
              <div key={rt.runtimeId} className="fluent-card rounded-xl p-5 space-y-4">
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
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
