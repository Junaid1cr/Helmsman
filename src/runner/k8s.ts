import * as k8s from '@kubernetes/client-node';
import { HELMSMAN_LABELS } from './job-spec';
import type { JobStatus, K8sJobApi, ManagedJob } from './types';

function toJobStatus(status: k8s.V1JobStatus | undefined): JobStatus {
  const s = status ?? {};
  const failedCond = (s.conditions ?? []).find(
    (c) => c.type === 'Failed' && c.status === 'True',
  );
  return {
    active: s.active ?? 0,
    succeeded: s.succeeded ?? 0,
    failed: s.failed ?? 0,
    failureReason: failedCond?.reason,
  };
}

/**
 * Real K8sJobApi backed by @kubernetes/client-node (v1.x object-param API,
 * methods return bodies directly). Uses the host kubeconfig's current context.
 */
export class KubeJobApi implements K8sJobApi {
  private readonly batch: k8s.BatchV1Api;
  private readonly core: k8s.CoreV1Api;

  constructor(kc?: k8s.KubeConfig) {
    const config = kc ?? new k8s.KubeConfig();
    if (!kc) config.loadFromDefault();
    this.batch = config.makeApiClient(k8s.BatchV1Api);
    this.core = config.makeApiClient(k8s.CoreV1Api);
  }

  async createJob(namespace: string, manifest: unknown): Promise<void> {
    await this.batch.createNamespacedJob({ namespace, body: manifest as k8s.V1Job });
  }

  async getJobStatus(namespace: string, name: string): Promise<JobStatus> {
    const job = await this.batch.readNamespacedJob({ name, namespace });
    return toJobStatus(job.status);
  }

  async getJobLogs(namespace: string, jobName: string): Promise<string> {
    // K8s labels Job pods with both `job-name` and `batch.kubernetes.io/job-name`.
    const pods = await this.core.listNamespacedPod({
      namespace,
      labelSelector: `job-name=${jobName}`,
    });
    const pod = pods.items[0];
    if (!pod?.metadata?.name) return '(no pod found for job yet)';
    return this.core.readNamespacedPodLog({
      name: pod.metadata.name,
      namespace,
      container: 'ci',
    });
  }

  async deleteJob(namespace: string, name: string): Promise<void> {
    await this.batch.deleteNamespacedJob({ name, namespace, propagationPolicy: 'Background' });
  }

  async listJobs(namespace: string, labelSelector: string): Promise<ManagedJob[]> {
    const list = await this.batch.listNamespacedJob({ namespace, labelSelector });
    return list.items.map((job) => ({
      name: job.metadata?.name ?? '',
      runId: job.metadata?.labels?.[HELMSMAN_LABELS.runId],
      status: toJobStatus(job.status),
    }));
  }
}
