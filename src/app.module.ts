import { Module } from '@nestjs/common';
import { RulesModule } from './rules/rules.module';
import { StoreModule } from './store/store.module';
import { RunnerModule } from './runner/runner.module';
import { DeployerModule } from './deployer/deployer.module';
import { FreezeModule } from './freeze/freeze.module';
import { InsightsModule } from './insights/insights.module';
import { TriggerModule } from './trigger/trigger.module';

@Module({
  imports: [
    RulesModule,
    StoreModule,
    RunnerModule,
    DeployerModule,
    FreezeModule,
    InsightsModule,
    TriggerModule,
  ],
})
export class AppModule {}
