import { describe, it, expect } from 'vitest';
import { computeMetrics, explainCommit } from './insights';
import { MemoryStore } from '../store/memory-store';
import type { Store } from '../store/types';

function seed(): Store {
  const s = new MemoryStore();
  // CI: 2 passed, 1 failed, 1 skipped
  s.updateRun(s.createRun({ kind: 'ci', status: 'passed', repo: 'r', branch: 'main', commit: 'a' }).id, {
    durationMs: 10_000,
  });
  s.updateRun(s.createRun({ kind: 'ci', status: 'passed', repo: 'r', branch: 'main', commit: 'b' }).id, {
    durationMs: 20_000,
  });
  s.createRun({ kind: 'ci', status: 'failed', repo: 'r', branch: 'main', commit: 'c' });
  s.createRun({ kind: 'ci', status: 'skipped', repo: 'r', branch: 'main', commit: 'd', reason: 'no match' });
  // CD: 1 deployed, 1 rolled_back
  s.updateRun(s.createRun({ kind: 'cd', status: 'deployed', repo: 'r', branch: 'main', commit: 'a' }).id, {
    durationMs: 40_000,
  });
  s.createRun({ kind: 'cd', status: 'rolled_back', repo: 'r', branch: 'main', commit: 'a' });
  return s;
}

describe('computeMetrics', () => {
  it('summarizes CI and CD outcomes', () => {
    const m = computeMetrics(seed().listRuns());
    expect(m.ci.total).toBe(4);
    expect(m.ci.passed).toBe(2);
    expect(m.ci.failed).toBe(1); // skipped is not counted as failed
    expect(m.ci.successRate).toBeCloseTo(2 / 3); // 2 passed of 3 terminal
    expect(m.ci.avgDurationMs).toBe(15_000);
    expect(m.cd.deploys).toBe(1);
    expect(m.cd.rollbacks).toBe(1);
  });

  it('returns null rates when there are no runs', () => {
    const m = computeMetrics([]);
    expect(m.ci.successRate).toBeNull();
    expect(m.cd.deploysPerDay).toBeNull();
  });
});

describe('explainCommit', () => {
  it('explains a skipped commit', () => {
    const e = explainCommit(seed().listRuns(), 'd');
    expect(e.ci?.status).toBe('skipped');
    expect(e.explanation).toMatch(/CI was skipped/);
  });

  it('reports when no runs exist for a commit', () => {
    const e = explainCommit(seed().listRuns(), 'zzz');
    expect(e.ci).toBeNull();
    expect(e.cd).toBeNull();
    expect(e.explanation).toMatch(/No runs recorded/);
  });
});
