import { randomUUID } from 'node:crypto';
import type {
  CreateFreezeInput,
  CreateRunInput,
  Freeze,
  ListRunsFilter,
  Run,
  RunPatch,
  Store,
} from './types';

/** In-memory Store for tests and pre-SQLite development. Not durable. */
export class MemoryStore implements Store {
  private readonly runs = new Map<string, Run>();
  private readonly freezes = new Map<string, Freeze>();

  createRun(input: CreateRunInput): Run {
    const run: Run = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...input,
    };
    this.runs.set(run.id, run);
    return { ...run };
  }

  updateRun(id: string, patch: RunPatch): Run {
    const existing = this.runs.get(id);
    if (!existing) throw new Error(`run not found: ${id}`);
    const updated: Run = { ...existing, ...patch };
    this.runs.set(id, updated);
    return { ...updated };
  }

  getRun(id: string): Run | undefined {
    const run = this.runs.get(id);
    return run ? { ...run } : undefined;
  }

  listRuns(filter: ListRunsFilter = {}): Run[] {
    // Newest first by insertion order (creation order). This is deterministic
    // even when createdAt timestamps collide at millisecond resolution; the
    // SQLite store will give the same ordering via rowid.
    let out = [...this.runs.values()].reverse();
    if (filter.kind) out = out.filter((r) => r.kind === filter.kind);
    if (filter.status) out = out.filter((r) => r.status === filter.status);
    if (filter.branch) out = out.filter((r) => r.branch === filter.branch);
    if (filter.limit !== undefined) out = out.slice(0, filter.limit);
    return out.map((r) => ({ ...r }));
  }

  createFreeze(input: CreateFreezeInput): Freeze {
    const freeze: Freeze = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...input,
    };
    this.freezes.set(freeze.id, freeze);
    return { ...freeze };
  }

  listFreezes(): Freeze[] {
    return [...this.freezes.values()].reverse().map((f) => ({ ...f }));
  }

  deleteFreeze(id: string): boolean {
    return this.freezes.delete(id);
  }
}
