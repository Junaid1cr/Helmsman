import { Module } from '@nestjs/common';
import { StoreModule } from '../store/store.module';
import { InsightsController } from './insights.controller';

@Module({
  imports: [StoreModule],
  controllers: [InsightsController],
})
export class InsightsModule {}
