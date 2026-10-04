export type FetchFn = typeof fetch;

export interface ListRunsQuery {
  kind?: 'ci' | 'cd';
  status?: string;
  branch?: string;
  limit?: number;
}

export interface DeployBody {
  commit: string;
  repo?: string;
  branch?: string;
  message?: string;
}

/**
 * Thin HTTP client for the Helmsman control plane. The MCP server holds no
 * pipeline logic — every tool maps to one of these calls. `fetchFn` is injected
 * for testing.
 */
export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  private async req(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const msg = (data && (data.message ?? data.error)) || res.statusText;
      throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(msg)}`);
    }
    return data;
  }

  listRuns(q: ListRunsQuery = {}): Promise<unknown> {
    const sp = new URLSearchParams();
    if (q.kind) sp.set('kind', q.kind);
    if (q.status) sp.set('status', q.status);
    if (q.branch) sp.set('branch', q.branch);
    if (q.limit !== undefined) sp.set('limit', String(q.limit));
    const qs = sp.toString();
    return this.req('GET', `/runs${qs ? `?${qs}` : ''}`);
  }

  getRun(id: string): Promise<unknown> {
    return this.req('GET', `/runs/${encodeURIComponent(id)}`);
  }

  explain(commit: string): Promise<unknown> {
    return this.req('GET', `/explain?commit=${encodeURIComponent(commit)}`);
  }

  getMetrics(): Promise<unknown> {
    return this.req('GET', '/metrics');
  }

  triggerDeploy(body: DeployBody): Promise<unknown> {
    return this.req('POST', '/deploy', body);
  }

  approveDeploy(runId: string): Promise<unknown> {
    return this.req('POST', `/deploy/${encodeURIComponent(runId)}/approve`);
  }

  rollback(): Promise<unknown> {
    return this.req('POST', '/rollback');
  }

  setFreeze(range: string, reason?: string): Promise<unknown> {
    return this.req('POST', '/freeze', { range, reason });
  }

  removeFreeze(id: string): Promise<unknown> {
    return this.req('DELETE', `/freeze/${encodeURIComponent(id)}`);
  }

  listFreezes(): Promise<unknown> {
    return this.req('GET', '/freeze');
  }
}
