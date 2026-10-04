export type RunKind = 'ci' | 'cd';

export type CiStatus = 'queued' | 'running' | 'passed' | 'failed' | 'timed_out' | 'skipped';
export type CdStatus =
  | 'queued'
  | 'awaiting_approval'
  | 'deploying'
  | 'deployed'
  | 'rolled_back'
  | 'blocked';
export type RunStatus = CiStatus | CdStatus;

export interface Run {
  id: string;
  kind: RunKind;
  status: RunStatus;
  repo: string;
  branch: string;
  commit: string;
  message?: string;
  /** Why a run was skipped / blocked / timed out. */
  reason?: string;
  /** K8s Job name (CI runs). */
  jobName?: string;
  logs?: string;
  createdAt: string; // ISO UTC
  startedAt?: string; // ISO UTC
  finishedAt?: string; // ISO UTC
  durationMs?: number;
}

export interface CreateRunInput {
  kind: RunKind;
  status: RunStatus;
  repo: string;
  branch: string;
  commit: string;
  message?: string;
  reason?: string;
}

export type RunPatch = Partial<Omit<Run, 'id' | 'createdAt'>>;

export interface ListRunsFilter {
  kind?: RunKind;
  status?: RunStatus;
  branch?: string;
  limit?: number;
}

/**
 * Persistence boundary for run history. MemoryStore implements it now; a
 * better-sqlite3 implementation replaces it at step 6 with no runner changes.
 */
export interface Store {
  createRun(input: CreateRunInput): Run;
  updateRun(id: string, patch: RunPatch): Run;
  getRun(id: string): Run | undefined;
  listRuns(filter?: ListRunsFilter): Run[];
}
