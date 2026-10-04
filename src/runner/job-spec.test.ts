import { describe, it, expect } from 'vitest';
import { buildCiJob, jobNameForRun, CI_JOB_SELECTOR } from './job-spec';

const params = {
  runId: 'abcd1234-5678-90ab-cdef-1234567890ab',
  repoUrl: 'https://github.com/Junaid1cr/Dummy-app.git',
  commit: '6e03eb1',
  branch: 'main',
  namespace: 'default',
  image: 'node:20',
  maxDurationSec: 600,
  ttlSecondsAfterFinished: 1800,
};

describe('buildCiJob', () => {
  const job = buildCiJob(params) as any;

  it('names the job deterministically from the run id', () => {
    expect(job.metadata.name).toBe('helmsman-ci-abcd1234');
    expect(jobNameForRun(params.runId)).toBe('helmsman-ci-abcd1234');
  });

  it('sets the helmsman labels on job and pod template', () => {
    const expected = {
      'app.kubernetes.io/managed-by': 'helmsman',
      'helmsman/run-id': params.runId,
      'helmsman/kind': 'ci',
    };
    expect(job.metadata.labels).toEqual(expected);
    expect(job.spec.template.metadata.labels).toEqual(expected);
  });

  it('is one-shot with a deadline and TTL', () => {
    expect(job.spec.backoffLimit).toBe(0);
    expect(job.spec.activeDeadlineSeconds).toBe(600);
    expect(job.spec.ttlSecondsAfterFinished).toBe(1800);
    expect(job.spec.template.spec.restartPolicy).toBe('Never');
  });

  it('injects repo/commit/branch env and runs git fetch + npm test', () => {
    const c = job.spec.template.spec.containers[0];
    expect(c.image).toBe('node:20');
    const env = Object.fromEntries(c.env.map((e: any) => [e.name, e.value]));
    expect(env.REPO_URL).toBe(params.repoUrl);
    expect(env.COMMIT_SHA).toBe(params.commit);
    expect(env.BRANCH).toBe('main');
    const script = c.command[2] as string;
    expect(script).toContain('git fetch -q --depth 1 origin "$COMMIT_SHA"');
    expect(script).toContain('npm ci');
    expect(script).toContain('npm test');
  });

  it('exposes a label selector matching the job labels', () => {
    expect(CI_JOB_SELECTOR).toBe(
      'app.kubernetes.io/managed-by=helmsman,helmsman/kind=ci',
    );
  });
});
