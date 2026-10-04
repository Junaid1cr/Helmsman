import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { StoreService } from '../store/store.service';
import type { PipelineEvent } from '../rules/types';
import { CiRunner } from './ci-runner';
import type { CiRunResult } from './types';
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

  /**
   * Execute an already-created CI run to completion. The orchestrator creates
   * the run record, returns its id to the caller, then awaits this to chain CD.
   */
  execute(runId: string, event: PipelineEvent): Promise<CiRunResult> {
    return this.runner.execute(runId, event);
  }
}
