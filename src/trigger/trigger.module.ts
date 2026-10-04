import { Module } from '@nestjs/common';
import { RulesModule } from '../rules/rules.module';
import { RunnerModule } from '../runner/runner.module';
import { StoreModule } from '../store/store.module';
import { DeployerModule } from '../deployer/deployer.module';
import { PipelineService } from './pipeline.service';
import { TriggerController } from './trigger.controller';

@Module({
  imports: [RulesModule, RunnerModule, StoreModule, DeployerModule],
  providers: [PipelineService],
  controllers: [TriggerController],
})
export class TriggerModule {}
