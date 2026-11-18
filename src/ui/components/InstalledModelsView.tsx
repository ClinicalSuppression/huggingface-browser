import React, { useState } from 'react';
import { HardDrive, Play, Trash2, CheckCircle2, Loader2, Zap } from 'lucide-react';
import { RuntimeId, VerificationResult } from '../../types';
import { InstalledModelItem } from '../types';
import { formatBytes, formatRelativeDate } from '../utils/format';
import { bridgeService } from '../data/mockService';

interface InstalledModelsViewProps {
  models: InstalledModelItem[];
  onRemoveModel: (runtimeId: RuntimeId, id: string) => void;
  onGoToDiscover: () => void;
}

export const InstalledModelsView: React.FC<InstalledModelsViewProps> = ({
  models,
  onRemoveModel,
  onGoToDiscover,
}) => {
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, VerificationResult>>({});

  const totalSize = models.reduce((sum, m) => sum + m.sizeBytes, 0);

  const handleTest = async (item: InstalledModelItem) => {
    const key = `${item.runtimeId}:${item.id}`;
    setTestingKey(key);
    const res = await bridgeService.runSmokeTest(item.runtimeId, item.id);
    setResults((prev) => ({ ...prev, [key]: res }));
    setTestingKey(null);
  };

  return (
    <section aria-label="Installed Models" className="flex h-full flex-col">
      <header className="border-b border-white/[0.08] bg-[#090d16]/75 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">Installed Models</h1>
            <p className="mt-0.5 text-xs text-slate-400">
              {models.length} local models occupying {formatBytes(totalSize)} across detected runtimes
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToDiscover}
            className="rounded-lg bg-[#0078d4] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1084d8]"
          >
            Browse Hub
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {models.length === 0 ? (
          <div className="fluent-card mx-auto mt-12 max-w-md rounded-xl p-8 text-center">
            <HardDrive className="mx-auto h-8 w-8 text-slate-500" aria-hidden={true} />
            <h2 className="mt-3 text-sm font-semibold text-slate-200">No local models found</h2>
            <p className="mt-1 text-xs text-slate-400">
              Deploy a model from Discover to run local inference on your GPU.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {models.map((item) => {
              const key = `${item.runtimeId}:${item.id}`;
              const testRes = results[key];
              const isTesting = testingKey === key;

              return (
                <div
                  key={key}
                  className="fluent-card flex flex-col justify-between gap-4 rounded-xl p-4 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden={true} />
                      <span className="truncate text-sm font-semibold text-white">{item.id}</span>
                      <span className="rounded border border-white/[0.08] bg-white/[0.05] px-2 py-0.5 text-[11px] font-medium uppercase text-slate-300">
                        {item.runtimeId}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-4 text-xs text-slate-400">
                      <span>Size: {formatBytes(item.sizeBytes)}</span>
                      <span>Modified: {formatRelativeDate(item.modifiedAtIso)}</span>
                      {testRes && (
                        <span className="inline-flex items-center gap-1 text-emerald-300 font-mono">
                          <Zap className="h-3.5 w-3.5" aria-hidden={true} />
                          {testRes.latencyToFirstTokenMs} ms TTFT &middot; {testRes.tokensPerSecond.toFixed(1)} tok/s
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleTest(item)}
                      disabled={isTesting}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/[0.1] disabled:opacity-50"
                    >
                      {isTesting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#38bdf8]" aria-hidden={true} />
                      ) : (
                        <Play className="h-3.5 w-3.5 text-[#38bdf8]" aria-hidden={true} />
                      )}
                      {isTesting ? 'Testing...' : 'Smoke Test'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveModel(item.runtimeId, item.id)}
                      aria-label={`Uninstall ${item.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden={true} />
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
