import { describe, expect, it } from 'vitest';
import { applyDiscoveryFilters } from './mockService';
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
    expect(matches(model(['image-text-to-text-extra']), 'image-text-to-text')).toBe(false);
  });
  it('recognizes coding-related tags only', () => {
    expect(matches(model(['code-generation']), 'coding')).toBe(true);
    expect(matches(model(['coding']), 'coding')).toBe(true);
    expect(matches(model([], 'owner/coder'), 'coding')).toBe(false);
  });
});
