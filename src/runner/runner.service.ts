import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { StoreService } from '../store/store.service';
import type { PipelineEvent } from '../rules/types';
import { CiRunner } from './ci-runner';
import { KubeJobApi } from './k8s';

/**
 * Owns the CiRunner. Reconciles orphaned runs on boot and starts CI runs in the
 * background so the HTTP layer can return immediately.
 */
@Injectable()
export class RunnerService implements OnModuleInit {
  private readonly logger = new Logger(RunnerService.name);
  private readonly runner: CiRunner;

  constructor(private readonly store: StoreService) {
    this.runner = new CiRunner(new KubeJobApi(), this.store, {
      namespace: process.env.HELMSMAN_NAMESPACE ?? 'default',
      maxDurationSec: Number(process.env.CI_MAX_DURATION_SEC ?? 600),
      pollIntervalMs: 3000,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      const fixed = await this.runner.reconcile();
      if (fixed > 0) this.logger.log(`reconciled ${fixed} orphaned CI run(s) on boot`);
    } catch (e) {
      this.logger.warn(`reconcile on boot failed (cluster unreachable?): ${(e as Error).message}`);
    }
  }

  /** Create a queued CI run, kick the Job off in the background, return the id. */
  startCi(event: PipelineEvent): { runId: string } {
    const run = this.store.createRun({
      kind: 'ci',
      status: 'queued',
      repo: event.repo,
      branch: event.branch,
      commit: event.commit,
      message: event.message,
    });

    void this.runner.execute(run.id, event).catch((e) => {
      this.logger.error(`CI run ${run.id} errored: ${(e as Error).message}`);
      try {
        this.store.updateRun(run.id, {
          status: 'failed',
          reason: `runner error: ${(e as Error).message}`,
          finishedAt: new Date().toISOString(),
        });
      } catch {
        /* run may be gone; ignore */
      }
    });

    return { runId: run.id };
  }
}
