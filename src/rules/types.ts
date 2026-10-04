export type EventType = 'push' | 'pull_request';

/** A normalized pipeline event — what the webhook/trigger endpoint produces. */
export interface PipelineEvent {
  repo: string;
  branch: string;
  commit: string; // SHA
  message: string;
  changedFiles: string[];
  eventType: EventType;
}

export interface CiRules {
  /** Event types CI runs on. */
  on: EventType[];
  /** Glob patterns; CI runs only if at least one changed file matches. */
  paths?: string[];
  /** If the commit message contains this substring, CI is skipped. */
  skipIfCommitContains?: string;
}

export interface CdRules {
  /** Branches eligible for deploy. */
  branches: string[];
  /** Precondition for deploy (currently only "ci_passed"). */
  require: 'ci_passed' | null;
  /** Allowed deploy window(s), e.g. "Mon-Thu 10:00-17:00 IST". */
  windows?: string;
  /** Freeze ranges, e.g. ["2026-10-20..2026-10-23"] (inclusive, IST). */
  freeze?: string[];
  /** Whether an eligible deploy proceeds automatically or waits for approval. */
  approval: 'manual' | 'auto';
}

export interface RulesConfig {
  ci: CiRules;
  cd: CdRules;
}

export interface CiDecision {
  run: boolean;
  reason: string;
}

/**
 * - deploy              → proceed to deploy now
 * - queued_for_approval → eligible, but approval: manual, so wait
 * - blocked             → a rule prevents deploy (branch/ci/window/freeze)
 */
export type CdOutcome = 'deploy' | 'queued_for_approval' | 'blocked';

export interface CdDecision {
  outcome: CdOutcome;
  reason: string;
}

/** Facts the CD evaluator can't derive itself, supplied by the caller. */
export interface CdContext {
  /** Whether CI passed for this commit (checked when require === "ci_passed"). */
  ciPassed: boolean;
  /** Evaluation instant (UTC). Defaults to now. Injectable for tests. */
  at?: Date;
  /** Runtime freeze ranges (from the store), merged with rules.yaml freezes. */
  extraFreezes?: string[];
}
