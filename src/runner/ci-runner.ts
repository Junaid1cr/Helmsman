import type { PipelineEvent } from '../rules/types';
import type { RunStatus, Store } from '../store/types';
import { buildCiJob, CI_JOB_SELECTOR, jobNameForRun } from './job-spec';
import type { CiOutcome, CiRunResult, CiRunnerOptions, K8sJobApi } from './types';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Creates a K8s Job for a CI run, polls it to completion, records the result,
 * and collects logs. Depends only on the K8sJobApi interface and a Store.
 */
export class CiRunner {
  private readonly ns: string;
  private readonly image: string;
  private readonly maxDurationSec: number;
  private readonly pollIntervalMs: number;
  private readonly ttl: number;

  constructor(
    private readonly k8s: K8sJobApi,
    private readonly store: Store,
    opts: CiRunnerOptions = {},
  ) {
    this.ns = opts.namespace ?? 'default';
    this.image = opts.jobImage ?? 'node:20';
    this.maxDurationSec = opts.maxDurationSec ?? 600;
    this.pollIntervalMs = opts.pollIntervalMs ?? 3000;
    this.ttl = opts.ttlSecondsAfterFinished ?? 1800;
  }

  /** Create a queued CI run record and execute it to completion. */
  async run(event: PipelineEvent): Promise<CiRunResult> {
    const run = this.store.createRun({
      kind: 'ci',
      status: 'queued',
      repo: event.repo,
      branch: event.branch,
      commit: event.commit,
      message: event.message,
    });
    return this.execute(run.id, event);
  }

  /**
   * Execute an already-created run: create the Job, poll it, record the result.
   * Lets callers (the HTTP layer) create the run, return its id, then run this
   * in the background.
   */
  async execute(runId: string, event: PipelineEvent): Promise<CiRunResult> {
    const jobName = jobNameForRun(runId);
    const manifest = buildCiJob({
      runId,
      repoUrl: event.repo,
      commit: event.commit,
      branch: event.branch,
      namespace: this.ns,
      image: this.image,
      maxDurationSec: this.maxDurationSec,
      ttlSecondsAfterFinished: this.ttl,
    });

    const startedAt = new Date();
    this.store.updateRun(runId, {
      status: 'running',
      jobName,
      startedAt: startedAt.toISOString(),
    });

    try {
      await this.k8s.createJob(this.ns, manifest);
    } catch (e) {
      const reason = `failed to create job: ${(e as Error).message}`;
      this.store.updateRun(runId, {
        status: 'failed',
        reason,
        finishedAt: new Date().toISOString(),
      });
      return { runId, status: 'failed', jobName, logs: reason, durationMs: 0 };
    }

    const status = await this.waitForJob(jobName);
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    const logs = await this.safeLogs(jobName);

    this.store.updateRun(runId, {
      status,
      logs,
      finishedAt: finishedAt.toISOString(),
      durationMs,
      reason:
        status === 'timed_out'
          ? `exceeded maxDurationSec=${this.maxDurationSec}`
          : undefined,
    });

    return { runId, status, jobName, logs, durationMs };
  }

  /**
   * On service boot, pick up CI Jobs that finished while we were down: any run
   * still marked `running` whose Job has a terminal status gets updated.
   * Returns the number of runs reconciled.
   */
  async reconcile(): Promise<number> {
    const jobs = await this.k8s.listJobs(this.ns, CI_JOB_SELECTOR);
    let fixed = 0;

    for (const job of jobs) {
      if (!job.runId) continue;
      const run = this.store.getRun(job.runId);
      if (!run || run.status !== 'running') continue;

      const terminal = terminalStatus(job.status);
      if (!terminal) continue;

      const logs = await this.safeLogs(job.name);
      this.store.updateRun(job.runId, {
        status: terminal,
        logs,
        finishedAt: new Date().toISOString(),
        reason: terminal === 'timed_out' ? 'job exceeded its deadline (reconciled)' : undefined,
      });
      fixed++;
    }
    return fixed;
  }

  private async waitForJob(jobName: string): Promise<CiOutcome> {
    // Backstop deadline in case K8s doesn't surface a terminal state.
    const deadline = Date.now() + this.maxDurationSec * 1000 + 15_000;
    while (Date.now() < deadline) {
      const status = await this.k8s.getJobStatus(this.ns, jobName);
      const terminal = terminalStatus(status);
      if (terminal) return terminal;
      await sleep(this.pollIntervalMs);
    }
    return 'timed_out';
  }

  private async safeLogs(jobName: string): Promise<string> {
    try {
      return await this.k8s.getJobLogs(this.ns, jobName);
    } catch (e) {
      return `(failed to fetch logs: ${(e as Error).message})`;
    }
  }
}

/** Map a Job status to a terminal CI outcome, or undefined if still running. */
function terminalStatus(status: {
  succeeded: number;
  failed: number;
  failureReason?: string;
}): CiOutcome | undefined {
  if (status.succeeded > 0) return 'passed';
  if (status.failed > 0) {
    return status.failureReason === 'DeadlineExceeded' ? 'timed_out' : 'failed';
  }
  return undefined;
}

// Re-export so callers get a stable status union alongside the runner.
export type { RunStatus };
