import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { ImageBuilderApi } from './types';

const execFileAsync = promisify(execFile);

/** Injectable command runner, so command construction is unit-testable. */
export type Exec = (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

const defaultExec: Exec = (cmd, args) =>
  execFileAsync(cmd, args, { maxBuffer: 32 * 1024 * 1024 });

export interface HostDockerOptions {
  registry?: string; // default 'localhost:5001'
  image?: string; // default 'dummy-app'
  exec?: Exec;
}

/**
 * Builds the app image on the host via Docker (Option B): clone the repo, check
 * out the commit, `docker build` with APP_VERSION, and push to the local
 * registry tagged with the commit SHA. Requires Docker on the host running the
 * control plane.
 */
export class HostDockerImageBuilder implements ImageBuilderApi {
  private readonly registry: string;
  private readonly image: string;
  private readonly exec: Exec;

  constructor(opts: HostDockerOptions = {}) {
    this.registry = opts.registry ?? process.env.HELMSMAN_REGISTRY ?? 'localhost:5001';
    this.image = opts.image ?? process.env.HELMSMAN_IMAGE ?? 'dummy-app';
    this.exec = opts.exec ?? defaultExec;
  }

  imageRef(commit: string): string {
    return `${this.registry}/${this.image}:${commit}`;
  }

  async build(repoUrl: string, commit: string): Promise<string> {
    const tag = this.imageRef(commit);
    const dir = mkdtempSync(join(tmpdir(), 'helmsman-build-'));
    try {
      await this.exec('git', ['clone', '--quiet', repoUrl, dir]);
      await this.exec('git', ['-C', dir, 'checkout', '--quiet', commit]);
      await this.exec('docker', [
        'build',
        '--build-arg',
        `APP_VERSION=${commit}`,
        '-t',
        tag,
        dir,
      ]);
      await this.exec('docker', ['push', tag]);
      return tag;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}
