import { Module } from '@nestjs/common';
import { RulesModule } from './rules/rules.module';
import { StoreModule } from './store/store.module';
import { RunnerModule } from './runner/runner.module';
import { TriggerModule } from './trigger/trigger.module';

@Module({
  imports: [RulesModule, StoreModule, RunnerModule, TriggerModule],
})
export class AppModule {}
