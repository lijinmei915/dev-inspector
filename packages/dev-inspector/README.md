# @lijinmei-810/dev-inspector

> Dev Inspector React panel. Use it with `@lijinmei-810/dev-inspector-vite` in Vite projects.

Dev Inspector is a local development inspector panel for selecting page elements, reading styles, adjusting visual properties, and sending structured style-change intent to AI.

## Install

```bash
npm i @lijinmei-810/dev-inspector
npm i -D @lijinmei-810/dev-inspector-vite
```

## Vite + React Setup

Add the Vite plugin:

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

Mount the panel in the app entry:

```tsx
// src/main.tsx
import { mountDevInspector } from '@lijinmei-810/dev-inspector';
import '@lijinmei-810/dev-inspector/style.css';

if (import.meta.env.DEV) {
  mountDevInspector();
}
```

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

## Package Roles

- `@lijinmei-810/dev-inspector`: React runtime panel, CSS, config, and `mountDevInspector`.
- `@lijinmei-810/dev-inspector-vite`: Vite development server endpoints for style apply, style intents, and handoff.

Both packages are needed for full local editing and AI handoff behavior in Vite projects.

## API

```ts
mountDevInspector(options?)
```

The panel uses default endpoints:

- `/__dev/apply-css`
- `/__dev/submit-style-intent`
- `/__dev/style-intents`
- `/__dev/style-intents/delete`
- `/__dev/handoff`
- `/__dev/reveal`

These endpoints are provided by `@lijinmei-810/dev-inspector-vite`.
