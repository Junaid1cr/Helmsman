import { Injectable, Logger } from '@nestjs/common';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadRules } from './config';
import { evaluateCi, evaluateCd } from './evaluate';
import type { CdContext, CdDecision, CiDecision, PipelineEvent, RulesConfig } from './types';

/**
 * Loads rules.yaml and evaluates CI/CD decisions. Caches the parsed config and
 * reloads it when the file's mtime changes, so edits are picked up without a
 * restart.
 */
@Injectable()
export class RulesService {
  private readonly logger = new Logger(RulesService.name);
  private cache?: { mtimeMs: number; config: RulesConfig };

  private get path(): string {
    return process.env.RULES_PATH ?? join(process.cwd(), 'rules.yaml');
  }

  getRules(): RulesConfig {
    const { mtimeMs } = statSync(this.path);
    if (!this.cache || this.cache.mtimeMs !== mtimeMs) {
      this.cache = { mtimeMs, config: loadRules(readFileSync(this.path, 'utf8')) };
      this.logger.log(`loaded rules from ${this.path}`);
    }
    return this.cache.config;
  }

  evaluateCi(event: PipelineEvent): CiDecision {
    return evaluateCi(event, this.getRules());
  }

  evaluateCd(event: PipelineEvent, ctx: CdContext): CdDecision {
    return evaluateCd(event, this.getRules(), ctx);
  }
}
