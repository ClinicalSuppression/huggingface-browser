import React, { useState } from 'react';
import { Activity, Cpu, MemoryStick, RefreshCw, Zap } from 'lucide-react';
import { HardwareProfile } from '../../types';
import { formatBytes } from '../utils/format';

interface HardwareViewProps {
  hardware: HardwareProfile | null;
  onRefresh: () => Promise<void>;
}

export const HardwareView: React.FC<HardwareViewProps> = ({ hardware, onRefresh }) => {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };

  const ramUsed = hardware
    ? Math.max(0, hardware.systemRamTotalBytes - hardware.systemRamAvailableBytes)
    : 0;
  const ramPct =
    hardware && hardware.systemRamTotalBytes > 0
      ? Math.round((ramUsed / hardware.systemRamTotalBytes) * 100)
      : 0;

  return (
    <section aria-label="Hardware Monitor" className="flex h-full flex-col">
      <header className="border-b border-white/[0.08] bg-[#090d16]/75 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">Hardware Monitor</h1>
            <p className="mt-0.5 text-xs text-slate-400">
              Live GPU VRAM, System RAM, and CPU instruction set telemetry
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.05] px-4 py-2 text-xs font-medium text-slate-200 hover:bg-white/[0.1] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden={true} />
            {refreshing ? 'Refreshing...' : 'Refresh Telemetry'}
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
        {/* GPUs */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Graphics Accelerators (VRAM)
          </h2>
          {hardware?.gpus.map((gpu) => {
            const used = Math.max(0, gpu.vramTotalBytes - gpu.vramFreeBytes);
            const pct =
              gpu.vramTotalBytes > 0 ? Math.round((used / gpu.vramTotalBytes) * 100) : 0;

            return (
              <div key={gpu.id} className="fluent-card rounded-xl p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#38bdf8]/30 bg-[#0078d4]/20 text-[#38bdf8]">
                      <Zap className="h-5 w-5" aria-hidden={true} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">{gpu.name}</h3>
                      <span className="text-xs text-slate-400">
                        Vendor: <span className="uppercase">{gpu.vendor}</span> &middot; Driver{' '}
                        {gpu.driverVersion}
                      </span>
                    </div>
                  </div>
                  <span className="rounded-md border border-emerald-500/30 bg-emerald-500/12 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                    {formatBytes(gpu.vramFreeBytes)} Free / {formatBytes(gpu.vramTotalBytes)}
                  </span>
                </div>

                <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#0078d4] to-[#38bdf8] transition-all duration-300"
                    style={{ width: `${Math.max(8, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* System Memory & CPU */}
        {hardware && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="fluent-card rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2.5">
                <MemoryStick className="h-5 w-5 text-purple-400" aria-hidden={true} />
                <h2 className="text-sm font-semibold text-white">System Memory (RAM)</h2>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-purple-600 to-purple-400"
                  style={{ width: `${ramPct}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>{formatBytes(hardware.systemRamAvailableBytes)} available for CPU offload</span>
                <span>{formatBytes(hardware.systemRamTotalBytes)} total</span>
              </div>
            </div>

            <div className="fluent-card rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2.5">
                <Cpu className="h-5 w-5 text-[#38bdf8]" aria-hidden={true} />
                <h2 className="text-sm font-semibold text-white">Processor &amp; ISA</h2>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg bg-white/[0.04] p-2.5">
                  <div className="text-slate-400">Architecture</div>
                  <div className="mt-0.5 font-mono font-semibold text-white">
                    {hardware.cpuArchitecture}
                  </div>
                </div>
                <div className="rounded-lg bg-white/[0.04] p-2.5">
                  <div className="text-slate-400">Logical Cores</div>
                  <div className="mt-0.5 font-mono font-semibold text-white">
                    {hardware.cpuLogicalCores} threads
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Activity className="h-3.5 w-3.5 text-emerald-400" aria-hidden={true} />
                <span className="text-slate-300">
                  AVX2: <strong>{hardware.supportsAvx2 ? 'Supported' : 'No'}</strong> &middot; AVX-512:{' '}
                  <strong>{hardware.supportsAvx512 ? 'Supported' : 'No'}</strong>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
