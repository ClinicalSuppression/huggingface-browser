import React from 'react';
import {
  Search,
  HardDrive,
  Server,
  Activity,
  KeyRound,
  Cpu,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { HardwareProfile } from '../../types';
import { DetectedRuntime, NavTabId } from '../types';
import { formatBytes } from '../utils/format';

interface SidebarProps {
  activeTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
  hardware: HardwareProfile | null;
  runtimes: DetectedRuntime[];
  installedCount: number;
}

interface NavItemConfig {
  id: NavTabId;
  label: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  badge?: string | number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  hardware,
  runtimes,
  installedCount,
}) => {
  const healthyRuntimes = runtimes.filter((r) => r.isHealthy).length;

  const navItems: NavItemConfig[] = [
    { id: 'discover', label: 'Discover', icon: Search },
    {
      id: 'installed',
      label: 'Installed Models',
      icon: HardDrive,
      badge: installedCount > 0 ? installedCount : undefined,
    },
    {
      id: 'runtimes',
      label: 'Runtimes Manager',
      icon: Server,
      badge: healthyRuntimes > 0 ? `${healthyRuntimes}/${runtimes.length}` : undefined,
    },
    { id: 'hardware', label: 'Hardware Monitor', icon: Activity },
    { id: 'settings', label: 'Settings & HF Vault', icon: KeyRound },
  ];

  const primaryGpu = hardware?.gpus[0];
  const vramUsed = primaryGpu ? Math.max(0, primaryGpu.vramTotalBytes - primaryGpu.vramFreeBytes) : 0;
  const vramPct =
    primaryGpu && primaryGpu.vramTotalBytes > 0
      ? Math.min(100, Math.round((vramUsed / primaryGpu.vramTotalBytes) * 100))
      : 0;

  return (
    <aside
      aria-label="Primary navigation"
      className="fluent-mica flex h-full w-64 shrink-0 flex-col border-r border-white/[0.08] select-none"
    >
      {/* App Header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#0078d4] to-[#38bdf8] shadow-md shadow-[#0078d4]/25">
          <Sparkles className="h-5 w-5 text-white" aria-hidden={true} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold tracking-tight text-slate-100">
            HF Model Hub
          </div>
          <div className="truncate text-[11px] font-medium text-slate-400">
            Local Inference Studio
          </div>
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 space-y-1 px-2.5 py-2" role="navigation" aria-label="Main sections">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`group relative flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-[13px] font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-white/[0.09] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                  : 'text-slate-300 hover:bg-white/[0.05] hover:text-white'
              }`}
            >
              {/* Windows 11 Fluent Active Pill */}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-[#38bdf8] shadow-[0_0_8px_rgba(56,189,248,0.8)]"
                />
              )}

              <span className="flex items-center gap-3 min-w-0">
                <Icon
                  aria-hidden={true}
                  className={`h-4 w-4 shrink-0 transition-colors ${
                    isActive ? 'text-[#38bdf8]' : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </span>

              {item.badge !== undefined && (
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    isActive
                      ? 'bg-[#0078d4]/30 text-[#7dd3fc] border border-[#38bdf8]/30'
                      : 'bg-white/[0.06] text-slate-400'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Live Hardware & Vault Telemetry Card */}
      <div className="p-3">
        <button
          type="button"
          onClick={() => onSelectTab('hardware')}
          className="w-full rounded-xl border border-white/[0.08] bg-[#0f172a]/80 p-3 text-left transition-colors hover:border-white/[0.16] hover:bg-slate-800/60"
          aria-label="Open Hardware Monitor"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <Cpu className="h-3.5 w-3.5 text-[#38bdf8]" aria-hidden={true} />
              GPU Ready
            </span>
            <span className="flex items-center gap-1 text-[11px] text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
              Active
            </span>
          </div>

          <div className="truncate text-xs font-medium text-slate-200">
            {primaryGpu ? primaryGpu.name : 'Detecting GPU...'}
          </div>

          {primaryGpu && (
            <>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#0078d4] to-[#38bdf8] transition-all duration-300"
                  style={{ width: `${Math.max(12, vramPct)}%` }}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                <span>{formatBytes(primaryGpu.vramFreeBytes)} free</span>
                <span>{formatBytes(primaryGpu.vramTotalBytes)} total</span>
              </div>
            </>
          )}

          <div className="mt-2.5 flex items-center gap-1.5 border-t border-white/[0.06] pt-2 text-[11px] text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5 text-slate-400" aria-hidden={true} />
            <span>Windows Credential Vault</span>
          </div>
        </button>
      </div>
    </aside>
  );
};
