/** Builds and pushes an image for a commit; returns the full image ref. */
export interface ImageBuilderApi {
  build(repoUrl: string, commit: string): Promise<string>;
  /** Image ref for a commit without building (used by rollback). */
  imageRef(commit: string): string;
}

/** Narrow K8s surface for CD: patch a Deployment's image/env and await rollout. */
export interface K8sDeployApi {
  setImage(
    namespace: string,
    deployment: string,
    container: string,
    image: string,
    appVersion: string,
  ): Promise<void>;
  waitRollout(namespace: string, deployment: string, timeoutMs: number): Promise<void>;
}

export interface DeployerConfig {
  namespace: string; // default 'default'
  deployment: string; // default 'dummy-app'
  container: string; // default 'dummy-app'
  rolloutTimeoutMs: number; // default 120000
}

export const DEFAULT_DEPLOYER_CONFIG: DeployerConfig = {
  namespace: process.env.HELMSMAN_NAMESPACE ?? 'default',
  deployment: process.env.HELMSMAN_DEPLOYMENT ?? 'dummy-app',
  container: process.env.HELMSMAN_CONTAINER ?? 'dummy-app',
  rolloutTimeoutMs: Number(process.env.CD_ROLLOUT_TIMEOUT_MS ?? 120_000),
};
