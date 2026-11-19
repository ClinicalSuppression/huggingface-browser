import { describe, expect, it, vi } from 'vitest';
import { applyDiscoveryFilters, bridgeService, selectHubFilter } from './mockService';
import { DiscoveryFilters } from '../types';
import { HfModelSearchResult } from '../../types';

const filters = (task: DiscoveryFilters['task']): DiscoveryFilters => ({
  task, format: 'all', alignment: 'all', family: 'all', hardwareFit: 'all', paramSize: 'all',
});
const model = (tags: string[], id = 'owner/model', description = ''): HfModelSearchResult => ({
  id, author: 'owner', tags, description, pipeline_tag: 'text-generation',
});
const matches = (m: HfModelSearchResult, task: DiscoveryFilters['task']) =>
  applyDiscoveryFilters([m], filters(task)).length > 0;

describe('task tag filtering', () => {
  it('preserves all and matches any-to-any only from tags', () => {
    expect(matches(model([]), 'all')).toBe(true);
    expect(matches(model(['Any-To-Any']), 'any-to-any')).toBe(true);
    expect(matches(model(['text-generation'], 'owner/any-to-any', 'any-to-any model'), 'any-to-any')).toBe(false);
  });
  it('does not treat text-generation as chat', () => {
    expect(matches(model(['text-generation']), 'conversational')).toBe(false);
    expect(matches(model(['conversational']), 'conversational')).toBe(true);
  });
  it('uses normalized exact tags for regular tasks', () => {
    expect(matches(model([' image-text-to-text ']), 'image-text-to-text')).toBe(true);
    expect(matches(model(['image_text_to_text']), 'image-text-to-text')).toBe(true);
    expect(matches(model(['image-text-to-text-extra']), 'image-text-to-text')).toBe(false);
  });
  it('recognizes coding-related tags only', () => {
    expect(matches(model(['code-generation']), 'coding')).toBe(true);
    expect(matches(model(['coding']), 'coding')).toBe(true);
    expect(matches(model([], 'owner/coder'), 'coding')).toBe(false);
  });
});

describe('Hub API filter selection', () => {
  const withFilters = (task: DiscoveryFilters['task'], format: DiscoveryFilters['format'] = 'all') => ({
    ...filters(task), format,
  });

  it('uses exact task tags, including any-to-any and conversational', () => {
    expect(selectHubFilter(withFilters('any-to-any'))).toBe('any-to-any');
    expect(selectHubFilter(withFilters('conversational'))).toBe('conversational');
  });

  it('falls back to format for coding and any task', () => {
    expect(selectHubFilter(withFilters('coding', 'gguf'))).toBe('gguf');
    expect(selectHubFilter(withFilters('all', 'safetensors'))).toBe('safetensors');
  });

  it('leaves coding without a format filter', () => {
    expect(selectHubFilter(withFilters('coding'))).toBeUndefined();
  });
});

describe('model storage path propagation', () => {
  it('passes the selected path to Electron when creating an install plan', async () => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const createInstallPlan = vi.fn().mockResolvedValue({ planId: 'plan-1' });
    const startInstall = vi.fn().mockResolvedValue({ success: true });
    const cancelInstall = vi.fn().mockResolvedValue(false);
    const onInstallProgress = vi.fn().mockReturnValue(() => {});
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { electronAPI: {
      createInstallPlan,
      startInstall,
      cancelInstall,
      onInstallProgress,
    } } });

    try {
      await bridgeService.simulateOrRunDeploy(
        'ollama',
        'owner/model',
        1,
        () => {},
        new AbortController().signal,
        'model.Q4_K_M.gguf',
        'D:\\models\\custom-storage'
      );

      expect(createInstallPlan).toHaveBeenCalledWith(
        'ollama',
        'owner/model',
        'model.Q4_K_M.gguf',
        undefined,
        'D:\\models\\custom-storage'
      );
    } finally {
      if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
      else delete (globalThis as { window?: unknown }).window;
    }
  });
});
