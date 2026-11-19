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

  it('fails interrupted jobs while preserving progress and terminal rows', () => {
    const now = '2025-01-01T00:00:00.000Z';
    const statuses = ['pending', 'downloading', 'verifying', 'completed', 'failed', 'cancelled'] as const;
    for (const status of statuses) {
      LocalDatabase.upsertJob({
        job_id: `recovery-${status}`, model_repo: 'owner/model', revision: 'main',
        runtime_id: 'ollama', target_tag: 'model:latest', status,
        progress_percent: 37.5, bytes_downloaded: 1234, bytes_total: 5678,
        install_plan_json: '{}', error_message: status === 'failed' ? 'original failure' : undefined,
        created_at: now, updated_at: now,
      });
    }

    LocalDatabase.failInterruptedJobs();
    const rows = LocalDatabase.getJobs();
    for (const status of ['pending', 'downloading', 'verifying'] as const) {
      const row = rows.find(job => job.job_id === `recovery-${status}`)!;
      expect(row.status).toBe('failed');
      expect(row.progress_percent).toBe(37.5);
      expect(row.bytes_downloaded).toBe(1234);
      expect(row.bytes_total).toBe(5678);
      expect(row.error_message).toContain('interrupted');
      expect(row.updated_at).not.toBe(now);
    }
    for (const status of ['completed', 'failed', 'cancelled'] as const) {
      const row = rows.find(job => job.job_id === `recovery-${status}`)!;
      expect(row.status).toBe(status);
      expect(row.progress_percent).toBe(37.5);
      expect(row.bytes_downloaded).toBe(1234);
      expect(row.updated_at).toBe(now);
      if (status === 'failed') expect(row.error_message).toBe('original failure');
      else expect(row.error_message).toBeNull();
    }
  });

  it('propagates job persistence failures', () => {
    const database = LocalDatabase as unknown as { dbPath: string };
    const originalPath = database.dbPath;
    database.dbPath = path.dirname(testDbPath);
    try {
      expect(() => LocalDatabase.upsertJob({
        job_id: 'job-persist-failure',
        model_repo: 'owner/model',
        revision: 'main',
        runtime_id: 'ollama',
        target_tag: 'model:latest',
        status: 'downloading',
        progress_percent: 0,
        bytes_downloaded: 0,
        bytes_total: 1,
        install_plan_json: '{}',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })).toThrow();
    } finally {
      database.dbPath = originalPath;
    }
  });

  afterAll(() => {
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch {}
    }
  });
});
