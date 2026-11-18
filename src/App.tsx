import { useCallback, useEffect, useRef, useState } from 'react';
import { HardwareProfile, HfModelSearchResult, RuntimeId } from './types';
import { DetectedRuntime, InstalledModelItem, ModelFilterChip, NavTabId, SortOption } from './ui/types';
import { bridgeService } from './ui/data/mockService';
import { Sidebar } from './ui/components/Sidebar';
import { DiscoveryView } from './ui/components/DiscoveryView';
import { ModelDetailDrawer } from './ui/components/ModelDetailDrawer';
import { InstalledModelsView } from './ui/components/InstalledModelsView';
import { RuntimesView } from './ui/components/RuntimesView';
import { HardwareView } from './ui/components/HardwareView';
import { SettingsVaultView } from './ui/components/SettingsVaultView';
import { GeneralSettingsView } from './ui/components/GeneralSettingsView';

export function App() {
  const [activeTab, setActiveTab] = useState<NavTabId>('discover');
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [activeGpuId, setActiveGpuId] = useState<string>('gpu-0');
  const [safeHeadroomMb, setSafeHeadroomMb] = useState<number>(512);
  const [runtimes, setRuntimes] = useState<DetectedRuntime[]>([]);
  const [installedModels, setInstalledModels] = useState<InstalledModelItem[]>([]);

  // Discovery state
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ModelFilterChip>('all');
  const [sort, setSort] = useState<SortOption>('trendingScore');
  const [models, setModels] = useState<HfModelSearchResult[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [selectedModel, setSelectedModel] = useState<HfModelSearchResult | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const refreshHardware = useCallback(async () => {
    const hw = await bridgeService.getHardwareProfile();
    setHardware(hw);
    if (hw.gpus.length > 0) {
      setActiveGpuId(hw.gpus[0].id);
    }
  }, []);

  const refreshRuntimes = useCallback(async () => {
    const rts = await bridgeService.detectRuntimes();
    setRuntimes(rts);
  }, []);

  const refreshInstalled = useCallback(async () => {
    const list = await bridgeService.listInstalledModels();
    setInstalledModels(list);
  }, []);

  // Live VRAM Usage Polling (every 2.5s)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const live = await bridgeService.getLiveVramUsage(0);
        setHardware((prev) => {
          if (!prev || prev.gpus.length === 0) return prev;
          const updatedGpus = prev.gpus.map((g, idx) => {
            if (idx === 0) {
              return {
                ...g,
                vramFreeBytes: live.freeBytes,
              };
            }
            return g;
          });
          return {
            ...prev,
            gpus: updatedGpus,
          };
        });
      } catch {
        // Silent fallback
      }
    }, 2500);

    return () => clearInterval(interval);
  }, []);

  // Initial bootstrap
  useEffect(() => {
    refreshHardware();
    refreshRuntimes();
    refreshInstalled();
  }, [refreshHardware, refreshRuntimes, refreshInstalled]);

  // Search & filter effect
  useEffect(() => {
    let cancelled = false;
    setIsLoadingModels(true);
    const timer = setTimeout(async () => {
      try {
        const results = await bridgeService.searchModels(query, filter, sort);
        if (!cancelled) {
          setModels(results);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingModels(false);
        }
      }
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, filter, sort]);

  // Global Ctrl+K shortcut for instant search focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setActiveTab('discover');
        setTimeout(() => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        }, 20);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleDeploySuccess = (runtimeId: RuntimeId, modelTag: string, sizeBytes: number) => {
    setInstalledModels((prev) => {
      const exists = prev.some((m) => m.runtimeId === runtimeId && m.id === modelTag);
      if (exists) return prev;
      return [
        {
          runtimeId,
          id: modelTag,
          sizeBytes,
          modifiedAtIso: new Date().toISOString(),
        },
        ...prev,
      ];
    });
  };

  const handleRemoveInstalled = (runtimeId: RuntimeId, id: string) => {
    setInstalledModels((prev) =>
      prev.filter((m) => !(m.runtimeId === runtimeId && m.id === id))
    );
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#090d16] text-slate-100">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        hardware={hardware}
        activeGpuId={activeGpuId}
        runtimes={runtimes}
        installedCount={installedModels.length}
      />

      <main className="relative flex-1 overflow-hidden bg-[radial-gradient(ellipse_at_top_right,_rgba(0,120,212,0.12),_transparent_55%),radial-gradient(ellipse_at_bottom_left,_rgba(168,85,247,0.07),_transparent_50%)]">
        {activeTab === 'discover' && (
          <DiscoveryView
            query={query}
            onQueryChange={setQuery}
            filter={filter}
            onFilterChange={setFilter}
            sort={sort}
            onSortChange={setSort}
            models={models}
            isLoading={isLoadingModels}
            hardware={hardware}
            activeGpuId={activeGpuId}
            safeHeadroomMb={safeHeadroomMb}
            onSelectModel={setSelectedModel}
            searchInputRef={searchInputRef}
          />
        )}

        {activeTab === 'installed' && (
          <InstalledModelsView
            models={installedModels}
            onRemoveModel={handleRemoveInstalled}
            onGoToDiscover={() => setActiveTab('discover')}
          />
        )}

        {activeTab === 'runtimes' && (
          <RuntimesView runtimes={runtimes} onRefresh={refreshRuntimes} />
        )}

        {activeTab === 'hardware' && (
          <HardwareView hardware={hardware} onRefresh={refreshHardware} />
        )}

        {activeTab === 'vault' && <SettingsVaultView />}

        {activeTab === 'settings' && (
          <GeneralSettingsView
            hardware={hardware}
            activeGpuId={activeGpuId}
            onSelectGpu={setActiveGpuId}
            safeHeadroomMb={safeHeadroomMb}
            onChangeSafeHeadroom={setSafeHeadroomMb}
          />
        )}
      </main>

      <ModelDetailDrawer
        model={selectedModel}
        hardware={hardware}
        activeGpuId={activeGpuId}
        safeHeadroomMb={safeHeadroomMb}
        runtimes={runtimes}
        onClose={() => setSelectedModel(null)}
        onDeploySuccess={handleDeploySuccess}
      />
    </div>
  );
}

export default App;
