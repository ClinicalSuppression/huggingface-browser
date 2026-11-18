import React from 'react';
import { Search, SlidersHorizontal, ArrowUpDown, Sparkles, X } from 'lucide-react';
import { HardwareProfile, HfModelSearchResult } from '../../types';
import { ModelFilterChip, SortOption } from '../types';
import { ModelCard } from './ModelCard';

interface DiscoveryViewProps {
  query: string;
  onQueryChange: (q: string) => void;
  filter: ModelFilterChip;
  onFilterChange: (f: ModelFilterChip) => void;
  sort: SortOption;
  onSortChange: (s: SortOption) => void;
  models: HfModelSearchResult[];
  isLoading: boolean;
  hardware: HardwareProfile | null;
  onSelectModel: (model: HfModelSearchResult) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

const FILTER_CHIPS: Array<{ id: ModelFilterChip; label: string }> = [
  { id: 'all', label: 'All Models' },
  { id: 'gguf', label: 'GGUF' },
  { id: 'safetensors', label: 'SafeTensors' },
  { id: 'reasoning', label: 'Reasoning / Thinking' },
];

const SORT_OPTIONS: Array<{ id: SortOption; label: string }> = [
  { id: 'trendingScore', label: 'Trending' },
  { id: 'downloads', label: 'Most Downloaded' },
  { id: 'likes', label: 'Most Liked' },
  { id: 'lastModified', label: 'Recently Updated' },
];

export const DiscoveryView: React.FC<DiscoveryViewProps> = ({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  models,
  isLoading,
  hardware,
  onSelectModel,
  searchInputRef,
}) => {
  return (
    <section aria-label="Discover Hugging Face Models" className="flex h-full flex-col">
      {/* Top Header & Search Bar */}
      <header className="border-b border-white/[0.08] bg-[#090d16]/75 px-6 py-5 backdrop-blur-md">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">
              Discover Models
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
              className="w-full rounded-lg border border-white/[0.1] bg-[#0f172a]/90 py-2.5 pl-10 pr-20 text-sm text-slate-100 placeholder-slate-500 transition-colors hover:border-white/[0.18] focus:border-[#38bdf8] focus:outline-none"
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

        {/* Filter Chips & Sort Controls */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div
            role="group"
            aria-label="Model format and capability filters"
            className="flex flex-wrap items-center gap-2"
          >
            <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden={true} />
              Filter:
            </span>
            {FILTER_CHIPS.map((chip) => {
              const active = filter === chip.id;
              const isReasoning = chip.id === 'reasoning';
              return (
                <button
                  key={chip.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onFilterChange(chip.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    active
                      ? isReasoning
                        ? 'border border-purple-400/45 bg-purple-500/20 text-purple-200 shadow-sm'
                        : 'border border-[#38bdf8]/45 bg-[#0078d4]/25 text-[#7dd3fc] shadow-sm'
                      : 'border border-white/[0.08] bg-white/[0.03] text-slate-300 hover:border-white/[0.16] hover:bg-white/[0.07] hover:text-white'
                  }`}
                >
                  {isReasoning && <Sparkles className="h-3 w-3 text-purple-300" aria-hidden={true} />}
                  {chip.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="discovery-sort"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400"
            >
              <ArrowUpDown className="h-3.5 w-3.5" aria-hidden={true} />
              Sort:
            </label>
            <select
              id="discovery-sort"
              value={sort}
              onChange={(e) => onSortChange(e.target.value as SortOption)}
              className="rounded-lg border border-white/[0.1] bg-[#0f172a] px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-white/[0.2] focus:border-[#38bdf8] focus:outline-none"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Model Grid Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="fluent-card h-48 animate-pulse rounded-xl p-4"
              >
                <div className="h-3 w-24 rounded bg-white/[0.07]" />
                <div className="mt-3 h-5 w-3/4 rounded bg-white/[0.09]" />
                <div className="mt-3 h-3 w-full rounded bg-white/[0.05]" />
                <div className="mt-2 h-3 w-2/3 rounded bg-white/[0.05]" />
              </div>
            ))}
          </div>
        ) : models.length === 0 ? (
          <div className="fluent-card mx-auto mt-12 max-w-md rounded-xl p-8 text-center">
            <Search className="mx-auto h-8 w-8 text-slate-500" aria-hidden={true} />
            <h2 className="mt-3 text-sm font-semibold text-slate-200">No matching models found</h2>
            <p className="mt-1 text-xs text-slate-400">
              Try clearing your search query or switching to the &ldquo;All Models&rdquo; filter.
            </p>
            <button
              type="button"
              onClick={() => {
                onQueryChange('');
                onFilterChange('all');
              }}
              className="mt-4 rounded-lg bg-[#0078d4] px-4 py-2 text-xs font-medium text-white hover:bg-[#1084d8]"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {models.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
                hardware={hardware}
                onSelect={onSelectModel}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
