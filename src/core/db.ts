import fs from 'fs';
import path from 'path';
import os from 'os';
import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';

export interface CachedModelRow {
  model_repo: string;
  pipeline_tag?: string;
  author: string;
  downloads_count: number;
  likes_count: number;
  is_gated: number;
  card_summary?: string;
  raw_siblings_json: string;
  cached_at: string;
}

export interface RuntimeInstallationRow {
  runtime_id: string;
  display_name: string;
  endpoint_url: string;
  executable_path?: string;
  detected_version?: string;
  is_active: number;
  last_health_check?: string;
  is_healthy: number;
}

export interface InstallJobRow {
  job_id: string;
  model_repo: string;
  revision: string;
  runtime_id: string;
  target_tag: string;
  status: 'pending' | 'downloading' | 'verifying' | 'completed' | 'failed' | 'cancelled';
  progress_percent: number;
  bytes_downloaded: number;
  bytes_total: number;
  install_plan_json: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export class LocalDatabase {
  private static db: Database | null = null;
  private static dbPath: string = '';

  public static async init(customPath?: string): Promise<void> {
    if (this.db) return;

    const dataDir = customPath ? path.dirname(customPath) : path.join(os.homedir(), '.config', 'ollama-hf-browser');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.dbPath = customPath || path.join(dataDir, 'database.sqlite');
    const SQL = await initSqlJs();

    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(fileBuffer);
    } else {
      this.db = new SQL.Database();
    }

    this.applyMigrations();
    this.persist();
  }

  private static applyMigrations(): void {
    if (!this.db) return;

    const schema = `
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS cached_models (
          model_repo TEXT PRIMARY KEY,
          pipeline_tag TEXT,
          author TEXT NOT NULL,
          downloads_count INTEGER DEFAULT 0,
          likes_count INTEGER DEFAULT 0,
          is_gated INTEGER NOT NULL DEFAULT 0,
          card_summary TEXT,
          raw_siblings_json TEXT NOT NULL,
          cached_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_cached_models_author ON cached_models(author);
      CREATE INDEX IF NOT EXISTS idx_cached_models_gated ON cached_models(is_gated);

      CREATE TABLE IF NOT EXISTS runtime_installations (
          runtime_id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          endpoint_url TEXT NOT NULL,
          executable_path TEXT,
          detected_version TEXT,
          is_active INTEGER NOT NULL DEFAULT 1,
          last_health_check TEXT,
          is_healthy INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS install_jobs (
          job_id TEXT PRIMARY KEY,
          model_repo TEXT NOT NULL,
          revision TEXT NOT NULL,
          runtime_id TEXT NOT NULL,
          target_tag TEXT NOT NULL,
          status TEXT CHECK(status IN ('pending', 'downloading', 'verifying', 'completed', 'failed', 'cancelled')) NOT NULL,
          progress_percent REAL NOT NULL DEFAULT 0.0,
          bytes_downloaded INTEGER NOT NULL DEFAULT 0,
          bytes_total INTEGER NOT NULL DEFAULT 0,
          install_plan_json TEXT NOT NULL,
          error_message TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY(runtime_id) REFERENCES runtime_installations(runtime_id)
      );
      CREATE INDEX IF NOT EXISTS idx_install_jobs_status ON install_jobs(status);

      CREATE TABLE IF NOT EXISTS user_purpose_presets (
          preset_id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          temperature REAL NOT NULL,
          top_p REAL NOT NULL,
          min_p REAL NOT NULL,
          repeat_penalty REAL NOT NULL,
          think_budget_tokens INTEGER DEFAULT 0,
          custom_stop_tokens TEXT,
          is_builtin INTEGER NOT NULL DEFAULT 0
      );
    `;

    this.db.run(schema);
  }

  public static persist(): void {
    if (!this.db || !this.dbPath) return;
    try {
      this.persistStrict();
    } catch (err) {
      console.error('Failed to persist database file:', err);
    }
  }

  /** Persist and propagate filesystem errors for callers that require durability. */
  public static persistStrict(): void {
    if (!this.db || !this.dbPath) return;
    const data = this.db.export();
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }

  // Runtime installation records
  public static upsertRuntime(row: RuntimeInstallationRow): void {
    if (!this.db) return;
    this.db.run(
      `INSERT OR REPLACE INTO runtime_installations (runtime_id, display_name, endpoint_url, executable_path, detected_version, is_active, last_health_check, is_healthy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.runtime_id, row.display_name, row.endpoint_url, row.executable_path || null, row.detected_version || null, row.is_active, row.last_health_check || null, row.is_healthy]
    );
    this.persist();
  }

  public static getRuntimes(): RuntimeInstallationRow[] {
    if (!this.db) return [];
    const res = this.db.exec(`SELECT * FROM runtime_installations`);
    if (res.length === 0) return [];
    const columns = res[0].columns;
    return res[0].values.map((v: unknown) => {
      const rowArr = v as unknown[];
      const obj: Record<string, unknown> = {};
      columns.forEach((c: unknown, i: number) => { obj[String(c)] = rowArr[i]; });
      return obj as unknown as RuntimeInstallationRow;
    });
  }

  // Job management
  public static upsertJob(job: InstallJobRow): void {
    if (!this.db) return;
    this.db.run(
      `INSERT OR REPLACE INTO install_jobs (job_id, model_repo, revision, runtime_id, target_tag, status, progress_percent, bytes_downloaded, bytes_total, install_plan_json, error_message, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [job.job_id, job.model_repo, job.revision, job.runtime_id, job.target_tag, job.status, job.progress_percent, job.bytes_downloaded, job.bytes_total, job.install_plan_json, job.error_message || null, job.created_at, job.updated_at]
    );
    this.persistStrict();
  }

  public static getJobs(): InstallJobRow[] {
    if (!this.db) return [];
    const res = this.db.exec(`SELECT * FROM install_jobs ORDER BY created_at DESC`);
    if (res.length === 0) return [];
    const columns = res[0].columns;
    return res[0].values.map((v: unknown) => {
      const rowArr = v as unknown[];
      const obj: Record<string, unknown> = {};
      columns.forEach((c: unknown, i: number) => { obj[String(c)] = rowArr[i]; });
      return obj as unknown as InstallJobRow;
    });
  }
}
