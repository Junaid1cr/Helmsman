import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadRules, RulesConfigError } from './config';

describe('loadRules', () => {
  it('loads the repo rules.yaml with valid structure', () => {
    // rules.yaml is a live, user-editable config — assert it parses into a
    // valid shape, not exact values (which the user may change).
    const text = readFileSync(join(__dirname, '../../rules.yaml'), 'utf8');
    const cfg = loadRules(text);

    expect(Array.isArray(cfg.ci.on)).toBe(true);
    expect(cfg.ci.on.length).toBeGreaterThan(0);
    expect(Array.isArray(cfg.cd.branches)).toBe(true);
    expect(['manual', 'auto']).toContain(cfg.cd.approval);
  });

  it('maps snake_case YAML to camelCase config', () => {
    const cfg = loadRules(`
ci:
  on: [push, pull_request]
  paths: ["src/**", "Dockerfile"]
  skip_if_commit_contains: "[skip ci]"
cd:
  branches: [main]
  require: ci_passed
  windows: "Mon-Thu 10:00-17:00 IST"
  freeze: ["2026-10-20..2026-10-23"]
  approval: manual
`);
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
