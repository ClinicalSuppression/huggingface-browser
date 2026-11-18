import React, { useState } from 'react';
import {
  Cpu,
  FolderSearch,
  Gauge,
  Plus,
  RotateCcw,
  Shield,
  Sliders,
  Trash2,
} from 'lucide-react';
import { HardwareProfile, PresetIntent } from '../../types';
import { AppSettings } from '../types';
import { DEFAULT_APP_SETTINGS, formatBytes } from '../utils/format';

interface GeneralSettingsViewProps {
  settings: AppSettings;
  hardware: HardwareProfile | null;
  onUpdateSettings: (next: AppSettings) => void;
}

const POLLING_OPTIONS: Array<{ value: AppSettings['hardwarePollingRateMs']; label: string }> = [
  { value: 1000, label: '1 second (High frequency)' },
  { value: 2000, label: '2 seconds (Default)' },
  { value: 5000, label: '5 seconds (Low overhead)' },
  { value: 0, label: 'Manual refresh only' },
];

const PRESET_OPTIONS: Array<{ value: PresetIntent; label: string }> = [
  { value: 'instruct', label: 'Instruct / Chat' },
  { value: 'reasoning', label: 'Reasoning / Deep Thinking' },
  { value: 'coding', label: 'Coding / Strict Logic' },
  { value: 'creative', label: 'Creative Writing' },
];

export const GeneralSettingsView: React.FC<GeneralSettingsViewProps> = ({
  settings,
  hardware,
  onUpdateSettings,
}) => {
  const [newScanPath, setNewScanPath] = useState('');

  const gpus = hardware?.gpus ?? [];
  const selectedGpu =
    gpus.find((g) => g.id === settings.activeGpuId) || gpus[0] || null;

  const handleAddScanPath = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newScanPath.trim();
    if (!trimmed) return;
    if (settings.localCacheScanPaths.includes(trimmed)) {
      setNewScanPath('');
      return;
    }
    onUpdateSettings({
      ...settings,
      localCacheScanPaths: [...settings.localCacheScanPaths, trimmed],
    });
    setNewScanPath('');
  };

  const handleRemoveScanPath = (pathToRemove: string) => {
    onUpdateSettings({
      ...settings,
      localCacheScanPaths: settings.localCacheScanPaths.filter((p) => p !== pathToRemove),
    });
  };

  const handleReset = () => {
    onUpdateSettings({
      ...DEFAULT_APP_SETTINGS,
      activeGpuId: gpus[0]?.id || DEFAULT_APP_SETTINGS.activeGpuId,
    });
  };

  const formatHeadroomLabel = (mb: number): string => {
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(1)} GB (${mb} MB)`;
    }
    return `${mb} MB`;
  };

  return (
    <section aria-label="General Settings" className="flex h-full flex-col">
      <header className="border-b border-white/[0.08] bg-[#090d16]/75 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">Settings</h1>
            <p className="mt-0.5 text-xs text-slate-400">
              Configure active GPU selection, VRAM headroom, local cache scan paths, and telemetry
            </p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-white/[0.05] px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-white/[0.1]"
          >
            <RotateCcw className="h-3.5 w-3.5 text-[#38bdf8]" aria-hidden={true} />
            Reset to Defaults
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-5">
          {/* 1. Active GPU & Safe VRAM Headroom */}
          <div className="fluent-card rounded-xl p-5 space-y-5">
            <div className="flex items-center gap-2.5">
              <Cpu className="h-4 w-4 text-[#38bdf8]" aria-hidden={true} />
              <h2 className="text-sm font-semibold text-white">
                Hardware &amp; VRAM Sizing
              </h2>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="active-gpu-select"
                className="block text-xs font-medium text-slate-300"
              >
                Active Inference GPU
              </label>
              <select
                id="active-gpu-select"
                value={selectedGpu?.id || settings.activeGpuId}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, activeGpuId: e.target.value })
                }
                className="w-full rounded-lg border border-white/[0.1] bg-[#090d16] px-3 py-2 text-xs font-medium text-slate-100 focus:border-[#38bdf8] focus:outline-none"
              >
                {gpus.length > 0 ? (
                  gpus.map((gpu) => (
                    <option key={gpu.id} value={gpu.id}>
                      {gpu.name} ({formatBytes(gpu.vramTotalBytes)} VRAM &middot;{' '}
                      {formatBytes(gpu.vramFreeBytes)} Free)
                    </option>
                  ))
                ) : (
                  <option value="gpu-0">AMD Radeon RX 7800 XT (16.0 GB VRAM)</option>
                )}
              </select>
              <p className="text-[11px] text-slate-400">
                Disabled integrated graphics (CM_PROB_PHANTOM) are automatically filtered; discrete GPUs are prioritized.
              </p>
            </div>

            <div className="border-t border-white/[0.06] pt-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="vram-headroom-slider" className="font-medium text-slate-200">
                  Safe VRAM Headroom
                </label>
                <span className="rounded bg-white/[0.06] px-2 py-0.5 font-mono text-xs text-[#7dd3fc]">
                  {formatHeadroomLabel(settings.safeVramHeadroomMb)}
                </span>
              </div>
              <input
                id="vram-headroom-slider"
                type="range"
                min={256}
                max={4096}
                step={128}
                value={settings.safeVramHeadroomMb}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    safeVramHeadroomMb: Number(e.target.value),
                  })
                }
                className="fluent-slider w-full"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>256 MB</span>
                <span>512 MB (Default)</span>
                <span>2.0 GB</span>
                <span>4.0 GB</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Reserved buffer deducted from live free GPU VRAM to prevent display-driver stalls and OOM thrashing.
              </p>
            </div>
          </div>

          {/* 2. Default Purpose Preset & Model Storage */}
          <div className="fluent-card rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <Sliders className="h-4 w-4 text-purple-400" aria-hidden={true} />
              <h2 className="text-sm font-semibold text-white">Defaults &amp; Storage</h2>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="default-preset-select"
                  className="block text-xs font-medium text-slate-300"
                >
                  Default Purpose Preset
                </label>
                <select
                  id="default-preset-select"
                  value={settings.defaultPresetIntent}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      defaultPresetIntent: e.target.value as PresetIntent,
                    })
                  }
                  className="w-full rounded-lg border border-white/[0.1] bg-[#090d16] px-3 py-2 text-xs font-medium text-slate-100 focus:border-[#38bdf8] focus:outline-none"
                >
                  {PRESET_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="model-storage-path"
                  className="block text-xs font-medium text-slate-300"
                >
                  Model Storage Path
                </label>
                <input
                  id="model-storage-path"
                  type="text"
                  value={settings.modelStoragePath}
                  onChange={(e) =>
                    onUpdateSettings({ ...settings, modelStoragePath: e.target.value })
                  }
                  className="w-full rounded-lg border border-white/[0.1] bg-[#090d16] px-3 py-2 font-mono text-xs text-slate-100 focus:border-[#38bdf8] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* 3. Local Cache Scan Paths */}
          <div className="fluent-card rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <FolderSearch className="h-4 w-4 text-[#38bdf8]" aria-hidden={true} />
              <h2 className="text-sm font-semibold text-white">Local Cache Scan Paths</h2>
            </div>
            <p className="text-xs text-slate-400">
              Directories scanned for existing Hugging Face, Ollama, LM Studio, and GGUF model artifacts.
            </p>

            <ul className="space-y-2">
              {settings.localCacheScanPaths.map((scanPath) => (
                <li
                  key={scanPath}
                  className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-[#090d16]/75 px-3 py-2"
                >
                  <span className="truncate font-mono text-xs text-slate-200">{scanPath}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveScanPath(scanPath)}
                    aria-label={`Remove scan path ${scanPath}`}
                    className="rounded p-1 text-slate-400 hover:bg-rose-500/15 hover:text-rose-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden={true} />
                  </button>
                </li>
              ))}
            </ul>

            <form onSubmit={handleAddScanPath} className="flex gap-2">
              <input
                type="text"
                value={newScanPath}
                onChange={(e) => setNewScanPath(e.target.value)}
                placeholder="D:\Models\GGUF"
                aria-label="Add local cache scan path"
                className="flex-1 rounded-lg border border-white/[0.1] bg-[#090d16] px-3 py-2 font-mono text-xs text-slate-100 placeholder-slate-600 focus:border-[#38bdf8] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!newScanPath.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0078d4] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1084d8] disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden={true} />
                Add Path
              </button>
            </form>
          </div>

          {/* 4. Hardware Polling Rate & Telemetry Opt-In */}
          <div className="fluent-card rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <Gauge className="h-4 w-4 text-emerald-400" aria-hidden={true} />
              <h2 className="text-sm font-semibold text-white">
                Monitoring &amp; Privacy
              </h2>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="polling-rate-select"
                className="block text-xs font-medium text-slate-300"
              >
                Hardware Polling Rate
              </label>
              <select
                id="polling-rate-select"
                value={settings.hardwarePollingRateMs}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    hardwarePollingRateMs: Number(e.target.value) as AppSettings['hardwarePollingRateMs'],
                  })
                }
                className="w-full rounded-lg border border-white/[0.1] bg-[#090d16] px-3 py-2 text-xs font-medium text-slate-100 focus:border-[#38bdf8] focus:outline-none"
              >
                {POLLING_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-white/[0.06] pt-4">
              <div className="flex items-start gap-2.5">
                <Shield className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden={true} />
                <div>
                  <div id="telemetry-label" className="text-xs font-medium text-slate-200">
                    Anonymous Telemetry (Opt-in)
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Share anonymous crash diagnostics and compatibility metrics. Off by default.
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={settings.telemetryOptIn}
                aria-labelledby="telemetry-label"
                onClick={() =>
                  onUpdateSettings({
                    ...settings,
                    telemetryOptIn: !settings.telemetryOptIn,
                  })
                }
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
                  settings.telemetryOptIn
                    ? 'border-[#38bdf8]/60 bg-[#0078d4]'
                    : 'border-white/[0.15] bg-white/[0.08]'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.telemetryOptIn ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
