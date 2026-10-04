import { describe, it, expect } from 'vitest';
import { HostDockerImageBuilder, type Exec } from './image-builder';

describe('HostDockerImageBuilder', () => {
  it('computes the image ref from registry/image/commit', () => {
    const b = new HostDockerImageBuilder({ registry: 'localhost:5001', image: 'dummy-app' });
    expect(b.imageRef('abc123')).toBe('localhost:5001/dummy-app:abc123');
  });

  it('clones, checks out the commit, builds with APP_VERSION, and pushes', async () => {
    const calls: string[] = [];
    const exec: Exec = async (cmd, args) => {
      calls.push([cmd, ...args].join(' '));
      return { stdout: '', stderr: '' };
    };
    const b = new HostDockerImageBuilder({ registry: 'localhost:5001', image: 'dummy-app', exec });

    const tag = await b.build('https://github.com/x/Dummy-app.git', 'abc123');

    expect(tag).toBe('localhost:5001/dummy-app:abc123');
    expect(calls.some((c) => c.startsWith('git clone'))).toBe(true);
    expect(calls.some((c) => c.includes('checkout') && c.includes('abc123'))).toBe(true);
    expect(
      calls.some(
        (c) =>
          c.startsWith('docker build') &&
          c.includes('APP_VERSION=abc123') &&
          c.includes('localhost:5001/dummy-app:abc123'),
      ),
    ).toBe(true);
    expect(calls.some((c) => c === 'docker push localhost:5001/dummy-app:abc123')).toBe(true);
  });
});
