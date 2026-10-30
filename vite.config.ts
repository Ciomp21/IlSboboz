import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: 'apps/web',
  plugins: [react()],
  resolve: {
    alias: {
      '@ilsboboz/shared': resolve(repositoryRoot, 'packages/shared/src'),
      '@ilsboboz/game-engine': resolve(repositoryRoot, 'packages/game-engine/src'),
    }
  },
  build: {
    outDir: '../../dist',
    emptyOutDir: true
  }
});
