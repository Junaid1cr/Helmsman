import { Module } from '@nestjs/common';
import { TriggerModule } from '../trigger/trigger.module';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [TriggerModule], // for PipelineService
  controllers: [WebhookController],
})
export class WebhookModule {}
