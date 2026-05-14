#!/usr/bin/env bash
set -euo pipefail

root="${1:-/tmp/project-os-fixtures}"

mkdir -p "$root"

empty="$root/empty-project"
existing="$root/existing-codebase"
installed="$root/installed-project-os"

rm -rf "$empty" "$existing" "$installed"

mkdir -p "$empty"
printf '# Empty Project\n' > "$empty/README.md"
printf '.DS_Store\n' > "$empty/.gitignore"

mkdir -p "$existing/src"
cat > "$existing/package.json" <<'JSON'
{
  "name": "existing-codebase",
  "private": true,
  "scripts": {
    "dev": "vite"
  },
  "dependencies": {
    "@vitejs/plugin-react": "latest",
    "vite": "latest",
    "typescript": "latest"
  }
}
JSON
cat > "$existing/src/App.tsx" <<'TSX'
export function App() {
  return <main>Existing app</main>;
}
TSX
cat > "$existing/src/main.tsx" <<'TSX'
import { App } from './App';

console.log(App);
TSX

mkdir -p "$installed/.claude/skills/project-setup/references"
cat > "$installed/AGENTS.md" <<'MD'
# AGENTS

This is a partial Project OS installation used for CHECK-UPGRADE tests.
MD
cat > "$installed/.claude/skills/project-setup/SKILL.md" <<'MD'
---
name: project-setup
description: Partial Project OS test skill.
---

# project-setup
MD
cat > "$installed/.claude/skills/project-setup/references/install.md" <<'MD'
# INSTALL FLOW

Partial install reference for CHECK-UPGRADE tests.
MD

echo "Project OS fixtures created:"
echo "$empty"
echo "$existing"
echo "$installed"
