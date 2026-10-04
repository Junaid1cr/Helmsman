import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { parsePushEvent, verifySignature } from './github';

function sign(secret: string, body: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(Buffer.from(body)).digest('hex');
}

describe('verifySignature', () => {
  const secret = 's3cr3t';
  const body = '{"hello":"world"}';

  it('accepts a correct signature', () => {
    expect(verifySignature(secret, Buffer.from(body), sign(secret, body))).toBe(true);
  });

  it('rejects a wrong signature', () => {
    expect(verifySignature(secret, Buffer.from(body), sign('other', body))).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(verifySignature(secret, Buffer.from(body), undefined)).toBe(false);
  });

  it('rejects when the body is tampered', () => {
    const sig = sign(secret, body);
    expect(verifySignature(secret, Buffer.from(body + 'x'), sig)).toBe(false);
  });
});

describe('parsePushEvent', () => {
  const base = {
    ref: 'refs/heads/main',
    after: '6e03eb1c1733d96adb8b88c4e0b15e0b3d8b8aae',
    repository: { clone_url: 'https://github.com/Junaid1cr/Dummy-app.git' },
    head_commit: { id: '6e03eb1c', message: 'feat: thing' },
    commits: [
      { added: ['src/a.ts'], modified: ['src/b.ts'], removed: [] },
      { added: [], modified: ['src/b.ts', 'README.md'], removed: ['old.ts'] },
    ],
  };

  it('maps a branch push to a PipelineEvent with a de-duped file list', () => {
    const e = parsePushEvent(base)!;
    expect(e.eventType).toBe('push');
    expect(e.branch).toBe('main');
    expect(e.commit).toBe(base.after);
    expect(e.repo).toBe('https://github.com/Junaid1cr/Dummy-app.git');
    expect(e.message).toBe('feat: thing');
    expect([...e.changedFiles].sort()).toEqual(['README.md', 'old.ts', 'src/a.ts', 'src/b.ts']);
  });

  it('ignores tag pushes', () => {
    expect(parsePushEvent({ ...base, ref: 'refs/tags/v1' })).toBeNull();
  });

  it('ignores branch deletions', () => {
    expect(parsePushEvent({ ...base, deleted: true })).toBeNull();
    expect(parsePushEvent({ ...base, after: '0000000000000000000000000000000000000000' })).toBeNull();
  });

  it('returns null without a clone_url', () => {
    expect(parsePushEvent({ ...base, repository: {} })).toBeNull();
  });
});
