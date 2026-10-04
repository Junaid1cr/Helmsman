/** Normalized Job status, decoupled from the K8s client's V1JobStatus. */
export interface JobStatus {
  active: number;
  succeeded: number;
  failed: number;
  /** Reason from the Job's "Failed" condition, e.g. "DeadlineExceeded". */
  failureReason?: string;
}

export interface ManagedJob {
  name: string;
  runId?: string;
  status: JobStatus;
}

/**
 * Minimal K8s surface the CI runner needs. Keeping it narrow means the runner
 * is unit-testable with a fake and insulated from @kubernetes/client-node's
 * version-specific API (see k8s.ts for the real implementation).
 */
export interface K8sJobApi {
  createJob(namespace: string, manifest: unknown): Promise<void>;
  getJobStatus(namespace: string, name: string): Promise<JobStatus>;
  getJobLogs(namespace: string, jobName: string): Promise<string>;
  deleteJob(namespace: string, name: string): Promise<void>;
  /** List Helmsman-managed jobs matching a label selector (for reconcile). */
  listJobs(namespace: string, labelSelector: string): Promise<ManagedJob[]>;
}

export interface CiRunnerOptions {
  namespace?: string; // default 'default'
  jobImage?: string; // default 'node:20'
  maxDurationSec?: number; // default 600
  pollIntervalMs?: number; // default 3000
  ttlSecondsAfterFinished?: number; // default 1800
}

export type CiOutcome = 'passed' | 'failed' | 'timed_out';

export interface CiRunResult {
  runId: string;
  status: CiOutcome;
  jobName: string;
  logs: string;
  durationMs: number;
}
