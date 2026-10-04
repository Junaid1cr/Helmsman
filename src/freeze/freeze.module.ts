import { Module } from '@nestjs/common';
import { StoreModule } from '../store/store.module';
import { FreezeController } from './freeze.controller';

@Module({
  imports: [StoreModule],
  controllers: [FreezeController],
})
export class FreezeModule {}
