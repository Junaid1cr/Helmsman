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
import { StoreService } from '../store/store.service';
import type { PipelineEvent } from '../rules/types';
import type { Run, RunKind, RunStatus } from '../store/types';
import { PipelineService, type TriggerAck } from './pipeline.service';
import { TriggerDto } from './dto';

@Controller()
export class TriggerController {
  constructor(
    private readonly pipeline: PipelineService,
    private readonly store: StoreService,
  ) {}

  /**
   * Entry point for manual triggers and (later) GitHub webhooks. Evaluates CI
   * rules, runs CI if applicable, and chains CD on pass — all in the background.
   * Returns 202 with the CI run id; never blocks on the Job.
   */
  @Post('trigger')
  @HttpCode(HttpStatus.ACCEPTED)
  trigger(@Body() dto: TriggerDto): TriggerAck {
    const event: PipelineEvent = {
      repo: dto.repo,
      branch: dto.branch,
      commit: dto.commit,
      message: dto.message ?? '',
      changedFiles: dto.changedFiles ?? [],
      eventType: dto.eventType ?? 'push',
    };
    return this.pipeline.handleTrigger(event);
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
