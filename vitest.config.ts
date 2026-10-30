import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@ilsboboz/shared': '/packages/shared/src',
      '@ilsboboz/game-engine': '/packages/game-engine/src',
    },
  },
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'tests/**/*.test.ts']
  }
});
