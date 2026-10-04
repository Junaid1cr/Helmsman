import { Injectable, Logger } from '@nestjs/common';
import { RulesService } from '../rules/rules.service';
import { RunnerService } from '../runner/runner.service';
import { StoreService } from '../store/store.service';
import { DeployerService } from '../deployer/deployer.service';
import type { PipelineEvent } from '../rules/types';
import type { RunStatus } from '../store/types';

export interface TriggerAck {
  runId: string;
  kind: 'ci';
  status: RunStatus;
  reason: string;
}

/**
 * Orchestrates a trigger end-to-end: evaluate CI → run it → on pass, evaluate
 * and run CD. Returns the CI run id immediately; the CI→CD chain runs in the
 * background.
 */
@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    private readonly rules: RulesService,
    private readonly runner: RunnerService,
    private readonly store: StoreService,
    private readonly deployer: DeployerService,
  ) {}

  handleTrigger(event: PipelineEvent): TriggerAck {
    const ci = this.rules.evaluateCi(event);

    if (!ci.run) {
      const run = this.store.createRun({
        kind: 'ci',
        status: 'skipped',
        repo: event.repo,
        branch: event.branch,
        commit: event.commit,
        message: event.message,
        reason: ci.reason,
      });
      return { runId: run.id, kind: 'ci', status: 'skipped', reason: ci.reason };
    }

    const run = this.store.createRun({
      kind: 'ci',
      status: 'queued',
      repo: event.repo,
      branch: event.branch,
      commit: event.commit,
      message: event.message,
    });

    void this.runCiThenCd(run.id, event);
    return { runId: run.id, kind: 'ci', status: 'queued', reason: ci.reason };
  }

  private async runCiThenCd(ciRunId: string, event: PipelineEvent): Promise<void> {
    try {
      const result = await this.runner.execute(ciRunId, event);
      if (result.status !== 'passed') return;
      if (event.eventType !== 'push') return; // PRs don't deploy

      const ack = this.deployer.requestDeploy(event, true);
      this.logger.log(`CI ${ciRunId} passed → CD ${ack.runId} (${ack.status})`);
    } catch (e) {
      this.logger.error(`pipeline for CI ${ciRunId} errored: ${(e as Error).message}`);
    }
  }
}
