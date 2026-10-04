import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PipelineEvent } from '../rules/types';

/**
 * Verify a GitHub webhook signature (X-Hub-Signature-256) against the raw
 * request body using the shared secret. Constant-time comparison.
 */
export function verifySignature(
  secret: string,
  rawBody: Buffer,
  signatureHeader: string | undefined,
): boolean {
  if (!signatureHeader) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface GithubCommit {
  added?: string[];
  modified?: string[];
  removed?: string[];
}

interface GithubPushPayload {
  ref?: string;
  after?: string;
  deleted?: boolean;
  repository?: { clone_url?: string };
  head_commit?: { id?: string; message?: string } | null;
  commits?: GithubCommit[];
}

/** Union of added/modified/removed files across all commits in the push. */
function collectChangedFiles(commits: GithubCommit[]): string[] {
  const set = new Set<string>();
  for (const c of commits) {
    for (const f of [...(c.added ?? []), ...(c.modified ?? []), ...(c.removed ?? [])]) {
      set.add(f);
    }
  }
  return [...set];
}

/**
 * Map a GitHub push payload to a PipelineEvent. Returns null for things we
 * don't act on: tag pushes, branch deletions, or malformed payloads.
 */
export function parsePushEvent(payload: GithubPushPayload): PipelineEvent | null {
  const ref = payload.ref;
  if (!ref || !ref.startsWith('refs/heads/')) return null; // not a branch push
  if (payload.deleted) return null; // branch deletion

  const branch = ref.slice('refs/heads/'.length);
  const commit = payload.after || payload.head_commit?.id;
  if (!commit || /^0+$/.test(commit)) return null; // no/zero SHA (deletion)

  const repo = payload.repository?.clone_url;
  if (!repo) return null;

  return {
    repo,
    branch,
    commit,
    message: payload.head_commit?.message ?? '',
    changedFiles: collectChangedFiles(payload.commits ?? []),
    eventType: 'push',
  };
}
