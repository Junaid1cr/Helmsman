import picomatch from 'picomatch';
import type {
  CdContext,
  CdDecision,
  CiDecision,
  PipelineEvent,
  RulesConfig,
} from './types';
import { activeFreeze, isWithinWindow } from './time';

/**
 * Decide whether CI should run for an event. Order: event-type gate →
 * skip marker → path filter. First failing gate wins and explains itself.
 */
export function evaluateCi(event: PipelineEvent, rules: RulesConfig): CiDecision {
  const { ci } = rules;

  if (!ci.on.includes(event.eventType)) {
    return {
      run: false,
      reason: `CI not configured for "${event.eventType}" events (on: ${ci.on.join(', ')})`,
    };
  }

  if (ci.skipIfCommitContains && event.message.includes(ci.skipIfCommitContains)) {
    return {
      run: false,
      reason: `commit message contains skip marker "${ci.skipIfCommitContains}"`,
    };
  }

  if (ci.paths && ci.paths.length > 0) {
    const isMatch = picomatch(ci.paths, { dot: true });
    const matched = event.changedFiles.some((f) => isMatch(f));
    if (!matched) {
      return {
        run: false,
        reason: `no changed files match paths [${ci.paths.join(', ')}]`,
      };
    }
  }

  return { run: true, reason: 'all CI conditions met' };
}

/**
 * Decide the CD outcome for an event. Order: branch → ci_passed → freeze →
 * window → approval. First blocking gate wins. Assumes the caller only invokes
 * this for deployable events (i.e. pushes, not PRs).
 */
export function evaluateCd(
  event: PipelineEvent,
  rules: RulesConfig,
  ctx: CdContext,
): CdDecision {
  const { cd } = rules;
  const at = ctx.at ?? new Date();

  if (!cd.branches.includes(event.branch)) {
    return {
      outcome: 'blocked',
      reason: `branch "${event.branch}" not in cd.branches [${cd.branches.join(', ') || 'none'}]`,
    };
  }

  if (cd.require === 'ci_passed' && !ctx.ciPassed) {
    return { outcome: 'blocked', reason: 'cd.require is ci_passed but CI has not passed' };
  }

  const freezes = [...(cd.freeze ?? []), ...(ctx.extraFreezes ?? [])];
  const freeze = activeFreeze(at, freezes);
  if (freeze) {
    return { outcome: 'blocked', reason: `deploy frozen (${freeze})` };
  }

  if (cd.windows && !isWithinWindow(at, cd.windows)) {
    return { outcome: 'blocked', reason: `outside deploy window "${cd.windows}"` };
  }

  if (cd.approval === 'manual') {
    return { outcome: 'queued_for_approval', reason: 'eligible; awaiting manual approval' };
  }

  return { outcome: 'deploy', reason: 'all CD conditions met' };
}
