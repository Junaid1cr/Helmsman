import { describe, it, expect } from 'vitest';
import { CdDeployer } from './cd-deployer';
import { MemoryStore } from '../store/memory-store';
import type { DeployerConfig, ImageBuilderApi, K8sDeployApi } from './types';
import type { PipelineEvent } from '../rules/types';

const cfg: DeployerConfig = {
  namespace: 'default',
  deployment: 'dummy-app',
  container: 'dummy-app',
  rolloutTimeoutMs: 1000,
};

class FakeBuilder implements ImageBuilderApi {
  built: string[] = [];
  failOn?: string;
  imageRef(commit: string): string {
    return `reg/dummy-app:${commit}`;
  }
  async build(_repo: string, commit: string): Promise<string> {
    if (this.failOn === commit) throw new Error('build failed');
    this.built.push(commit);
    return this.imageRef(commit);
  }
}

class FakeDeploy implements K8sDeployApi {
  setCalls: { image: string; ver: string }[] = [];
  rolloutFailOnCommit?: string;
  lastCommit?: string;
  async setImage(_ns: string, _d: string, _c: string, image: string, ver: string): Promise<void> {
    this.setCalls.push({ image, ver });
    this.lastCommit = ver;
  }
  async waitRollout(): Promise<void> {
    if (this.rolloutFailOnCommit && this.lastCommit === this.rolloutFailOnCommit) {
      throw new Error('rollout failed');
    }
  }
}

function event(commit: string): PipelineEvent {
  return {
    repo: 'https://repo.git',
    branch: 'main',
    commit,
    message: 'm',
    changedFiles: [],
    eventType: 'push',
  };
}

function setup() {
  const store = new MemoryStore();
  const builder = new FakeBuilder();
  const k8s = new FakeDeploy();
  const cd = new CdDeployer(store, builder, k8s, cfg);
  return { store, builder, k8s, cd };
}

describe('CdDeployer.createCdRun', () => {
  it('maps decision outcomes to initial statuses', () => {
    const { cd } = setup();
    expect(cd.createCdRun(event('a'), { outcome: 'deploy', reason: '' }).status).toBe('deploying');
    expect(
      cd.createCdRun(event('a'), { outcome: 'queued_for_approval', reason: '' }).status,
    ).toBe('awaiting_approval');
    expect(cd.createCdRun(event('a'), { outcome: 'blocked', reason: 'x' }).status).toBe('blocked');
  });
});

describe('CdDeployer.execute', () => {
  it('builds, sets the image, waits rollout, and marks deployed', async () => {
    const { cd, builder, k8s } = setup();
    const run = cd.createCdRun(event('aaa'), { outcome: 'deploy', reason: 'ok' });
    const done = await cd.execute(run.id, event('aaa'));

    expect(done.status).toBe('deployed');
    expect(builder.built).toEqual(['aaa']);
    expect(k8s.setCalls[0]).toEqual({ image: 'reg/dummy-app:aaa', ver: 'aaa' });
    expect(cd.currentCommit()).toBe('aaa');
  });

  it('marks a run failed when the build fails (no auto-rollback)', async () => {
    const { cd, builder } = setup();
    // a prior good deploy exists; a later failure must NOT change currentCommit
    await cd.execute(cd.createCdRun(event('aaa'), { outcome: 'deploy', reason: '' }).id, event('aaa'));

    builder.failOn = 'bbb';
    const run = cd.createCdRun(event('bbb'), { outcome: 'deploy', reason: '' });
    const done = await cd.execute(run.id, event('bbb'));

    expect(done.status).toBe('failed');
    expect(done.reason).toMatch(/deploy failed/);
    expect(cd.currentCommit()).toBe('aaa'); // still on the last good deploy
  });

  it('marks failed when the rollout fails', async () => {
    const { cd, k8s } = setup();
    k8s.rolloutFailOnCommit = 'aaa';
    const run = cd.createCdRun(event('aaa'), { outcome: 'deploy', reason: '' });
    const done = await cd.execute(run.id, event('aaa'));
    expect(done.status).toBe('failed');
  });
});

describe('CdDeployer rollback', () => {
  it('rolls back to the previous live commit without rebuilding', async () => {
    const { cd, builder, k8s } = setup();
    await cd.execute(cd.createCdRun(event('aaa'), { outcome: 'deploy', reason: '' }).id, event('aaa'));
    await cd.execute(cd.createCdRun(event('bbb'), { outcome: 'deploy', reason: '' }).id, event('bbb'));
    builder.built = []; // rollback must not rebuild

    const { run, targetCommit } = cd.createRollbackRun();
    expect(targetCommit).toBe('aaa');

    const done = await cd.executeRollback(run.id);
    expect(done.status).toBe('rolled_back');
    expect(builder.built).toEqual([]);
    expect(k8s.setCalls.at(-1)).toEqual({ image: 'reg/dummy-app:aaa', ver: 'aaa' });
    expect(cd.currentCommit()).toBe('aaa');
  });

  it('throws when there is no previous version to roll back to', () => {
    const { cd } = setup();
    expect(() => cd.createRollbackRun()).toThrow(/no previous/);
  });
});
