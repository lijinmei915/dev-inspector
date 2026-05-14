#!/usr/bin/env bash
set -euo pipefail

adapter="${1:-}"
target="${2:-.}"
source_root="${PROJECT_OS_SOURCE:-}"

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/install-adapter.sh <adapter> [target]

Adapters:
  claude  -> CLAUDE.md
  codex   -> CODEX.md
  cursor  -> .cursor/rules/project-os.md
  gemini  -> GEMINI.md

Example:
  bash scripts/install-adapter.sh claude .
USAGE
}

if [ -z "$adapter" ]; then
  usage
  exit 2
fi

if [ -z "$source_root" ]; then
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  source_root="$(cd "$script_dir/.." && pwd)"
fi

if [ ! -d "$target" ]; then
  echo "ERROR: target directory not found: $target"
  exit 2
fi

target_abs="$(cd "$target" && pwd)"
source_abs="$(cd "$source_root" && pwd)"
timestamp="$(date +%Y%m%d-%H%M%S)"
backup_root="$target_abs/.project-os/backups/$timestamp"

case "$adapter" in
  claude)
    src_rel="adapters/CLAUDE.md"
    dest_rel="CLAUDE.md"
    ;;
  codex)
    src_rel="adapters/CODEX.md"
    dest_rel="CODEX.md"
    ;;
  cursor)
    src_rel="adapters/CURSOR.md"
    dest_rel=".cursor/rules/project-os.md"
    ;;
  gemini)
    src_rel="adapters/GEMINI.md"
    dest_rel="GEMINI.md"
    ;;
  *)
    echo "ERROR: unknown adapter: $adapter"
    usage
    exit 2
    ;;
esac

src="$source_abs/$src_rel"
dest="$target_abs/$dest_rel"

if [ ! -f "$src" ]; then
  echo "ERROR: adapter template not found: $src_rel"
  exit 2
fi

if [ -e "$dest" ] || [ -L "$dest" ]; then
  backup_dest="$backup_root/$dest_rel"
  mkdir -p "$(dirname "$backup_dest")"
  cp -R "$dest" "$backup_dest"
  echo "Project OS adapter: backed up existing file to $backup_dest"
fi

mkdir -p "$(dirname "$dest")"
cp "$src" "$dest"

echo "Project OS adapter: installed $adapter -> $dest_rel"
echo "Project OS adapter: source of truth remains AGENTS.md"
