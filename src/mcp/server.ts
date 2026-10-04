/**
 * Helmsman MCP server — a separate stdio process that exposes the pipeline to
 * Claude. It holds no pipeline logic: every tool is a thin call to the control
 * plane's REST API (default http://localhost:4000/api/v1, override with
 * HELMSMAN_API_URL). The NestJS server must be running.
 *
 * Run:  npm run mcp    (or register in an MCP client — see README)
 *
 * NOTE: stdout is the MCP transport; all logging goes to stderr.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ApiClient } from './api-client';

const api = new ApiClient(process.env.HELMSMAN_API_URL ?? 'http://localhost:4000/api/v1');

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

function ok(data: unknown): ToolResult {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: 'text', text }] };
}

/** Wrap a tool handler so API/network errors surface as tool errors, not crashes. */
function tool<A>(fn: (args: A) => Promise<unknown>) {
  return async (args: A): Promise<ToolResult> => {
    try {
      return ok(await fn(args));
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true };
    }
  };
}

const server = new McpServer({ name: 'helmsman', version: '0.1.0' });

/**
 * registerTool's generics choke on the SDK's zod-v3/v4 compat types under our
 * module resolution (TS2589). The shapes are valid zod at runtime; we erase the
 * generics here and keep type safety in each handler's explicit arg type.
 */
type ToolConfig = { description: string; inputSchema: Record<string, unknown> };
const registerTool = server.registerTool.bind(server) as unknown as (
  name: string,
  cfg: ToolConfig,
  cb: (args: never) => Promise<ToolResult>,
) => void;
const reg = (name: string, cfg: ToolConfig, cb: (args: never) => Promise<ToolResult>): void => {
  registerTool(name, cfg, cb);
};

reg(
  'list_runs',
  {
    description: 'List recent CI/CD runs, optionally filtered by kind, status, or branch.',
    inputSchema: {
      kind: z.enum(['ci', 'cd']).optional(),
      status: z.string().optional(),
      branch: z.string().optional(),
      limit: z.number().int().positive().optional(),
    },
  },
  tool((a: { kind?: 'ci' | 'cd'; status?: string; branch?: string; limit?: number }) =>
    api.listRuns(a),
  ),
);

reg(
  'get_run',
  {
    description: 'Get a single run by id, including its logs.',
    inputSchema: { id: z.string() },
  },
  tool((a: { id: string }) => api.getRun(a.id)),
);

reg(
  'explain_skip',
  {
    description: 'Explain why a commit did or did not run CI / deploy, from recorded runs.',
    inputSchema: { commit: z.string() },
  },
  tool((a: { commit: string }) => api.explain(a.commit)),
);

reg(
  'get_metrics',
  {
    description: 'Pipeline metrics: CI success rate and duration, deploy/rollback counts, frequency.',
    inputSchema: {},
  },
  tool(() => api.getMetrics()),
);

reg(
  'trigger_deploy',
  {
    description: 'Manually deploy a commit SHA (respects CD gates: branch, ci_passed, window, freeze, approval).',
    inputSchema: {
      commit: z.string(),
      repo: z.string().optional(),
      branch: z.string().optional(),
      message: z.string().optional(),
    },
  },
  tool((a: { commit: string; repo?: string; branch?: string; message?: string }) =>
    api.triggerDeploy(a),
  ),
);

reg(
  'approve_deploy',
  {
    description: 'Approve a CD run that is awaiting_approval, which proceeds to deploy.',
    inputSchema: { runId: z.string() },
  },
  tool((a: { runId: string }) => api.approveDeploy(a.runId)),
);

reg(
  'rollback',
  {
    description: 'Roll back the deployment to the previous live commit.',
    inputSchema: {},
  },
  tool(() => api.rollback()),
);

reg(
  'set_freeze',
  {
    description:
      'Add a deploy freeze. Range is "YYYY-MM-DD" or "YYYY-MM-DD..YYYY-MM-DD" (IST). Deploys in range are blocked.',
    inputSchema: { range: z.string(), reason: z.string().optional() },
  },
  tool((a: { range: string; reason?: string }) => api.setFreeze(a.range, a.reason)),
);

reg(
  'remove_freeze',
  {
    description: 'Remove a deploy freeze by id (use list via get runs/freezes to find it).',
    inputSchema: { id: z.string() },
  },
  tool((a: { id: string }) => api.removeFreeze(a.id)),
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[helmsman-mcp] connected over stdio');
}

void main().catch((e) => {
  console.error('[helmsman-mcp] fatal:', e);
  process.exit(1);
});
