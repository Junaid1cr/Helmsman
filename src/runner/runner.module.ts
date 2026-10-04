import { Module } from '@nestjs/common';
import { StoreModule } from '../store/store.module';
import { RunnerService } from './runner.service';

@Module({
  imports: [StoreModule],
  providers: [RunnerService],
  exports: [RunnerService],
})
export class RunnerModule {}
