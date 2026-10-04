import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Scope to the pipeline service only; dummy-app has its own test runner.
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
