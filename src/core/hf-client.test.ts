import { describe, expect, it } from 'vitest';
import { HuggingFaceClient } from './hf-client';
import { HfModelSearchResult } from '../types';

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
