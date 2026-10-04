import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { PipelineService } from '../trigger/pipeline.service';
import { parsePushEvent, verifySignature } from './github';

type WebhookRequest = RawBodyRequest<{ body: unknown }>;

@Controller()
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);
  private readonly secret = process.env.GITHUB_WEBHOOK_SECRET;

  constructor(private readonly pipeline: PipelineService) {}

  /**
   * GitHub webhook receiver. Verifies the HMAC signature over the raw body,
   * maps a push payload to a PipelineEvent, and kicks off the pipeline.
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  handle(
    @Req() req: WebhookRequest,
    @Headers('x-github-event') event?: string,
    @Headers('x-hub-signature-256') signature?: string,
  ): Record<string, unknown> {
    if (event === 'ping') return { ok: true, pong: true };

    if (this.secret) {
      const raw = req.rawBody ?? Buffer.alloc(0);
      if (!verifySignature(this.secret, raw, signature)) {
        throw new UnauthorizedException('invalid webhook signature');
      }
    } else {
      this.logger.warn('GITHUB_WEBHOOK_SECRET not set — signature verification DISABLED');
    }

    if (event !== 'push') return { ok: true, ignored: event ?? 'unknown' };

    const parsed = parsePushEvent((req.body ?? {}) as Parameters<typeof parsePushEvent>[0]);
    if (!parsed) return { ok: true, ignored: 'non-branch push or deletion' };

    const ack = this.pipeline.handleTrigger(parsed);
    this.logger.log(`webhook push ${parsed.branch}@${parsed.commit.slice(0, 8)} → run ${ack.runId} (${ack.status})`);
    return { ok: true, ...ack };
  }
}
