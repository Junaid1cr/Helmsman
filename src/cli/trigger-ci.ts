/**
 * Manual CI trigger for development, before the HTTP server (step 4) exists.
 *
 *   npx tsx src/cli/trigger-ci.ts \
 *     --repo https://github.com/Junaid1cr/Dummy-app.git \
 *     --sha 6e03eb1 --branch main
 *
 * Runs a real CI Job against the current kubeconfig context, polls to
 * completion, prints logs, and exits non-zero if CI did not pass.
 */
import { CiRunner } from '../runner/ci-runner';
import { KubeJobApi } from '../runner/k8s';
import { MemoryStore } from '../store/memory-store';
import type { PipelineEvent } from '../rules/types';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

async function main(): Promise<void> {
  const repo = arg('repo');
  const sha = arg('sha');
  const branch = arg('branch', 'main')!;
  const namespace = arg('namespace', 'default')!;

  if (!repo || !sha) {
    console.error(
      'usage: tsx src/cli/trigger-ci.ts --repo <git-url> --sha <commit> [--branch main] [--namespace default]',
    );
    process.exit(2);
  }

  const event: PipelineEvent = {
    repo,
    branch,
    commit: sha,
    message: arg('message', 'manual CI trigger')!,
    changedFiles: [],
    eventType: 'push',
  };

  const runner = new CiRunner(new KubeJobApi(), new MemoryStore(), {
    namespace,
    pollIntervalMs: 3000,
    maxDurationSec: 600,
  });

  console.log(`[helmsman] starting CI for ${repo} @ ${sha} (ns=${namespace})`);
  const result = await runner.run(event);

  console.log('\n===== CI LOGS =====');
  console.log(result.logs.trimEnd());
  console.log('===================\n');
  console.log(
    `[helmsman] run ${result.runId} → ${result.status.toUpperCase()} in ${Math.round(
      result.durationMs / 1000,
    )}s (job ${result.jobName})`,
  );

  process.exit(result.status === 'passed' ? 0 : 1);
}

main().catch((e) => {
  console.error('[helmsman] fatal:', e);
  process.exit(1);
});
