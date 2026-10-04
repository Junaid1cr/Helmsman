import type { Run } from '../store/types';

export interface Metrics {
  ci: {
    total: number;
    passed: number;
    failed: number; // failed + timed_out
    successRate: number | null; // passed / (terminal runs), null if none
    avgDurationMs: number | null;
  };
  cd: {
    deploys: number; // status deployed
    rollbacks: number; // status rolled_back
    failed: number;
    avgDurationMs: number | null;
    deploysPerDay: number | null;
  };
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

/** Compute pipeline metrics from the full set of runs. */
export function computeMetrics(runs: Run[]): Metrics {
  const ci = runs.filter((r) => r.kind === 'ci');
  const cd = runs.filter((r) => r.kind === 'cd');

  const ciPassed = ci.filter((r) => r.status === 'passed').length;
  const ciFailed = ci.filter((r) => r.status === 'failed' || r.status === 'timed_out').length;
  const ciTerminal = ciPassed + ciFailed;

  const deploys = cd.filter((r) => r.status === 'deployed');
  const rollbacks = cd.filter((r) => r.status === 'rolled_back');

  return {
    ci: {
      total: ci.length,
      passed: ciPassed,
      failed: ciFailed,
      successRate: ciTerminal > 0 ? ciPassed / ciTerminal : null,
      avgDurationMs: avg(ci.filter((r) => r.durationMs != null).map((r) => r.durationMs!)),
    },
    cd: {
      deploys: deploys.length,
      rollbacks: rollbacks.length,
      failed: cd.filter((r) => r.status === 'failed').length,
      avgDurationMs: avg(cd.filter((r) => r.durationMs != null).map((r) => r.durationMs!)),
      deploysPerDay: deploysPerDay(deploys),
    },
  };
}

function deploysPerDay(deploys: Run[]): number | null {
  if (deploys.length === 0) return null;
  const times = deploys.map((r) => Date.parse(r.createdAt)).sort((a, b) => a - b);
  const spanMs = times[times.length - 1] - times[0];
  const days = Math.max(spanMs / 86_400_000, 1 / 24); // floor span at 1h to avoid div-by-0 spikes
  return Number((deploys.length / days).toFixed(2));
}

export interface Explanation {
  commit: string;
  ci: { status: string; reason?: string } | null;
  cd: { status: string; reason?: string } | null;
  explanation: string;
}

/** Explain why a commit did/didn't run CI or deploy, from recorded runs. */
export function explainCommit(runs: Run[], commit: string): Explanation {
  // runs are newest-first; find the latest CI and CD run for this commit
  const ciRun = runs.find((r) => r.kind === 'ci' && r.commit === commit);
  const cdRun = runs.find((r) => r.kind === 'cd' && r.commit === commit);

  const parts: string[] = [];
  if (!ciRun && !cdRun) {
    parts.push(`No runs recorded for commit ${commit.slice(0, 8)}.`);
  }
  if (ciRun) {
    parts.push(
      ciRun.status === 'skipped'
        ? `CI was skipped: ${ciRun.reason ?? 'no reason recorded'}.`
        : `CI ${ciRun.status}${ciRun.reason ? ` (${ciRun.reason})` : ''}.`,
    );
  }
  if (cdRun) {
    parts.push(
      cdRun.status === 'blocked'
        ? `CD was blocked: ${cdRun.reason ?? 'no reason recorded'}.`
        : `CD ${cdRun.status}${cdRun.reason ? ` (${cdRun.reason})` : ''}.`,
    );
  } else if (ciRun && ciRun.status === 'passed') {
    parts.push('No CD run recorded (not a deployable event, or deploy not reached).');
  }

  return {
    commit,
    ci: ciRun ? { status: ciRun.status, reason: ciRun.reason } : null,
    cd: cdRun ? { status: cdRun.status, reason: cdRun.reason } : null,
    explanation: parts.join(' '),
  };
}
