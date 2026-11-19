import React, { useMemo } from 'react';
import { Search, RotateCcw, X } from 'lucide-react';
import { HardwareProfile, HfModelSearchResult } from '../../types';
import {
  AlignmentFilter,
  DEFAULT_DISCOVERY_FILTERS,
  DiscoveryFilters,
  FamilyFilter,
  FormatFilter,
  HardwareFitFilter,
  ParamSizeFilter,
  SortOption,
  TaskFilter,
} from '../types';
import { calculateBestFitContext } from '../utils/format';
import { ModelCard } from './ModelCard';

interface DiscoveryViewProps {
  query: string;
  onQueryChange: (q: string) => void;
  filters: DiscoveryFilters;
  onFiltersChange: (f: DiscoveryFilters) => void;
  sort: SortOption;
  onSortChange: (s: SortOption) => void;
  models: HfModelSearchResult[];
  isLoading: boolean;
  hardware: HardwareProfile | null;
  activeGpuId?: string;
  safeHeadroomMb?: number;
  onSelectModel: (model: HfModelSearchResult) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

const TASK_OPTIONS: Array<{ id: TaskFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'any-to-any', label: 'Any-to-Any' },
  { id: 'text-generation', label: 'Text Gen' },
  { id: 'image-text-to-text', label: 'Vision' },
  { id: 'conversational', label: 'Chat' },
  { id: 'coding', label: 'Code' },
  { id: 'feature-extraction', label: 'Embeddings' },
];

const FORMAT_OPTIONS: Array<{ id: FormatFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'gguf', label: 'GGUF' },
  { id: 'safetensors', label: 'SafeTensors' },
  { id: 'fp8', label: 'FP8' },
];

const ALIGNMENT_OPTIONS: Array<{ id: AlignmentFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'uncensored', label: 'Uncensored' },
  { id: 'aligned', label: 'Standard' },
];

const FAMILY_OPTIONS: Array<{ id: FamilyFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'llama', label: 'Llama' },
  { id: 'qwen', label: 'Qwen' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'mistral', label: 'Mistral' },
  { id: 'gemma', label: 'Gemma' },
  { id: 'phi', label: 'Phi' },
  { id: 'lfm', label: 'Liquid' },
  { id: 'command-r', label: 'Command R' },
  { id: 'starcoder', label: 'StarCoder' },
  { id: 'glm', label: 'GLM' },
  { id: 'yi', label: 'Yi' },
  { id: 'internlm', label: 'InternLM' },
  { id: 'exaone', label: 'EXAONE' },
  { id: 'solar', label: 'Solar' },
  { id: 'smollm', label: 'SmolLM' },
];

const HARDWARE_FIT_OPTIONS: Array<{ id: HardwareFitFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'gpu', label: 'Full GPU' },
  { id: 'partial', label: 'Partial' },
  { id: 'cpu', label: 'CPU' },
];

const PARAM_SIZE_OPTIONS: Array<{ id: ParamSizeFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'under-4b', label: '< 4B' },
  { id: '7b-9b', label: '7B–9B' },
  { id: '12b-16b', label: '12B–16B' },
  { id: '20b-40b', label: '20B–40B' },
  { id: '70b-plus', label: '70B+' },
];

const SORT_OPTIONS: Array<{ id: SortOption; label: string }> = [
  { id: 'trendingScore', label: 'Trending' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'likes', label: 'Likes' },
  { id: 'lastModified', label: 'Recent' },
];

const selectBaseClass =
  'h-7 w-full rounded-md border border-white/[0.1] bg-[#0f172a] px-2 py-0.5 text-[11px] font-medium text-slate-200 transition-colors hover:border-white/[0.2] focus:border-[#38bdf8] focus:outline-none';

export const DiscoveryView: React.FC<DiscoveryViewProps> = ({
  query,
  onQueryChange,
  filters,
  onFiltersChange,
  sort,
  onSortChange,
  models,
  isLoading,
  hardware,
  activeGpuId,
  safeHeadroomMb,
  onSelectModel,
  searchInputRef,
}) => {
  const filteredModels = useMemo(() => {
    if (filters.hardwareFit === 'all') return models;
    return models.filter((model) => {
      const fit = calculateBestFitContext(model, hardware, activeGpuId, safeHeadroomMb);
      if (!fit) return true;
      if (filters.hardwareFit === 'gpu') return fit.status === 'gpu';
      if (filters.hardwareFit === 'partial') return fit.status === 'minimal';
      if (filters.hardwareFit === 'cpu') return fit.status === 'cpu';
      return true;
    });
  }, [models, filters.hardwareFit, hardware, activeGpuId, safeHeadroomMb]);

  const hasActiveFilters =
    filters.task !== 'all' ||
    filters.format !== 'all' ||
    filters.alignment !== 'all' ||
    filters.family !== 'all' ||
    filters.hardwareFit !== 'all' ||
    filters.paramSize !== 'all';

  const handleResetAll = () => {
    onQueryChange('');
    onFiltersChange(DEFAULT_DISCOVERY_FILTERS);
  };

  return (
    <section aria-label="Search HF" className="flex h-full flex-col">
      {/* Top Header & Search Bar */}
      <header className="border-b border-white/[0.08] bg-[#090d16]/75 px-6 py-4 backdrop-blur-md max-[640px]:px-3 max-[640px]:py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">
              Search HF
            </h1>
            <p className="mt-0.5 text-xs text-slate-400">
              Browse Hugging Face Hub with real-time Windows hardware fit &amp; one-click local deployment
            </p>
          </div>

          {/* Search Input with Ctrl+K hint */}
          <div className="relative w-full lg:max-w-md">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden={true}
            />
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search models, authors, or tags (e.g. DeepSeek-R1, Qwen)..."
              aria-label="Search Hugging Face models"
              className="w-full rounded-lg border border-white/[0.1] bg-[#0f172a]/90 py-2 pl-10 pr-20 text-sm text-slate-100 placeholder-slate-500 transition-colors hover:border-white/[0.18] focus:border-[#38bdf8] focus:outline-none"
            />
            {query ? (
              <button
                type="button"
                onClick={() => onQueryChange('')}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-white/[0.08] hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" aria-hidden={true} />
              </button>
            ) : (
              <kbd
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-white/[0.12] bg-white/[0.05] px-1.5 py-0.5 text-[11px] font-medium text-slate-400"
              >
                Ctrl+K
              </kbd>
            )}
          </div>
        </div>

        {/* Rich 7-Dropdown Filter & Sort Toolbar */}
        <div
          role="group"
          aria-label="Model search filters and sort order"
          className="mt-3.5 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="filter-task" className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Task
            </label>
            <select
              id="filter-task"
              value={filters.task}
              onChange={(e) => onFiltersChange({ ...filters, task: e.target.value as TaskFilter })}
              className={selectBaseClass}
            >
              {TASK_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="filter-format" className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Format
            </label>
            <select
              id="filter-format"
              value={filters.format}
              onChange={(e) => onFiltersChange({ ...filters, format: e.target.value as FormatFilter })}
              className={selectBaseClass}
            >
              {FORMAT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="filter-alignment" className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Content
            </label>
            <select
              id="filter-alignment"
              value={filters.alignment}
              onChange={(e) => onFiltersChange({ ...filters, alignment: e.target.value as AlignmentFilter })}
              className={selectBaseClass}
            >
              {ALIGNMENT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="filter-family" className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Arch
            </label>
            <select
              id="filter-family"
              value={filters.family}
              onChange={(e) => onFiltersChange({ ...filters, family: e.target.value as FamilyFilter })}
              className={selectBaseClass}
            >
              {FAMILY_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="filter-hardware-fit" className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Fit
            </label>
            <select
              id="filter-hardware-fit"
              value={filters.hardwareFit}
              onChange={(e) => onFiltersChange({ ...filters, hardwareFit: e.target.value as HardwareFitFilter })}
              className={selectBaseClass}
            >
              {HARDWARE_FIT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="filter-param-size" className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Size
            </label>
            <select
              id="filter-param-size"
              value={filters.paramSize}
              onChange={(e) => onFiltersChange({ ...filters, paramSize: e.target.value as ParamSizeFilter })}
              className={selectBaseClass}
            >
              {PARAM_SIZE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="discovery-sort" className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Sort
            </label>
            <select
              id="discovery-sort"
              value={sort}
              onChange={(e) => onSortChange(e.target.value as SortOption)}
              className={selectBaseClass}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {(hasActiveFilters || query) && (
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400">
            <span>
              Showing <strong className="text-slate-200">{filteredModels.length}</strong> matching model{filteredModels.length === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              onClick={handleResetAll}
              className="inline-flex items-center gap-1 rounded-md border border-white/[0.1] bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-slate-300 transition-colors hover:bg-white/[0.09] hover:text-white"
            >
              <RotateCcw className="h-3 w-3 text-[#38bdf8]" aria-hidden={true} />
              Reset Filters
            </button>
          </div>
        )}
      </header>

      {/* Model Grid Content (Reflows dynamically via auto-fill when right pane opens/resizes) */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {isLoading ? 'Loading models.' : `${filteredModels.length} matching model${filteredModels.length === 1 ? '' : 's'} found.`}
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5 max-[640px]:px-3 max-[640px]:py-3">
        {isLoading ? (
          <div
            className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,235px),1fr))] gap-3"
            aria-busy="true"
          >
            {Array.from({ length: 10 }).map((_, idx) => (
              <div
                key={idx}
                className="fluent-card h-40 animate-pulse rounded-xl p-3"
              >
                <div className="h-3 w-20 rounded bg-white/[0.07]" />
                <div className="mt-2.5 h-4 w-3/4 rounded bg-white/[0.09]" />
                <div className="mt-2.5 h-3 w-full rounded bg-white/[0.05]" />
                <div className="mt-1.5 h-3 w-2/3 rounded bg-white/[0.05]" />
              </div>
            ))}
          </div>
        ) : filteredModels.length === 0 ? (
          <div className="fluent-card mx-auto mt-12 max-w-md rounded-xl p-8 text-center">
            <Search className="mx-auto h-8 w-8 text-slate-500" aria-hidden={true} />
            <h2 className="mt-3 text-sm font-semibold text-slate-200">No matching models found</h2>
            <p className="mt-1 text-xs text-slate-400">
              Try clearing your search query or resetting the filter dropdowns.
            </p>
            <button
              type="button"
              onClick={handleResetAll}
              className="mt-4 rounded-lg bg-[#0078d4] px-4 py-2 text-xs font-medium text-white hover:bg-[#1084d8]"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,235px),1fr))] gap-3">
            {filteredModels.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
                hardware={hardware}
                activeGpuId={activeGpuId}
                safeHeadroomMb={safeHeadroomMb}
                onSelect={onSelectModel}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
