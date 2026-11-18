import { useCallback, useEffect, useRef, useState } from 'react';
import { HardwareProfile, HfModelSearchResult, RuntimeId } from './types';
import {
  AppSettings,
  DEFAULT_DISCOVERY_FILTERS,
  DetectedRuntime,
  DiscoveryFilters,
  InstalledModelItem,
  NavTabId,
  RuntimeOptionsConfig,
  SortOption,
} from './ui/types';
import { bridgeService } from './ui/data/mockService';
import { DEFAULT_APP_SETTINGS } from './ui/utils/format';
import { Sidebar } from './ui/components/Sidebar';
import { DiscoveryView } from './ui/components/DiscoveryView';
import { ModelDetailDrawer } from './ui/components/ModelDetailDrawer';
import { InstalledModelsView } from './ui/components/InstalledModelsView';
import { RuntimesView } from './ui/components/RuntimesView';
import { HardwareView } from './ui/components/HardwareView';
import { SettingsVaultView } from './ui/components/SettingsVaultView';
import { GeneralSettingsView } from './ui/components/GeneralSettingsView';

const SETTINGS_STORAGE_KEY = 'hf-browser-settings-v1';
const ACTIVE_GPU_STORAGE_KEY = 'hf_browser_active_gpu_id';

function loadInitialSettings(): AppSettings {
  let persistedGpuId: string | null = null;
  try {
    persistedGpuId = window.localStorage.getItem(ACTIVE_GPU_STORAGE_KEY);
  } catch {
    // Ignore storage access errors
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return persistedGpuId
        ? { ...DEFAULT_APP_SETTINGS, activeGpuId: persistedGpuId }
        : DEFAULT_APP_SETTINGS;
    }
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...DEFAULT_APP_SETTINGS,
      ...parsed,
      activeGpuId: persistedGpuId || parsed.activeGpuId || DEFAULT_APP_SETTINGS.activeGpuId,
      runtimeOptions: {
        ollama: { ...DEFAULT_APP_SETTINGS.runtimeOptions.ollama, ...parsed.runtimeOptions?.ollama },
        llamacpp: { ...DEFAULT_APP_SETTINGS.runtimeOptions.llamacpp, ...parsed.runtimeOptions?.llamacpp },
        xollama: { ...DEFAULT_APP_SETTINGS.runtimeOptions.xollama, ...parsed.runtimeOptions?.xollama },
        vllm: { ...DEFAULT_APP_SETTINGS.runtimeOptions.vllm, ...parsed.runtimeOptions?.vllm },
      },
    };
  } catch {
    return persistedGpuId
      ? { ...DEFAULT_APP_SETTINGS, activeGpuId: persistedGpuId }
      : DEFAULT_APP_SETTINGS;
  }
}

export function App() {
  const [activeTab, setActiveTab] = useState<NavTabId>('discover');
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [runtimes, setRuntimes] = useState<DetectedRuntime[]>([]);
  const [installedModels, setInstalledModels] = useState<InstalledModelItem[]>([]);
  const [settings, setSettings] = useState<AppSettings>(loadInitialSettings);

  // Search HF state
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<DiscoveryFilters>(DEFAULT_DISCOVERY_FILTERS);
  const [sort, setSort] = useState<SortOption>('trendingScore');
  const [models, setModels] = useState<HfModelSearchResult[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [selectedModel, setSelectedModel] = useState<HfModelSearchResult | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const updateSettings = useCallback((next: AppSettings) => {
    setSettings(next);
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
      if (next.activeGpuId) {
        window.localStorage.setItem(ACTIVE_GPU_STORAGE_KEY, next.activeGpuId);
      }
    } catch {
      // Ignore storage quota errors
    }
  }, []);

  const updateRuntimeOptions = useCallback(
    (nextRuntimeOpts: RuntimeOptionsConfig) => {
      updateSettings({
        ...settings,
        runtimeOptions: nextRuntimeOpts,
      });
    },
    [settings, updateSettings]
  );

  const refreshHardware = useCallback(async () => {
    const hw = await bridgeService.getHardwareProfile();
    setHardware(hw);
  }, []);

  const refreshRuntimes = useCallback(async () => {
    const rts = await bridgeService.detectRuntimes();
    setRuntimes(rts);
  }, []);

  const refreshInstalled = useCallback(async () => {
    const list = await bridgeService.listInstalledModels();
    setInstalledModels(list);
  }, []);

  // Initial bootstrap
  useEffect(() => {
    refreshHardware();
    refreshRuntimes();
    refreshInstalled();
  }, [refreshHardware, refreshRuntimes, refreshInstalled]);

  // Configurable hardware polling when window is visible
  useEffect(() => {
    if (settings.hardwarePollingRateMs <= 0) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshHardware();
      }
    }, settings.hardwarePollingRateMs);
    return () => clearInterval(interval);
  }, [settings.hardwarePollingRateMs, refreshHardware]);

  // Search & filter effect
  useEffect(() => {
    let cancelled = false;
    setIsLoadingModels(true);
    const timer = setTimeout(async () => {
      try {
        const results = await bridgeService.searchModels(query, filters, sort);
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
  }, [query, filters, sort]);

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
          checksumStatus: 'verified',
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
        activeGpuId={settings.activeGpuId}
        runtimes={runtimes}
        installedCount={installedModels.length}
      />

      <main className="relative flex-1 min-w-0 h-full overflow-hidden flex flex-col bg-[radial-gradient(ellipse_at_top_right,_rgba(0,120,212,0.12),_transparent_55%),radial-gradient(ellipse_at_bottom_left,_rgba(168,85,247,0.07),_transparent_50%)]">
        {activeTab === 'discover' && (
          <DiscoveryView
            query={query}
            onQueryChange={setQuery}
            filters={filters}
            onFiltersChange={setFilters}
            sort={sort}
            onSortChange={setSort}
            models={models}
            isLoading={isLoadingModels}
            hardware={hardware}
            activeGpuId={settings.activeGpuId}
            safeHeadroomMb={settings.safeVramHeadroomMb}
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
          <RuntimesView
            runtimes={runtimes}
            runtimeOptions={settings.runtimeOptions}
            onUpdateRuntimeOptions={updateRuntimeOptions}
            onRefresh={refreshRuntimes}
          />
        )}

        {activeTab === 'hardware' && (
          <HardwareView hardware={hardware} onRefresh={refreshHardware} />
        )}

        {activeTab === 'vault' && <SettingsVaultView />}

        {activeTab === 'settings' && (
          <GeneralSettingsView
            settings={settings}
            hardware={hardware}
            onUpdateSettings={updateSettings}
          />
        )}
      </main>

      {selectedModel && (
        <ModelDetailDrawer
          model={selectedModel}
          hardware={hardware}
          activeGpuId={settings.activeGpuId}
          safeHeadroomMb={settings.safeVramHeadroomMb}
          defaultPresetIntent={settings.defaultPresetIntent}
          runtimes={runtimes}
          onClose={() => setSelectedModel(null)}
          onDeploySuccess={handleDeploySuccess}
        />
      )}
    </div>
  );
}

export default App;
