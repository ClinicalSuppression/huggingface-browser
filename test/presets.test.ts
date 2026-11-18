import { describe, it, expect } from 'vitest';
import { getPurposePreset, detectReasoningRequirements } from '../src/core/presets';

describe('Purpose Preset & Reasoning Engine', () => {
  it('returns appropriate inference parameters for each intent', () => {
    const instruct = getPurposePreset('instruct');
    expect(instruct.temperature).toBe(0.7);
    expect(instruct.topP).toBe(0.9);

    const coding = getPurposePreset('coding');
    expect(coding.temperature).toBe(0.1);
    expect(coding.repeatPenalty).toBe(1.0);

    const reasoning = getPurposePreset('reasoning');
    expect(reasoning.temperature).toBe(0.6);
    expect(reasoning.thinkBudgetTokens).toBeGreaterThanOrEqual(4096);
  });

  it('detects reasoning models from ID or tags and assigns appropriate think budgets', () => {
    const deepseek = detectReasoningRequirements('deepseek-ai/DeepSeek-R1-Distill-Qwen-14B', ['reasoning']);
    expect(deepseek.isThinkingModel).toBe(true);
    expect(deepseek.reasoningFormat).toBe('deepseek');
    expect(deepseek.recommendedBudget).toBe(16384);

    const qwq = detectReasoningRequirements('Qwen/QwQ-32B-Preview', []);
    expect(qwq.isThinkingModel).toBe(true);

    const standard = detectReasoningRequirements('meta-llama/Llama-3.1-8B-Instruct', ['text-generation']);
    expect(standard.isThinkingModel).toBe(false);
  });
});
