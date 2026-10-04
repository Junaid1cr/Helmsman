export const HELMSMAN_LABELS = {
  managedBy: 'app.kubernetes.io/managed-by',
  runId: 'helmsman/run-id',
  kind: 'helmsman/kind',
} as const;

export const CI_JOB_SELECTOR = `${HELMSMAN_LABELS.managedBy}=helmsman,${HELMSMAN_LABELS.kind}=ci`;

/** Deterministic Job name from a run id (DNS-1123 safe). */
export function jobNameForRun(runId: string): string {
  return `helmsman-ci-${runId.slice(0, 8)}`;
}

export interface BuildCiJobParams {
  runId: string;
  repoUrl: string;
  commit: string;
  branch: string;
  namespace: string;
  image: string;
  maxDurationSec: number;
  ttlSecondsAfterFinished: number;
}

/**
 * Shell run inside the Job: fetch the exact commit from a public repo (works
 * for reachable SHAs on GitHub), install, and test. `set -eu` makes any failing
 * step fail the container, which fails the Job (backoffLimit 0).
 */
function ciScript(): string {
  return [
    'set -eu',
    'echo "[helmsman] workspace $(pwd)"',
    'mkdir -p /workspace && cd /workspace',
    'echo "[helmsman] fetching $REPO_URL @ $COMMIT_SHA"',
    'git init -q',
    'git remote add origin "$REPO_URL"',
    // Full SHAs can be fetched directly (GitHub allows reachable-SHA wants).
    // Short SHAs can't be fetched over the wire, so fall back to fetching the
    // branch and resolving the SHA locally.
    'if git fetch -q --depth 1 origin "$COMMIT_SHA"; then',
    '  git checkout -q FETCH_HEAD',
    'else',
    '  echo "[helmsman] direct SHA fetch failed; fetching branch $BRANCH"',
    '  git fetch -q --depth 50 origin "$BRANCH"',
    '  git checkout -q "$COMMIT_SHA"',
    'fi',
    'echo "[helmsman] npm ci"',
    'npm ci',
    'echo "[helmsman] npm test"',
    'npm test',
    'echo "[helmsman] done"',
  ].join('\n');
}

/** Build the V1Job manifest for a CI run (returned as a plain object). */
export function buildCiJob(p: BuildCiJobParams): Record<string, unknown> {
  const name = jobNameForRun(p.runId);
  const labels = {
    [HELMSMAN_LABELS.managedBy]: 'helmsman',
    [HELMSMAN_LABELS.runId]: p.runId,
    [HELMSMAN_LABELS.kind]: 'ci',
  };

  return {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: { name, namespace: p.namespace, labels },
    spec: {
      backoffLimit: 0, // no retries — one shot
      activeDeadlineSeconds: p.maxDurationSec, // K8s enforces the timeout
      ttlSecondsAfterFinished: p.ttlSecondsAfterFinished, // auto-cleanup, gives reconcile a window
      template: {
        metadata: { labels },
        spec: {
          restartPolicy: 'Never',
          containers: [
            {
              name: 'ci',
              image: p.image,
              command: ['sh', '-c', ciScript()],
              env: [
                { name: 'REPO_URL', value: p.repoUrl },
                { name: 'COMMIT_SHA', value: p.commit },
                { name: 'BRANCH', value: p.branch },
                { name: 'CI', value: 'true' },
              ],
              resources: {
                requests: { cpu: '100m', memory: '256Mi' },
                limits: { cpu: '1', memory: '1Gi' },
              },
            },
          ],
        },
      },
    },
  };
}
