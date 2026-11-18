import React, { useState } from 'react';
import {
  HardDrive,
  Play,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Zap,
  ChevronDown,
  ChevronRight,
  FileCode2,
} from 'lucide-react';
import { RuntimeId, VerificationResult } from '../../types';
import { InstalledModelFile, InstalledModelItem } from '../types';
import { formatBytes, formatRelativeDate, parseInstalledModelName } from '../utils/format';
import { bridgeService } from '../data/mockService';

interface InstalledModelsViewProps {
  models: InstalledModelItem[];
  onRemoveModel: (runtimeId: RuntimeId, id: string) => void;
  onGoToDiscover: () => void;
}

const ROLE_LABELS: Record<NonNullable<InstalledModelFile['role']>, { label: string; cls: string }> = {
  weights: {
    label: 'Weights',
    cls: 'border-[#38bdf8]/30 bg-[#0078d4]/15 text-[#7dd3fc]',
  },
  mmproj: {
    label: 'Vision Projector',
    cls: 'border-purple-400/30 bg-purple-500/15 text-purple-300',
  },
  mtp: {
    label: 'MTP',
    cls: 'border-amber-400/30 bg-amber-500/15 text-amber-300',
  },
  adapter: {
    label: 'Adapter',
    cls: 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300',
  },
  other: {
    label: 'Artifact',
    cls: 'border-white/[0.1] bg-white/[0.05] text-slate-300',
  },
};

export const InstalledModelsView: React.FC<InstalledModelsViewProps> = ({
  models,
  onRemoveModel,
  onGoToDiscover,
}) => {
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, VerificationResult>>({});
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

  const getEffectiveTotalBytes = (item: InstalledModelItem): number => {
    if (item.files && item.files.length > 0) {
      return item.files.reduce((sum, f) => sum + f.sizeBytes, 0);
    }
    return item.sizeBytes;
  };

  const totalSize = models.reduce((sum, m) => sum + getEffectiveTotalBytes(m), 0);

  const handleTest = async (item: InstalledModelItem) => {
    const key = `${item.runtimeId}:${item.id}`;
    setTestingKey(key);
    const res = await bridgeService.runSmokeTest(item.runtimeId, item.id);
    setResults((prev) => ({ ...prev, [key]: res }));
    setTestingKey(null);
  };

  const toggleExpanded = (key: string) => {
    setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
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
            <p className="mt-1 text-[11px] text-slate-500">
              Test Inference &amp; Speed loads the model into local memory and runs a minimal 1-token test prompt to verify inference and measure response latency (Time-to-First-Token) and generation speed (tokens/sec).
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToDiscover}
            className="rounded-lg bg-[#0078d4] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1084d8]"
          >
            Search HF
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {models.length === 0 ? (
          <div className="fluent-card mx-auto mt-12 max-w-md rounded-xl p-8 text-center">
            <HardDrive className="mx-auto h-8 w-8 text-slate-500" aria-hidden={true} />
            <h2 className="mt-3 text-sm font-semibold text-slate-200">No local models found</h2>
            <p className="mt-1 text-xs text-slate-400">
              Deploy a model from Search HF to run local inference on your GPU.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {models.map((item) => {
              const key = `${item.runtimeId}:${item.id}`;
              const parsed = parseInstalledModelName(item.id);
              const effectiveBytes = getEffectiveTotalBytes(item);
              const fileList: InstalledModelFile[] =
                item.files && item.files.length > 0
                  ? item.files
                  : [{ name: item.id, sizeBytes: item.sizeBytes, role: 'weights' }];
              const isExpanded = Boolean(expandedKeys[key]);
              const testRes = results[key];
              const isTesting = testingKey === key;
              const isMismatch = item.checksumStatus === 'mismatch';

              return (
                <div key={key} className="fluent-card rounded-xl p-4">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {isMismatch ? (
                          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" aria-hidden={true} />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden={true} />
                        )}

                        <span className="truncate text-sm font-semibold text-white">
                          {parsed.title}
                        </span>

                        {parsed.author && (
                          <span className="rounded border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-slate-300">
                            {parsed.author}
                          </span>
                        )}

                        {parsed.quant && (
                          <span className="rounded border border-[#38bdf8]/30 bg-[#0078d4]/20 px-2 py-0.5 font-mono text-[11px] font-semibold text-[#7dd3fc]">
                            {parsed.quant}
                          </span>
                        )}

                        <span className="rounded border border-white/[0.08] bg-white/[0.05] px-2 py-0.5 text-[11px] font-medium uppercase text-slate-300">
                          {item.runtimeId}
                        </span>
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-4 text-xs text-slate-400">
                        <span>
                          Total Size:{' '}
                          <strong className="text-slate-200">{formatBytes(effectiveBytes)}</strong>
                          {fileList.length > 1 && (
                            <span className="ml-1 text-[11px] text-slate-400">
                              ({fileList.length} files)
                            </span>
                          )}
                        </span>
                        <span>Modified: {formatRelativeDate(item.modifiedAtIso)}</span>
                        <span
                          className={`font-mono text-[11px] font-medium ${
                            isMismatch ? 'text-rose-400' : 'text-emerald-400'
                          }`}
                        >
                          {isMismatch ? 'Checksum: ✗' : 'Checksum: ✓'}
                        </span>
                        {testRes && (
                          <span className="inline-flex items-center gap-1 font-mono text-emerald-300">
                            <Zap className="h-3.5 w-3.5" aria-hidden={true} />
                            {testRes.latencyToFirstTokenMs} ms TTFT &middot;{' '}
                            {testRes.tokensPerSecond.toFixed(1)} tok/s
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(key)}
                        aria-expanded={isExpanded}
                        aria-controls={`files-${key}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/[0.08] hover:text-white"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden={true} />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" aria-hidden={true} />
                        )}
                        Files ({fileList.length})
                      </button>

                      <button
                        type="button"
                        onClick={() => handleTest(item)}
                        disabled={isTesting}
                        title="Loads the model into local memory and runs a minimal 1-token test prompt to verify inference and measure response latency (Time-to-First-Token) and generation speed (tokens/sec)."
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/[0.1] disabled:opacity-50"
                      >
                        {isTesting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#38bdf8]" aria-hidden={true} />
                        ) : (
                          <Play className="h-3.5 w-3.5 text-[#38bdf8]" aria-hidden={true} />
                        )}
                        {isTesting ? 'Testing...' : 'Test Inference & Speed'}
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

                  {/* Collapsible Multi-File Breakdown Drawer */}
                  {isExpanded && (
                    <div
                      id={`files-${key}`}
                      className="mt-3 border-t border-white/[0.06] pt-3"
                    >
                      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        <span>Artifact File Breakdown</span>
                        <span>Combined: {effectiveBytes.toLocaleString()} bytes</span>
                      </div>
                      <ul className="space-y-1.5">
                        {fileList.map((file, idx) => {
                          const roleMeta = ROLE_LABELS[file.role || 'other'];
                          return (
                            <li
                              key={`${file.name}-${idx}`}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-[#090d16]/70 px-3 py-2 text-xs"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <FileCode2 className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden={true} />
                                <span className="truncate font-mono text-slate-200">{file.name}</span>
                                <span
                                  className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${roleMeta.cls}`}
                                >
                                  {roleMeta.label}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 font-mono text-[11px] text-slate-300">
                                <span>{formatBytes(file.sizeBytes)}</span>
                                <span className="text-slate-500">
                                  ({file.sizeBytes.toLocaleString()} B)
                                </span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
