import { defineConfig } from 'tsup';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  onSuccess: async () => {
    // CSS 单独拷贝，由消费者通过 '@lijinmei-810/dev-inspector/style.css' 引入
    copyFileSync(
      resolve('src/dev-inspector.css'),
      resolve('dist/dev-inspector.css'),
    );
  },
});
