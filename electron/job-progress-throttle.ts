export type JobProgress = { percent: number; downloaded: number };

/**
 * Persists progress at most once per interval. There are no timers: a pending
 * value is written on the next progress callback after the window opens.
 */
export function createJobProgressThrottle(
  persist: (progress: JobProgress) => void,
  intervalMs = 1000,
  now: () => number = Date.now
) {
  let lastWriteAt: number | undefined;
  let latest: JobProgress | undefined;

  return {
    update(progress: JobProgress) {
      latest = progress;
      const currentTime = now();
      if (lastWriteAt === undefined || currentTime - lastWriteAt >= intervalMs) {
        persist(latest);
        lastWriteAt = currentTime;
        latest = undefined;
      }
    },
    clear() {
      latest = undefined;
    },
  };
}
