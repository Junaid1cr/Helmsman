import yaml from 'js-yaml';
import { z } from 'zod';
import type { RulesConfig } from './types';

const eventType = z.enum(['push', 'pull_request']);

/**
 * Schema matches the YAML as written (snake_case). We validate the raw shape,
 * then map to the camelCase RulesConfig the engine uses.
 */
const schema = z.object({
  ci: z.object({
    on: z.array(eventType).nonempty(),
    paths: z.array(z.string()).optional(),
    skip_if_commit_contains: z.string().optional(),
  }),
  cd: z.object({
    branches: z.array(z.string()).default([]),
    require: z.enum(['ci_passed']).optional(),
    windows: z.string().optional(),
    freeze: z.array(z.string()).optional(),
    approval: z.enum(['manual', 'auto']).default('auto'),
  }),
});

export class RulesConfigError extends Error {}

/** Parse and validate rules.yaml text into a RulesConfig. */
export function loadRules(yamlText: string): RulesConfig {
  let raw: unknown;
  try {
    raw = yaml.load(yamlText);
  } catch (e) {
    throw new RulesConfigError(`rules.yaml is not valid YAML: ${(e as Error).message}`);
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new RulesConfigError(`rules.yaml is invalid:\n${issues}`);
  }

  const { ci, cd } = parsed.data;
  return {
    ci: {
      on: ci.on,
      paths: ci.paths,
      skipIfCommitContains: ci.skip_if_commit_contains,
    },
    cd: {
      branches: cd.branches,
      require: cd.require ?? null,
      windows: cd.windows,
      freeze: cd.freeze,
      approval: cd.approval,
    },
  };
}
