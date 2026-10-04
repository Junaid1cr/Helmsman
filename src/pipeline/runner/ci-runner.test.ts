import { describe, it, expect } from 'vitest';
import { CiRunner } from './ci-runner';
import { MemoryStore } from '../store/memory-store';
import type { JobStatus, K8sJobApi, ManagedJob } from './types';
import type { PipelineEvent } from '../rules/types';

const RUNNING: JobStatus = { active: 1, succeeded: 0, failed: 0 };
const SUCCEEDED: JobStatus = { active: 0, succeeded: 1, failed: 0 };
const FAILED: JobStatus = { active: 0, succeeded: 0, failed: 1 };
const DEADLINE: JobStatus = {
  active: 0,
  succeeded: 0,
  failed: 1,
  failureReason: 'DeadlineExceeded',
};

/** Fake K8s API that replays a scripted sequence of job statuses. */
class FakeK8s implements K8sJobApi {
  createdManifests: unknown[] = [];
  deleted: string[] = [];
  jobsForList: ManagedJob[] = [];

  constructor(private statuses: JobStatus[]) {}

  async createJob(_ns: string, manifest: unknown): Promise<void> {
    this.createdManifests.push(manifest);
  }
  async getJobStatus(): Promise<JobStatus> {
    // Return the next status; stay on the last once exhausted.
    return this.statuses.length > 1 ? this.statuses.shift()! : this.statuses[0];
  }
  async getJobLogs(): Promise<string> {
    return 'fake logs\nnpm test ok';
  }
  async deleteJob(_ns: string, name: string): Promise<void> {
    this.deleted.push(name);
  }
  async listJobs(): Promise<ManagedJob[]> {
    return this.jobsForList;
  }
}

function event(): PipelineEvent {
  return {
    repo: 'https://github.com/Junaid1cr/Dummy-app.git',
    branch: 'main',
    commit: '6e03eb1',
    message: 'test',
    changedFiles: [],
    eventType: 'push',
  };
}

const fastOpts = { pollIntervalMs: 1, maxDurationSec: 5 };

describe('CiRunner.run', () => {
  it('records a passed run with logs and duration', async () => {
    const store = new MemoryStore();
    const k8s = new FakeK8s([RUNNING, SUCCEEDED]);
    const runner = new CiRunner(k8s, store, fastOpts);

    const res = await runner.run(event());

    expect(res.status).toBe('passed');
    expect(k8s.createdManifests).toHaveLength(1);
    const run = store.getRun(res.runId)!;
    expect(run.status).toBe('passed');
    expect(run.logs).toContain('npm test ok');
    expect(run.startedAt).toBeDefined();
    expect(run.finishedAt).toBeDefined();
    expect(run.jobName).toBe(res.jobName);
  });

  it('records a failed run', async () => {
    const store = new MemoryStore();
    const runner = new CiRunner(new FakeK8s([RUNNING, FAILED]), store, fastOpts);
    const res = await runner.run(event());
    expect(res.status).toBe('failed');
    expect(store.getRun(res.runId)!.status).toBe('failed');
  });

  it('maps a DeadlineExceeded failure to timed_out', async () => {
    const store = new MemoryStore();
    const runner = new CiRunner(new FakeK8s([RUNNING, DEADLINE]), store, fastOpts);
    const res = await runner.run(event());
    expect(res.status).toBe('timed_out');
    expect(store.getRun(res.runId)!.reason).toMatch(/maxDurationSec/);
  });

  it('marks the run failed if the job cannot be created', async () => {
    const store = new MemoryStore();
    const broken = new FakeK8s([RUNNING]);
    broken.createJob = async () => {
      throw new Error('forbidden');
    };
    const res = await new CiRunner(broken, store, fastOpts).run(event());
    expect(res.status).toBe('failed');
    expect(store.getRun(res.runId)!.reason).toMatch(/failed to create job/);
  });
});

describe('CiRunner.reconcile', () => {
  it('finalizes a run left in "running" when its job has succeeded', async () => {
    const store = new MemoryStore();
    const k8s = new FakeK8s([RUNNING]);
    const runner = new CiRunner(k8s, store, fastOpts);

    // Simulate a run that was mid-flight when the service died.
    const run = store.createRun({
      kind: 'ci',
      status: 'running',
      repo: 'r',
      branch: 'main',
      commit: 'c',
    });
    k8s.jobsForList = [
      { name: 'helmsman-ci-x', runId: run.id, status: SUCCEEDED },
    ];

    const fixed = await runner.reconcile();

    expect(fixed).toBe(1);
    expect(store.getRun(run.id)!.status).toBe('passed');
  });

  it('ignores jobs whose run is already terminal', async () => {
    const store = new MemoryStore();
    const k8s = new FakeK8s([RUNNING]);
    const runner = new CiRunner(k8s, store, fastOpts);

    const run = store.createRun({
      kind: 'ci',
      status: 'passed',
      repo: 'r',
      branch: 'main',
      commit: 'c',
    });
    k8s.jobsForList = [{ name: 'j', runId: run.id, status: SUCCEEDED }];

    expect(await runner.reconcile()).toBe(0);
  });
});
