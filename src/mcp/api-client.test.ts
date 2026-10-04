import { describe, it, expect } from 'vitest';
import { ApiClient, type FetchFn } from './api-client';

interface Call {
  url: string;
  method: string;
  body?: string;
}

function fakeFetch(
  status: number,
  payload: unknown,
): { fetchFn: FetchFn; calls: Call[] } {
  const calls: Call[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: init?.body as string | undefined,
    });
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: 'x',
      text: async () => (payload === undefined ? '' : JSON.stringify(payload)),
    };
  }) as unknown as FetchFn;
  return { fetchFn, calls };
}

const BASE = 'http://localhost:4000/api/v1';

describe('ApiClient', () => {
  it('builds a filtered list_runs query', async () => {
    const { fetchFn, calls } = fakeFetch(200, []);
    await new ApiClient(BASE, fetchFn).listRuns({ kind: 'cd', status: 'deployed', limit: 5 });
    expect(calls[0].url).toBe(`${BASE}/runs?kind=cd&status=deployed&limit=5`);
    expect(calls[0].method).toBe('GET');
  });

  it('POSTs a deploy body', async () => {
    const { fetchFn, calls } = fakeFetch(202, { runId: 'x' });
    await new ApiClient(BASE, fetchFn).triggerDeploy({ commit: 'abc' });
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe(`${BASE}/deploy`);
    expect(JSON.parse(calls[0].body!)).toEqual({ commit: 'abc' });
  });

  it('encodes ids in paths', async () => {
    const { fetchFn, calls } = fakeFetch(200, {});
    await new ApiClient(BASE, fetchFn).approveDeploy('a/b');
    expect(calls[0].url).toBe(`${BASE}/deploy/a%2Fb/approve`);
  });

  it('throws with status and message on non-2xx', async () => {
    const { fetchFn } = fakeFetch(400, { message: 'bad commit' });
    await expect(new ApiClient(BASE, fetchFn).getRun('x')).rejects.toThrow(/400.*bad commit/);
  });

  it('sends DELETE for remove_freeze', async () => {
    const { fetchFn, calls } = fakeFetch(200, { removed: true });
    await new ApiClient(BASE, fetchFn).removeFreeze('f1');
    expect(calls[0].method).toBe('DELETE');
    expect(calls[0].url).toBe(`${BASE}/freeze/f1`);
  });
});
