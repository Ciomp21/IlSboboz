import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'apps/web',
  plugins: [react()],
  resolve: {
    alias: {
      '@ilsboboz/shared': '/packages/shared/src',
      '@ilsboboz/game-engine': '/packages/game-engine/src',
    }
  },
  build: {
    outDir: '../../dist',
    emptyOutDir: true
  }
});
