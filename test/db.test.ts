import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LocalDatabase } from '../src/core/db';
import path from 'path';
import fs from 'fs';
import os from 'os';

describe('Local Database SQLite Integration', () => {
  const testDbPath = path.join(os.tmpdir(), `test-db-${Date.now()}.sqlite`);

  beforeAll(async () => {
    await LocalDatabase.init(testDbPath);
  });

  it('inserts and retrieves runtime installations', () => {
    LocalDatabase.upsertRuntime({
      runtime_id: 'ollama',
      display_name: 'Ollama Serving Engine',
      endpoint_url: 'http://127.0.0.1:11434',
      is_active: 1,
      is_healthy: 1,
    });

    const runtimes = LocalDatabase.getRuntimes();
    expect(runtimes.length).toBeGreaterThan(0);
    const ollama = runtimes.find(r => r.runtime_id === 'ollama');
    expect(ollama).toBeDefined();
    expect(ollama?.display_name).toBe('Ollama Serving Engine');
  });

  it('inserts and retrieves install jobs', () => {
    LocalDatabase.upsertJob({
      job_id: 'job-123',
      model_repo: 'meta-llama/Llama-3.1-8B-Instruct',
      revision: 'main',
      runtime_id: 'ollama',
      target_tag: 'llama3.1:8b',
      status: 'downloading',
      progress_percent: 45.5,
      bytes_downloaded: 2_000_000_000,
      bytes_total: 4_500_000_000,
      install_plan_json: '{}',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const jobs = LocalDatabase.getJobs();
    expect(jobs.length).toBeGreaterThan(0);
    const job = jobs.find(j => j.job_id === 'job-123');
    expect(job).toBeDefined();
    expect(job?.status).toBe('downloading');
    expect(job?.progress_percent).toBe(45.5);
  });

  afterAll(() => {
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch {}
    }
  });
});
