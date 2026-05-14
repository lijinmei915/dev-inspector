# Dev Inspector

可视化 CSS 检查与编辑工具——在浏览器里实时拾取元素、调样式、对照设计 token，开发模式下的"动手设计"小帮手。

## 安装

```bash
npm install -D @lijinmei-810/dev-inspector @lijinmei-810/dev-inspector-vite
```

## 用法

**1. `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import {
  createDevHandoffPlugin,
  createDevInspectorServerPlugin,
} from '@lijinmei-810/dev-inspector-vite';

export default defineConfig({
  plugins: [
    react(),
    createDevInspectorServerPlugin({
      projectRoot: __dirname,
      cssFile: path.resolve(__dirname, 'src/styles/index.css'),
      styleInboxJsonFile: path.resolve(__dirname, 'docs/style-inbox.json'),
      styleInboxMarkdownFile: path.resolve(__dirname, 'docs/STYLE_INBOX.md'),
      commitTargetFile: 'src/styles/dev-overrides.css',
    }),
    createDevHandoffPlugin(__dirname),
  ],
});
```

**2. `src/main.tsx`**

```ts
import '@lijinmei-810/dev-inspector/style.css';

if (import.meta.env.DEV) {
  import('@lijinmei-810/dev-inspector').then(({ mountDevInspector }) => {
    mountDevInspector({
      tokens: {
        // 把你项目的设计 token 注入进去
        colorPalette: YOUR_COLOR_PALETTE,
        tokenLabels: YOUR_TOKEN_LABELS,
        // ... 其余可选
      },
    });
  });
}
```

## Monorepo 结构

```
dev-inspector/
├── packages/
│   ├── dev-inspector/        @lijinmei-810/dev-inspector
│   └── dev-inspector-vite/   @lijinmei-810/dev-inspector-vite
```

## 开发

```bash
npm install
npm run build         # 两个包都打包
npm run typecheck     # 全仓类型检查
```

## License

MIT
