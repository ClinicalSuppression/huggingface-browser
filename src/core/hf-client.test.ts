import { describe, expect, it } from 'vitest';
import { HuggingFaceClient } from './hf-client';
import { HfModelSearchResult } from '../types';
import { PassThrough } from 'stream';
import { readBoundedBody } from './hf-client';

describe('HuggingFace artifact resolution', () => {
  const model = {
    id: 'org/model', sha: 'abc123',
    siblings: [{ rfilename: 'weights/model.Q4_K_M.gguf', size: 1234, blobId: 'git-object-id' }],
  } as HfModelSearchResult;

  it('returns a revision-pinned URL with actual sibling size and no invented checksum', () => {
    const [artifact] = HuggingFaceClient.resolveArtifactTargets(model);
    expect(artifact.remoteUrl).toContain('/resolve/abc123/weights/model.Q4_K_M.gguf');
    expect(artifact.expectedSizeBytes).toBe(1234);
    expect(artifact.sha256Checksum).toBeUndefined();
  });

  it('rejects ambiguous, incomplete, and unsafe artifacts', () => {
    expect(() => HuggingFaceClient.resolveArtifactTargets({ ...model, siblings: [] })).toThrow();
    expect(() => HuggingFaceClient.resolveArtifactTargets({ ...model, siblings: [{ rfilename: 'a.gguf' }] })).toThrow();
    expect(() => HuggingFaceClient.resolveArtifactTargets({ ...model, siblings: [{ rfilename: '../a.gguf', size: 10 }] })).toThrow();
  });
});

describe('bounded Hugging Face response bodies', () => {
  it('accepts UTF-8 bodies below the byte limit', async () => {
    const stream = new PassThrough();
    const result = readBoundedBody(stream, 4);
    stream.end(Buffer.from('éa'));
    await expect(result).resolves.toEqual(Buffer.from('éa'));
  });

  it('rejects and destroys the stream when the byte limit is exceeded', async () => {
    const stream = new PassThrough();
    let overflowCalls = 0;
    const result = readBoundedBody(stream, 3, () => { overflowCalls++; });
    stream.write(Buffer.from('é')); // two bytes
    stream.write(Buffer.from('ab'));
    await expect(result).rejects.toThrow('3-byte limit');
    expect(stream.destroyed).toBe(true);
    expect(overflowCalls).toBe(1);
    stream.emit('error', new Error('late stream error'));
  });
});
