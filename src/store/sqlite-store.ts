import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  CreateRunInput,
  ListRunsFilter,
  Run,
  RunKind,
  RunPatch,
  RunStatus,
  Store,
} from './types';

interface Row {
  id: string;
  kind: string;
  status: string;
  repo: string;
  branch: string;
  commit_sha: string;
  message: string | null;
  reason: string | null;
  job_name: string | null;
  logs: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
}

/**
 * Durable run history via better-sqlite3 (synchronous). Same Store contract as
 * MemoryStore, including newest-first ordering (here via the autoincrement
 * `seq` rowid, which is stable even when createdAt timestamps collide).
 */
export class SqliteStore implements Store {
  private readonly db: Database.Database;

  constructor(path: string = process.env.HELMSMAN_DB ?? 'data/helmsman.sqlite') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        seq         INTEGER PRIMARY KEY AUTOINCREMENT,
        id          TEXT UNIQUE NOT NULL,
        kind        TEXT NOT NULL,
        status      TEXT NOT NULL,
        repo        TEXT NOT NULL,
        branch      TEXT NOT NULL,
        commit_sha  TEXT NOT NULL,
        message     TEXT,
        reason      TEXT,
        job_name    TEXT,
        logs        TEXT,
        created_at  TEXT NOT NULL,
        started_at  TEXT,
        finished_at TEXT,
        duration_ms INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_runs_kind ON runs(kind);
      CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
      CREATE INDEX IF NOT EXISTS idx_runs_branch ON runs(branch);
    `);
  }

  createRun(input: CreateRunInput): Run {
    const run: Run = { id: randomUUID(), createdAt: new Date().toISOString(), ...input };
    this.db
      .prepare(
        `INSERT INTO runs
          (id, kind, status, repo, branch, commit_sha, message, reason, job_name, logs, created_at, started_at, finished_at, duration_ms)
         VALUES
          (@id, @kind, @status, @repo, @branch, @commit, @message, @reason, @jobName, @logs, @createdAt, @startedAt, @finishedAt, @durationMs)`,
      )
      .run(toParams(run));
    return run;
  }

  updateRun(id: string, patch: RunPatch): Run {
    const existing = this.getRun(id);
    if (!existing) throw new Error(`run not found: ${id}`);
    const updated: Run = { ...existing, ...patch };
    this.db
      .prepare(
        `UPDATE runs SET
          kind=@kind, status=@status, repo=@repo, branch=@branch, commit_sha=@commit,
          message=@message, reason=@reason, job_name=@jobName, logs=@logs,
          started_at=@startedAt, finished_at=@finishedAt, duration_ms=@durationMs
         WHERE id=@id`,
      )
      .run(toParams(updated));
    return updated;
  }

  getRun(id: string): Run | undefined {
    const row = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as Row | undefined;
    return row ? rowToRun(row) : undefined;
  }

  listRuns(filter: ListRunsFilter = {}): Run[] {
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (filter.kind) {
      where.push('kind = @kind');
      params.kind = filter.kind;
    }
    if (filter.status) {
      where.push('status = @status');
      params.status = filter.status;
    }
    if (filter.branch) {
      where.push('branch = @branch');
      params.branch = filter.branch;
    }

    let sql = 'SELECT * FROM runs';
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY seq DESC';
    if (filter.limit !== undefined) {
      sql += ' LIMIT @limit';
      params.limit = filter.limit;
    }

    const stmt = this.db.prepare(sql);
    const rows = (Object.keys(params).length ? stmt.all(params) : stmt.all()) as Row[];
    return rows.map(rowToRun);
  }

  close(): void {
    this.db.close();
  }
}

function toParams(run: Run): Record<string, unknown> {
  return {
    id: run.id,
    kind: run.kind,
    status: run.status,
    repo: run.repo,
    branch: run.branch,
    commit: run.commit,
    message: run.message ?? null,
    reason: run.reason ?? null,
    jobName: run.jobName ?? null,
    logs: run.logs ?? null,
    createdAt: run.createdAt,
    startedAt: run.startedAt ?? null,
    finishedAt: run.finishedAt ?? null,
    durationMs: run.durationMs ?? null,
  };
}

function rowToRun(r: Row): Run {
  return {
    id: r.id,
    kind: r.kind as RunKind,
    status: r.status as RunStatus,
    repo: r.repo,
    branch: r.branch,
    commit: r.commit_sha,
    message: r.message ?? undefined,
    reason: r.reason ?? undefined,
    jobName: r.job_name ?? undefined,
    logs: r.logs ?? undefined,
    createdAt: r.created_at,
    startedAt: r.started_at ?? undefined,
    finishedAt: r.finished_at ?? undefined,
    durationMs: r.duration_ms ?? undefined,
  };
}
