import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: rootDir,
  resolve: {
    alias: [
      {
        find: '@lijinmei-810/dev-inspector/style.css',
        replacement: resolve(rootDir, '../dev-inspector/src/dev-inspector.css'),
      },
      {
        find: '@lijinmei-810/dev-inspector',
        replacement: resolve(rootDir, '../dev-inspector/src/index.ts'),
      },
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 8765,
    strictPort: true,
    fs: {
      allow: [resolve(rootDir, '..')],
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
