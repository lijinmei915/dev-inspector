# @lijinmei-810/dev-inspector-vite

> Vite development server plugin for `@lijinmei-810/dev-inspector`.

This package provides local-only Vite middleware endpoints used by the Dev Inspector React panel.

## Install

```bash
npm i @lijinmei-810/dev-inspector
npm i -D @lijinmei-810/dev-inspector-vite
```

## Setup

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createDevInspectorServerPlugin } from '@lijinmei-810/dev-inspector-vite';

export default defineConfig({
  plugins: [
    react(),
    createDevInspectorServerPlugin({
      projectRoot: process.cwd(),
    }),
  ],
});
```

Then mount the React panel:

```tsx
// src/main.tsx
import { mountDevInspector } from '@lijinmei-810/dev-inspector';
import '@lijinmei-810/dev-inspector/style.css';

if (import.meta.env.DEV) {
  mountDevInspector();
}
```

## Export

```ts
import { createDevInspectorServerPlugin } from '@lijinmei-810/dev-inspector-vite';
```

## Options

```ts
createDevInspectorServerPlugin({
  projectRoot: process.cwd(),
  cssFile: 'src/styles/index.css',
  styleInboxJsonFile: 'docs/style-inbox.json',
  styleInboxMarkdownFile: 'docs/STYLE_INBOX.md',
  commitTargetFile: 'src/styles/dev-overrides.css',
});
```

Only `projectRoot` is required. Other options are optional and have defaults.

## Endpoints

The plugin registers development-only endpoints:

- `/__dev/apply-css`
- `/__dev/submit-style-intent`
- `/__dev/style-intents`
- `/__dev/style-intents/delete`
- `/__dev/handoff`
- `/__dev/reveal`

## AI Install Prompt

Paste this into an AI coding assistant:

```txt
Please integrate Dev Inspector into this Vite + React project.

Use these exact packages:
- Runtime panel: @lijinmei-810/dev-inspector
- Vite server plugin: @lijinmei-810/dev-inspector-vite

Do not search for or install vite-plugin-dev-inspector or @lijinmei-810/dev-inspector-vite-plugin.
Only enable Dev Inspector in development mode.
Do not change business logic.
```
