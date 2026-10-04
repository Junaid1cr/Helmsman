import type { CdDecision, PipelineEvent } from '../rules/types';
import type { Run, Store } from '../store/types';
import type { DeployerConfig, ImageBuilderApi, K8sDeployApi } from './types';

/**
 * Pure CD orchestration: turns a CdDecision into a recorded deploy, builds and
 * rolls out the image, and handles rollback. Framework-free; the Nest service
 * supplies the store, image builder, and K8s client.
 */
export class CdDeployer {
  constructor(
    private readonly store: Store,
    private readonly imageBuilder: ImageBuilderApi,
    private readonly k8s: K8sDeployApi,
    private readonly cfg: DeployerConfig,
  ) {}

  /** Create the CD run record reflecting a decision's initial state. */
  createCdRun(event: PipelineEvent, decision: CdDecision): Run {
    const status =
      decision.outcome === 'deploy'
        ? 'deploying'
        : decision.outcome === 'queued_for_approval'
          ? 'awaiting_approval'
          : 'blocked';
    return this.store.createRun({
      kind: 'cd',
      status,
      repo: event.repo,
      branch: event.branch,
      commit: event.commit,
      message: event.message,
      reason: decision.reason,
    });
  }

  /** Build the image, set it on the Deployment, wait for rollout. */
  async execute(runId: string, event: PipelineEvent): Promise<Run> {
    const startedAt = new Date();
    this.store.updateRun(runId, { startedAt: startedAt.toISOString() });

    try {
      const image = await this.imageBuilder.build(event.repo, event.commit);
      await this.k8s.setImage(
        this.cfg.namespace,
        this.cfg.deployment,
        this.cfg.container,
        image,
        event.commit,
      );
      await this.k8s.waitRollout(this.cfg.namespace, this.cfg.deployment, this.cfg.rolloutTimeoutMs);
      return this.finish(runId, 'deployed', startedAt);
    } catch (e) {
      // No auto-rollback: a failed build never changed the Deployment, and a
      // failed rollout is recovered via the explicit rollback endpoint. The run
      // is marked failed; `commit` stays the attempted SHA.
      return this.finish(runId, 'failed', startedAt, `deploy failed: ${(e as Error).message}`);
    }
  }

  /** Create a rollback run targeting the previous live commit. */
  createRollbackRun(): { run: Run; targetCommit: string } {
    const current = this.currentCommit();
    const target = this.history().find((r) => r.commit !== current);
    if (!target) throw new Error('no previous deployed version to roll back to');

    const run = this.store.createRun({
      kind: 'cd',
      status: 'deploying',
      repo: target.repo,
      branch: target.branch,
      commit: target.commit,
      message: `rollback to ${target.commit.slice(0, 8)}`,
    });
    return { run, targetCommit: target.commit };
  }

  /** Re-point the Deployment at an already-built image (no rebuild). */
  async executeRollback(runId: string): Promise<Run> {
    const run = this.store.getRun(runId);
    if (!run) throw new Error(`run not found: ${runId}`);
    const startedAt = new Date();
    this.store.updateRun(runId, { startedAt: startedAt.toISOString() });

    try {
      await this.k8s.setImage(
        this.cfg.namespace,
        this.cfg.deployment,
        this.cfg.container,
        this.imageBuilder.imageRef(run.commit),
        run.commit,
      );
      await this.k8s.waitRollout(this.cfg.namespace, this.cfg.deployment, this.cfg.rolloutTimeoutMs);
      return this.finish(runId, 'rolled_back', startedAt, `rolled back to ${run.commit.slice(0, 8)}`);
    } catch (e) {
      return this.finish(runId, 'failed', startedAt, `rollback failed: ${(e as Error).message}`);
    }
  }

  /** The commit currently live (latest deployed or rolled-back run). */
  currentCommit(): string | undefined {
    return this.history()[0]?.commit;
  }

  // --- internals ---

  /** CD runs that resulted in a live deployment, newest first. */
  private history(): Run[] {
    return this.store
      .listRuns({ kind: 'cd' })
      .filter((r) => r.status === 'deployed' || r.status === 'rolled_back');
  }

  private finish(
    runId: string,
    status: Run['status'],
    startedAt: Date,
    reason?: string,
  ): Run {
    const finishedAt = new Date();
    return this.store.updateRun(runId, {
      status,
      reason,
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    });
  }
}
