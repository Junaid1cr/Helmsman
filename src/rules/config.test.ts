import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadRules, RulesConfigError } from './config';

describe('loadRules', () => {
  it('parses the repo rules.yaml into camelCase config', () => {
    const text = readFileSync(join(__dirname, '../../rules.yaml'), 'utf8');
    const cfg = loadRules(text);

    expect(cfg.ci.on).toEqual(['push', 'pull_request']);
    expect(cfg.ci.paths).toEqual(['src/**', 'Dockerfile']);
    expect(cfg.ci.skipIfCommitContains).toBe('[skip ci]');

    expect(cfg.cd.branches).toEqual(['main']);
    expect(cfg.cd.require).toBe('ci_passed');
    expect(cfg.cd.windows).toBe('Mon-Thu 10:00-17:00 IST');
    expect(cfg.cd.freeze).toEqual(['2026-10-20..2026-10-23']);
    expect(cfg.cd.approval).toBe('manual');
  });

  it('defaults require to null and approval to auto when omitted', () => {
    const cfg = loadRules(`
ci:
  on: [push]
cd:
  branches: [main]
`);
    expect(cfg.cd.require).toBeNull();
    expect(cfg.cd.approval).toBe('auto');
  });

  it('throws a clear error on an invalid event type', () => {
    expect(() => loadRules(`
ci:
  on: [merge]
cd:
  branches: [main]
`)).toThrow(RulesConfigError);
  });

  it('throws when ci.on is missing', () => {
    expect(() => loadRules(`
ci: {}
cd:
  branches: [main]
`)).toThrow(RulesConfigError);
  });
});
