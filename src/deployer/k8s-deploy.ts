import * as k8s from '@kubernetes/client-node';
import type { K8sDeployApi } from './types';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Real K8sDeployApi backed by @kubernetes/client-node. Uses read-modify-replace
 * for the image/env change (avoids strategic-merge-patch content-type friction)
 * and polls the Deployment status for rollout completion.
 */
export class KubeDeployApi implements K8sDeployApi {
  private readonly apps: k8s.AppsV1Api;

  constructor(kc?: k8s.KubeConfig) {
    const config = kc ?? new k8s.KubeConfig();
    if (!kc) config.loadFromDefault();
    this.apps = config.makeApiClient(k8s.AppsV1Api);
  }

  async setImage(
    namespace: string,
    deployment: string,
    container: string,
    image: string,
    appVersion: string,
  ): Promise<void> {
    const dep = await this.apps.readNamespacedDeployment({ name: deployment, namespace });

    const containers = dep.spec?.template?.spec?.containers ?? [];
    const c = containers.find((x) => x.name === container);
    if (!c) throw new Error(`container "${container}" not found in deployment "${deployment}"`);

    c.image = image;
    const env = c.env ?? [];
    const existing = env.find((e) => e.name === 'APP_VERSION');
    if (existing) existing.value = appVersion;
    else env.push({ name: 'APP_VERSION', value: appVersion });
    c.env = env;

    await this.apps.replaceNamespacedDeployment({ name: deployment, namespace, body: dep });
  }

  async waitRollout(namespace: string, deployment: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let last = '';

    while (Date.now() < deadline) {
      const dep = await this.apps.readNamespacedDeployment({ name: deployment, namespace });
      const desired = dep.spec?.replicas ?? 1;
      const st = dep.status ?? {};
      const observed = (st.observedGeneration ?? 0) >= (dep.metadata?.generation ?? 0);

      if (
        observed &&
        (st.updatedReplicas ?? 0) >= desired &&
        (st.availableReplicas ?? 0) >= desired &&
        (st.unavailableReplicas ?? 0) === 0
      ) {
        return;
      }
      last = `updated=${st.updatedReplicas ?? 0}/${desired} available=${st.availableReplicas ?? 0} unavailable=${st.unavailableReplicas ?? 0}`;
      await sleep(2000);
    }
    throw new Error(`rollout of "${deployment}" timed out after ${timeoutMs}ms (${last})`);
  }
}
