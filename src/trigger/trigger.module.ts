import { Module } from '@nestjs/common';
import { RulesModule } from '../rules/rules.module';
import { RunnerModule } from '../runner/runner.module';
import { StoreModule } from '../store/store.module';
import { TriggerController } from './trigger.controller';

@Module({
  imports: [RulesModule, RunnerModule, StoreModule],
  controllers: [TriggerController],
})
export class TriggerModule {}
