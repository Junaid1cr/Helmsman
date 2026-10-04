import { Module } from '@nestjs/common';
import { RulesModule } from '../rules/rules.module';
import { StoreModule } from '../store/store.module';
import { DeployerService } from './deployer.service';
import { DeployController } from './deploy.controller';

@Module({
  imports: [RulesModule, StoreModule],
  providers: [DeployerService],
  controllers: [DeployController],
  exports: [DeployerService],
})
export class DeployerModule {}
