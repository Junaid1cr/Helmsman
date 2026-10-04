import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { StoreService } from '../store/store.service';
import { computeMetrics, explainCommit, type Explanation, type Metrics } from './insights';

@Controller()
export class InsightsController {
  constructor(private readonly store: StoreService) {}

  @Get('metrics')
  metrics(): Metrics {
    return computeMetrics(this.store.listRuns());
  }

  @Get('explain')
  explain(@Query('commit') commit?: string): Explanation {
    if (!commit) throw new BadRequestException('query param "commit" is required');
    return explainCommit(this.store.listRuns(), commit);
  }
}
