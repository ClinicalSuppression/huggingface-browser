import { PresetIntent, PurposePreset } from '../types';

const PRESETS: Record<PresetIntent, PurposePreset> = {
  instruct: {
    intent: 'instruct',
    displayName: 'Instruct / Assistant',
    temperature: 0.7,
    topP: 0.9,
    topK: 40,
    minP: 0.05,
    repeatPenalty: 1.1,
    presencePenalty: 0.0,
    frequencyPenalty: 0.0,
    description: 'General-purpose assistant conversational preset optimized for balanced, helpful responses.',
  },
  reasoning: {
    intent: 'reasoning',
    displayName: 'Reasoning / Deep Thinking',
    temperature: 0.6,
    topP: 0.95,
    topK: 20,
    minP: 0.05,
    repeatPenalty: 1.05,
    presencePenalty: 0.0,
    frequencyPenalty: 0.0,
    thinkBudgetTokens: 8192,
    description: 'Extended thinking mode for complex math, logic, and deep analysis with reasoning token budgets.',
  },
  coding: {
    intent: 'coding',
    displayName: 'Coding / Strict Logic',
    temperature: 0.1,
    topP: 0.95,
    topK: 20,
    minP: 0.01,
    repeatPenalty: 1.0,
    presencePenalty: 0.0,
    frequencyPenalty: 0.0,
    description: 'Deterministic output preset tuned for precise syntax, code generation, and debugging.',
  },
  creative: {
    intent: 'creative',
    displayName: 'Creative Writing',
    temperature: 1.0,
    topP: 0.98,
    topK: 60,
    minP: 0.08,
    repeatPenalty: 1.15,
    presencePenalty: 0.2,
    frequencyPenalty: 0.1,
    description: 'High entropy exploratory preset designed for storytelling, brainstorming, and creative tasks.',
  },
};

export function getPurposePreset(intent: PresetIntent): PurposePreset {
  const preset = PRESETS[intent];
  if (!preset) {
    return PRESETS.instruct;
  }
  return preset;
}

export interface ReasoningRequirements {
  readonly isThinkingModel: boolean;
  readonly recommendedBudget: number;
  readonly reasoningFormat?: 'deepseek' | 'generic';
}

export function detectReasoningRequirements(
  modelId: string,
  tags: string[]
): ReasoningRequirements {
  const lowerId = modelId.toLowerCase();
  const lowerTags = tags.map((t) => t.toLowerCase());

  const isDeepSeek = lowerId.includes('deepseek-r1') || lowerTags.includes('deepseek-r1');
  const isThinkingTag =
    lowerId.includes('reasoning') ||
    lowerId.includes('qwq') ||
    lowerId.includes('thinking') ||
    lowerTags.includes('reasoning') ||
    lowerTags.includes('thinking');

  if (isDeepSeek || isThinkingTag) {
    return {
      isThinkingModel: true,
      recommendedBudget: isDeepSeek ? 16384 : 8192,
      reasoningFormat: isDeepSeek ? 'deepseek' : 'generic',
    };
  }

  return {
    isThinkingModel: false,
    recommendedBudget: 0,
  };
}
