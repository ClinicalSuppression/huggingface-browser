import React, { useState } from 'react';
import { Settings, Cpu, Shield, HardDrive, CheckCircle2 } from 'lucide-react';
import { HardwareProfile } from '../../types';
import { formatBytes } from '../utils/format';

interface GeneralSettingsViewProps {
  hardware: HardwareProfile | null;
  activeGpuId: string;
  onSelectGpu: (id: string) => void;
  safeHeadroomMb: number;
  onChangeSafeHeadroom: (mb: number) => void;
}

export const GeneralSettingsView: React.FC<GeneralSettingsViewProps> = ({
  hardware,
  activeGpuId,
  onSelectGpu,
  safeHeadroomMb,
  onChangeSafeHeadroom,
}) => {
  const [pollingRateSec, setPollingRateSec] = useState<number>(2);
  const [telemetryEnabled, setTelemetryEnabled] = useState<boolean>(false);
  const [storagePath, setStoragePath] = useState<string>('~/.cache/huggingface/hub');
  const [saveToast, setSaveToast] = useState<boolean>(false);

  const handleSave = () => {
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2500);
  };

  return (
    <section aria-label="General Settings" className="flex h-full flex-col">
      <header className="border-b border-white/[0.08] bg-[#090d16]/75 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white flex items-center gap-2">
              <Settings className="h-5 w-5 text-[#38bdf8]" aria-hidden={true} />
              General Settings
            </h1>
            <p className="mt-0.5 text-xs text-slate-400">
              Configure active GPU sizing targets, VRAM safety buffers, and scan paths for HF Browser
            </p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0078d4] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1084d8] shadow-md shadow-[#0078d4]/20"
          >
            Save Settings
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 max-w-4xl">
        {saveToast && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-4 py-3 text-xs text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            <span>Settings saved successfully.</span>
          </div>
        )}

        {/* 1. Active GPU Selection */}
        <div className="fluent-card rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <Cpu className="h-4 w-4 text-[#38bdf8]" />
            <h2 className="text-sm font-semibold text-white">Active Inference GPU</h2>
          </div>
          <p className="text-xs text-slate-400">
            Select the primary graphics adapter used for model compatibility sizing, VRAM headroom monitoring, and layer offloading.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {hardware?.gpus.map((gpu) => {
              const isSelected = activeGpuId === gpu.id;
              return (
                <button
                  key={gpu.id}
                  type="button"
                  onClick={() => onSelectGpu(gpu.id)}
                  className={`rounded-xl border p-3.5 text-left transition-all ${
                    isSelected
                      ? 'border-[#38bdf8] bg-[#0078d4]/20 shadow-[0_0_0_1px_rgba(56,189,248,0.3)]'
                      : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">{gpu.name}</span>
                    {isSelected && (
                      <span className="rounded bg-[#38bdf8]/20 px-2 py-0.5 text-[10px] font-medium text-[#7dd3fc]">
                        Active Target
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    Dedicated VRAM: {formatBytes(gpu.vramTotalBytes)} &middot; Vendor: <span className="uppercase">{gpu.vendor}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Safe VRAM Headroom */}
        <div className="fluent-card rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <Shield className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-white">Safe VRAM Headroom / Buffer</h2>
          </div>
          <p className="text-xs text-slate-400">
            Amount of VRAM kept strictly free for Windows Desktop Window Manager (DWM) and display surfaces during model sizing.
          </p>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">Safe Headroom Buffer:</span>
              <span className="text-emerald-300 font-bold">{safeHeadroomMb} MB</span>
            </div>
            <input
              type="range"
              min={256}
              max={4096}
              step={128}
              value={safeHeadroomMb}
              onChange={(e) => onChangeSafeHeadroom(Number(e.target.value))}
              className="fluent-slider w-full"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>256 MB</span>
              <span>512 MB (Default)</span>
              <span>1024 MB</span>
              <span>2048 MB</span>
              <span>4096 MB</span>
            </div>
          </div>
        </div>

        {/* 3. Storage & Cache Paths */}
        <div className="fluent-card rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <HardDrive className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-white">Model Storage & Scan Paths</h2>
          </div>
          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Default Model Download Directory</label>
              <input
                type="text"
                value={storagePath}
                onChange={(e) => setStoragePath(e.target.value)}
                className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-white font-mono text-xs focus:border-[#38bdf8] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Local Service Cache Scan Locations</label>
              <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 space-y-1.5 font-mono text-[11px] text-slate-400">
                <div>&bull; %USERPROFILE%\.cache\huggingface\hub\</div>
                <div>&bull; %USERPROFILE%\.ollama\models\</div>
                <div>&bull; %USERPROFILE%\.cache\lm-studio\models\</div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Polling & Telemetry */}
        <div className="fluent-card rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Application Diagnostics & Telemetry</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Hardware & Service Health Polling Rate</label>
              <select
                value={pollingRateSec}
                onChange={(e) => setPollingRateSec(Number(e.target.value))}
                className="w-full rounded-lg border border-white/[0.1] bg-[#0f172a] px-3 py-2 text-white text-xs focus:border-[#38bdf8] focus:outline-none"
              >
                <option value={1}>1 second (High fidelity)</option>
                <option value={2}>2 seconds (Default balanced)</option>
                <option value={5}>5 seconds (Battery saver)</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Telemetry & Crash Reporting</label>
              <button
                type="button"
                onClick={() => setTelemetryEnabled(!telemetryEnabled)}
                className={`w-full rounded-lg border px-3 py-2 text-left font-medium transition-colors ${
                  telemetryEnabled
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-white/[0.1] bg-white/[0.03] text-slate-400'
                }`}
              >
                {telemetryEnabled ? 'Enabled (Anonymous error reports)' : 'Disabled (Zero phone-home default)'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
