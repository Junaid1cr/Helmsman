import { describe, it, expect } from 'vitest';
import { SqliteStore } from './sqlite-store';
import type { CreateRunInput } from './types';

function ci(commit: string, overrides: Partial<CreateRunInput> = {}): CreateRunInput {
  return {
    kind: 'ci',
    status: 'queued',
    repo: 'r',
    branch: 'main',
    commit,
    ...overrides,
  };
}

describe('SqliteStore', () => {
  it('creates and reads a run round-trip', () => {
    const s = new SqliteStore(':memory:');
    const run = s.createRun(ci('aaa', { message: 'hi' }));
    const got = s.getRun(run.id);
    expect(got).toEqual(run);
    expect(got?.commit).toBe('aaa');
    expect(got?.message).toBe('hi');
  });

  it('updates a run and leaves other fields intact', () => {
    const s = new SqliteStore(':memory:');
    const run = s.createRun(ci('aaa'));
    const updated = s.updateRun(run.id, {
      status: 'passed',
      logs: 'ok',
      durationMs: 1234,
      finishedAt: '2026-10-04T00:00:00.000Z',
    });
    expect(updated.status).toBe('passed');
    expect(updated.logs).toBe('ok');
    expect(updated.durationMs).toBe(1234);
    expect(updated.createdAt).toBe(run.createdAt); // unchanged
    expect(s.getRun(run.id)).toEqual(updated);
  });

  it('throws when updating a missing run', () => {
    const s = new SqliteStore(':memory:');
    expect(() => s.updateRun('nope', { status: 'passed' })).toThrow(/not found/);
  });

  it('lists newest-first and applies filters + limit', () => {
    const s = new SqliteStore(':memory:');
    const a = s.createRun(ci('aaa'));
    const b = s.createRun(ci('bbb', { kind: 'cd', status: 'deployed' }));
    const c = s.createRun(ci('ccc', { branch: 'feature' }));

    // newest first by insertion
    expect(s.listRuns().map((r) => r.id)).toEqual([c.id, b.id, a.id]);
    // filter by kind
    expect(s.listRuns({ kind: 'cd' }).map((r) => r.id)).toEqual([b.id]);
    // filter by status
    expect(s.listRuns({ status: 'deployed' }).map((r) => r.id)).toEqual([b.id]);
    // filter by branch
    expect(s.listRuns({ branch: 'feature' }).map((r) => r.id)).toEqual([c.id]);
    // limit
    expect(s.listRuns({ limit: 2 }).map((r) => r.id)).toEqual([c.id, b.id]);
  });

  it('creates, lists, and deletes freezes', () => {
    const s = new SqliteStore(':memory:');
    const f1 = s.createFreeze({ range: '2026-10-20..2026-10-23', reason: 'release week' });
    const f2 = s.createFreeze({ range: '2026-12-25' });

    expect(s.listFreezes().map((f) => f.id)).toEqual([f2.id, f1.id]); // newest first
    expect(s.listFreezes().find((f) => f.id === f1.id)?.reason).toBe('release week');

    expect(s.deleteFreeze(f1.id)).toBe(true);
    expect(s.deleteFreeze(f1.id)).toBe(false); // already gone
    expect(s.listFreezes().map((f) => f.id)).toEqual([f2.id]);
  });

  it('persists across store instances (same file)', () => {
    const path = `${process.cwd()}/node_modules/.cache/helmsman-test-${Date.now()}.sqlite`;
    const s1 = new SqliteStore(path);
    const run = s1.createRun(ci('aaa', { status: 'passed' }));
    s1.close();

    const s2 = new SqliteStore(path);
    const got = s2.getRun(run.id);
    expect(got?.status).toBe('passed');
    expect(got?.commit).toBe('aaa');
    s2.close();
  });
});
