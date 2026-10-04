import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { RulesService } from '../rules/rules.service';
import { RunnerService } from '../runner/runner.service';
import { StoreService } from '../store/store.service';
import type { PipelineEvent } from '../rules/types';
import type { Run, RunKind, RunStatus } from '../store/types';
import { TriggerDto } from './dto';

@Controller()
export class TriggerController {
  constructor(
    private readonly rules: RulesService,
    private readonly runner: RunnerService,
    private readonly store: StoreService,
  ) {}

  /**
   * Entry point for manual triggers and (later) GitHub webhooks. Evaluates CI
   * rules; skips are recorded and returned, runnable events are started in the
   * background. Returns 202 with the run id — never blocks on the Job.
   */
  @Post('trigger')
  @HttpCode(HttpStatus.ACCEPTED)
  trigger(@Body() dto: TriggerDto): {
    runId: string;
    kind: 'ci';
    status: RunStatus;
    reason: string;
  } {
    const event: PipelineEvent = {
      repo: dto.repo,
      branch: dto.branch,
      commit: dto.commit,
      message: dto.message ?? '',
      changedFiles: dto.changedFiles ?? [],
      eventType: dto.eventType ?? 'push',
    };

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

    const { runId } = this.runner.startCi(event);
    return { runId, kind: 'ci', status: 'queued', reason: ci.reason };
  }

  @Get('runs')
  listRuns(
    @Query('kind') kind?: RunKind,
    @Query('status') status?: RunStatus,
    @Query('branch') branch?: string,
    @Query('limit') limit?: string,
  ): Run[] {
    return this.store.listRuns({
      kind,
      status,
      branch,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('runs/:id')
  getRun(@Param('id') id: string): Run {
    const run = this.store.getRun(id);
    if (!run) throw new NotFoundException(`run ${id} not found`);
    return run;
  }
}
