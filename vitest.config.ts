import { defineConfig } from 'vitest/config';

// Single root Vitest project: discovers every *.test.ts across packages/, apps/, and
// test/. Workspace package specifiers (@fix-my-shot/*) resolve to their src via each
// package.json's exports field, so tests run against source with no build step.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
