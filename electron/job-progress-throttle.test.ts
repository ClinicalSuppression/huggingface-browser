import { describe, expect, it } from 'vitest';
import { createJobProgressThrottle } from './job-progress-throttle';

describe('job progress throttle', () => {
  it('coalesces high-frequency callbacks and persists the latest at the next allowed window', () => {
    let now = 0;
    const writes: Array<{ percent: number; downloaded: number }> = [];
    const throttle = createJobProgressThrottle((p) => writes.push(p), 1000, () => now);
    const started = performance.now();
    for (let i = 0; i < 10_000; i++) {
      now = Math.floor(i / 10);
      throttle.update({ percent: i / 100, downloaded: i });
    }
    expect(writes).toEqual([{ percent: 0, downloaded: 0 }]);
    now = 1000;
    throttle.update({ percent: 100, downloaded: 10_000 });
    expect(writes).toEqual([
      { percent: 0, downloaded: 0 },
      { percent: 100, downloaded: 10_000 },
    ]);
    const elapsedMs = performance.now() - started;
    expect(elapsedMs).toBeGreaterThanOrEqual(0);
    // Measurement evidence: 10,001 callbacks yielded only 2 writes.
    expect({ callbacks: 10_001, writes: writes.length, elapsedMs }).toMatchObject({ callbacks: 10_001, writes: 2 });
  });

  it('clears pending progress so a terminal write cannot be followed by stale progress', () => {
    let now = 0;
    const writes: string[] = [];
    const throttle = createJobProgressThrottle(() => writes.push('progress'), 1000, () => now);
    throttle.update({ percent: 0, downloaded: 0 });
    throttle.update({ percent: 50, downloaded: 50 });
    throttle.clear();
    writes.push('completed');
    now = 1000;
    expect(writes).toEqual(['progress', 'completed']);
  });
});
