import { describe, it, expect } from 'vitest';
import { evaluateCi, evaluateCd } from './evaluate';
import type { PipelineEvent, RulesConfig } from './types';

const rules: RulesConfig = {
  ci: {
    on: ['push', 'pull_request'],
    paths: ['src/**', 'Dockerfile'],
    skipIfCommitContains: '[skip ci]',
  },
  cd: {
    branches: ['main'],
    require: 'ci_passed',
    windows: 'Mon-Thu 10:00-17:00 IST',
    freeze: ['2026-10-20..2026-10-23'],
    approval: 'manual',
  },
};

function event(overrides: Partial<PipelineEvent> = {}): PipelineEvent {
  return {
    repo: 'airbound/app',
    branch: 'main',
    commit: 'abc123',
    message: 'fix: thing',
    changedFiles: ['src/index.ts'],
    eventType: 'push',
    ...overrides,
  };
}

// Mon 2026-10-05 12:00 IST = 06:30 UTC — inside the deploy window, not frozen.
const INSIDE_WINDOW = new Date('2026-10-05T06:30:00Z');

describe('evaluateCi', () => {
  it('runs when event type, paths, and message all pass', () => {
    expect(evaluateCi(event(), rules).run).toBe(true);
  });

  it('skips an event type not in ci.on', () => {
    const r = evaluateCi(event({ eventType: 'pull_request' }), {
      ...rules,
      ci: { ...rules.ci, on: ['push'] },
    });
    expect(r.run).toBe(false);
    expect(r.reason).toMatch(/not configured/);
  });

  it('skips when the commit message contains the skip marker', () => {
    const r = evaluateCi(event({ message: 'chore: docs [skip ci]' }), rules);
    expect(r.run).toBe(false);
    expect(r.reason).toMatch(/skip marker/);
  });

  it('skips when no changed file matches paths', () => {
    const r = evaluateCi(event({ changedFiles: ['README.md', 'docs/x.md'] }), rules);
    expect(r.run).toBe(false);
    expect(r.reason).toMatch(/no changed files match/);
  });

  it('matches a top-level file pattern like Dockerfile', () => {
    expect(evaluateCi(event({ changedFiles: ['Dockerfile'] }), rules).run).toBe(true);
  });

  it('runs regardless of files when no paths are configured', () => {
    const r = evaluateCi(event({ changedFiles: ['README.md'] }), {
      ...rules,
      ci: { ...rules.ci, paths: undefined },
    });
    expect(r.run).toBe(true);
  });
});

describe('evaluateCd', () => {
  const ctx = { ciPassed: true, at: INSIDE_WINDOW };

  it('queues for approval when all gates pass and approval is manual', () => {
    const r = evaluateCd(event(), rules, ctx);
    expect(r.outcome).toBe('queued_for_approval');
  });

  it('deploys when approval is auto', () => {
    const r = evaluateCd(event(), { ...rules, cd: { ...rules.cd, approval: 'auto' } }, ctx);
    expect(r.outcome).toBe('deploy');
  });

  it('blocks a branch not in cd.branches', () => {
    const r = evaluateCd(event({ branch: 'feature/x' }), rules, ctx);
    expect(r.outcome).toBe('blocked');
    expect(r.reason).toMatch(/not in cd.branches/);
  });

  it('blocks when ci_passed is required but CI did not pass', () => {
    const r = evaluateCd(event(), rules, { ciPassed: false, at: INSIDE_WINDOW });
    expect(r.outcome).toBe('blocked');
    expect(r.reason).toMatch(/ci_passed/);
  });

  it('blocks during a freeze (Oct 21 10:00 IST)', () => {
    const r = evaluateCd(event(), rules, { ciPassed: true, at: new Date('2026-10-21T04:30:00Z') });
    expect(r.outcome).toBe('blocked');
    expect(r.reason).toMatch(/frozen/);
  });

  it('blocks outside the deploy window (Mon 18:00 IST)', () => {
    const r = evaluateCd(event(), rules, { ciPassed: true, at: new Date('2026-10-05T12:30:00Z') });
    expect(r.outcome).toBe('blocked');
    expect(r.reason).toMatch(/outside deploy window/);
  });

  it('blocks on a runtime (extra) freeze not in rules.yaml', () => {
    // Oct 5 2026 (Mon) 12:00 IST — inside window, no static freeze — but a
    // runtime freeze covers it.
    const r = evaluateCd(event(), rules, {
      ciPassed: true,
      at: INSIDE_WINDOW,
      extraFreezes: ['2026-10-05'],
    });
    expect(r.outcome).toBe('blocked');
    expect(r.reason).toMatch(/frozen/);
  });

  it('freeze takes precedence over window (reports frozen)', () => {
    // Oct 21 2026 is a Wednesday inside the window AND inside the freeze.
    const r = evaluateCd(event(), rules, { ciPassed: true, at: new Date('2026-10-21T06:30:00Z') });
    expect(r.outcome).toBe('blocked');
    expect(r.reason).toMatch(/frozen/);
  });
});
