import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RulesService } from '../rules/rules.service';
import { StoreService } from '../store/store.service';
import type { PipelineEvent } from '../rules/types';
import type { Run } from '../store/types';
import { CdDeployer } from './cd-deployer';
import { HostDockerImageBuilder } from './image-builder';
import { KubeDeployApi } from './k8s-deploy';
import { DEFAULT_DEPLOYER_CONFIG } from './types';
import type { DeployDto } from './dto';

const DEFAULT_APP_REPO =
  process.env.HELMSMAN_APP_REPO ?? 'https://github.com/Junaid1cr/Dummy-app.git';

export interface DeployAck {
  runId: string;
  kind: 'cd';
  status: Run['status'];
  reason?: string;
}

@Injectable()
export class DeployerService {
  private readonly logger = new Logger(DeployerService.name);
  private readonly cd: CdDeployer;

  constructor(
    private readonly rules: RulesService,
    private readonly store: StoreService,
  ) {
    this.cd = new CdDeployer(
      this.store,
      new HostDockerImageBuilder(),
      new KubeDeployApi(),
      DEFAULT_DEPLOYER_CONFIG,
    );
  }

  /** Evaluate CD gates and, if clear, deploy in the background. */
  requestDeploy(event: PipelineEvent, ciPassed: boolean): DeployAck {
    const decision = this.rules.evaluateCd(event, { ciPassed, at: new Date() });
    const run = this.cd.createCdRun(event, decision);

    if (decision.outcome === 'deploy') {
      this.background(run.id, () => this.cd.execute(run.id, event));
    }
    return { runId: run.id, kind: 'cd', status: run.status, reason: decision.reason };
  }

  /** Manual deploy: derive ciPassed from run history for the commit. */
  requestManualDeploy(dto: DeployDto): DeployAck {
    const event: PipelineEvent = {
      repo: dto.repo ?? DEFAULT_APP_REPO,
      branch: dto.branch ?? 'main',
      commit: dto.commit,
      message: dto.message ?? 'manual deploy',
      changedFiles: [],
      eventType: 'push',
    };
    return this.requestDeploy(event, this.ciPassedFor(dto.commit));
  }

  /** Approve a run that is awaiting_approval and deploy it. */
  approve(runId: string): DeployAck {
    const run = this.store.getRun(runId);
    if (!run || run.kind !== 'cd') throw new NotFoundException(`cd run ${runId} not found`);
    if (run.status !== 'awaiting_approval') {
      throw new BadRequestException(`run ${runId} is "${run.status}", not awaiting_approval`);
    }
    this.store.updateRun(runId, { status: 'deploying' });
    this.background(runId, () => this.cd.execute(runId, this.eventFromRun(run)));
    return { runId, kind: 'cd', status: 'deploying' };
  }

  /** Roll back to the previous live commit. */
  rollback(): DeployAck {
    let runId: string;
    try {
      runId = this.cd.createRollbackRun().run.id;
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    this.background(runId, () => this.cd.executeRollback(runId));
    return { runId, kind: 'cd', status: 'deploying' };
  }

  private ciPassedFor(commit: string): boolean {
    return this.store
      .listRuns({ kind: 'ci' })
      .some((r) => r.commit === commit && r.status === 'passed');
  }

  private eventFromRun(run: Run): PipelineEvent {
    return {
      repo: run.repo,
      branch: run.branch,
      commit: run.commit,
      message: run.message ?? '',
      changedFiles: [],
      eventType: 'push',
    };
  }

  private background(runId: string, fn: () => Promise<unknown>): void {
    void fn().catch((e) => {
      this.logger.error(`cd run ${runId} errored: ${(e as Error).message}`);
      try {
        this.store.updateRun(runId, {
          status: 'failed',
          reason: `deployer error: ${(e as Error).message}`,
          finishedAt: new Date().toISOString(),
        });
      } catch {
        /* run may be gone; ignore */
      }
    });
  }
}
