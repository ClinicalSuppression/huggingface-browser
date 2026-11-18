import { describe, it, expect } from 'vitest';
import { parseQuantFromFilename, groupGgufShards, findMatchingMultimodalProjector } from '../src/core/gguf-parser';

describe('GGUF Shard & Quantization Parser', () => {
  it('parses K-quants, I-quants, legacy quants, and FP8', () => {
    expect(parseQuantFromFilename('Meta-Llama-3-8B-Instruct.Q4_K_M.gguf')).toMatchObject({
      quant: 'Q4_K_M',
      isKQuant: true,
      bitsPerWeight: 4.5,
    });

    expect(parseQuantFromFilename('Qwen2.5-Coder-32B-IQ4_XS.gguf')).toMatchObject({
      quant: 'IQ4_XS',
      isIQuant: true,
      bitsPerWeight: 4.25,
    });

    expect(parseQuantFromFilename('DeepSeek-V3-FP8.gguf')).toMatchObject({
      quant: 'FP8',
      bitsPerWeight: 8.0,
    });

    expect(parseQuantFromFilename('model-q8_0.gguf')).toMatchObject({
      quant: 'Q8_0',
      isLegacy: true,
      bitsPerWeight: 8.5,
    });
  });

  it('correctly groups multi-part GGUF shards and checks completeness', () => {
    const files = [
      'Llama-3.3-70B-Instruct-Q4_K_M-00001-of-00003.gguf',
      'Llama-3.3-70B-Instruct-Q4_K_M-00002-of-00003.gguf',
      'Llama-3.3-70B-Instruct-Q4_K_M-00003-of-00003.gguf',
      'Llama-3.3-70B-Instruct-Q8_0-00001-of-00004.gguf', // incomplete, only 1 shard
    ];

    const groups = groupGgufShards(files);
    expect(groups).toHaveLength(2);

    const completeGroup = groups.find(g => g.quant === 'Q4_K_M');
    expect(completeGroup).toBeDefined();
    expect(completeGroup?.isComplete).toBe(true);
    expect(completeGroup?.totalShards).toBe(3);
    expect(completeGroup?.shards).toHaveLength(3);

    const incompleteGroup = groups.find(g => g.quant === 'Q8_0');
    expect(incompleteGroup).toBeDefined();
    expect(incompleteGroup?.isComplete).toBe(false);
    expect(incompleteGroup?.shards).toHaveLength(1);
    expect(incompleteGroup?.totalShards).toBe(4);
  });

  it('identifies multimodal projector files', () => {
    const siblings = [
      'Llama-3.2-11B-Vision-Instruct-Q4_K_M.gguf',
      'mmproj-Llama-3.2-11B-Vision-Instruct-f16.gguf',
      'tokenizer.json',
    ];

    const mmproj = findMatchingMultimodalProjector(siblings);
    expect(mmproj).toBe('mmproj-Llama-3.2-11B-Vision-Instruct-f16.gguf');
  });
});
