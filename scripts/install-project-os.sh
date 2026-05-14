#!/usr/bin/env bash
set -euo pipefail

target="${1:-.}"
source_root="${PROJECT_OS_SOURCE:-}"

if [ -z "$source_root" ]; then
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  source_root="$(cd "$script_dir/.." && pwd)"
fi

if [ ! -d "$target" ]; then
  echo "ERROR: target directory not found: $target"
  exit 2
fi

if [ ! -d "$source_root" ]; then
  echo "ERROR: source directory not found: $source_root"
  exit 2
fi

target_abs="$(cd "$target" && pwd)"
source_abs="$(cd "$source_root" && pwd)"
timestamp="$(date +%Y%m%d-%H%M%S)"
backup_root="$target_abs/.project-os/backups/$timestamp"

installed=0
backed_up=0

log() {
  echo "Project OS installer: $*"
}

if [ "$source_abs" = "$target_abs" ]; then
  log "source and target are the same directory"
  log "nothing to install; run 'bash scripts/check-runtime.sh .' to check this Project OS repo"
  exit 0
fi

backup_existing() {
  relative_path="$1"
  dest="$target_abs/$relative_path"

  if [ -e "$dest" ] || [ -L "$dest" ]; then
    backup_dest="$backup_root/$relative_path"
    mkdir -p "$(dirname "$backup_dest")"
    cp -R "$dest" "$backup_dest"
    backed_up=$((backed_up + 1))
  fi
}

copy_file_from() {
  source_path="$1"
  relative_path="$2"
  dest="$target_abs/$relative_path"

  if [ ! -f "$source_path" ]; then
    log "skip missing source file: $source_path"
    return
  fi

  backup_existing "$relative_path"
  mkdir -p "$(dirname "$dest")"
  cp "$source_path" "$dest"
  installed=$((installed + 1))
  log "installed file: $relative_path"
}

copy_file() {
  relative_path="$1"
  src="$source_abs/$relative_path"
  copy_file_from "$src" "$relative_path"
}

copy_optional_file() {
  relative_path="$1"
  src="$source_abs/$relative_path"

  if [ ! -f "$src" ]; then
    log "skip optional source file: $relative_path"
    return
  fi

  copy_file "$relative_path"
}

copy_dir() {
  relative_path="$1"
  src="$source_abs/$relative_path"
  dest="$target_abs/$relative_path"

  if [ ! -d "$src" ]; then
    log "skip missing source directory: $relative_path"
    return
  fi

  backup_existing "$relative_path"
  mkdir -p "$dest"
  cp -R "$src/." "$dest/"
  installed=$((installed + 1))
  log "installed directory: $relative_path"
}

log "source: $source_abs"
log "target: $target_abs"

copy_dir ".claude/skills"
copy_dir ".claude/commands"
copy_dir ".claude/hooks"

copy_file ".claude/project.json"
copy_file ".claude/settings.local.json"

copy_file "AGENTS.md"
copy_optional_file "CLAUDE.md"
copy_file "INSTALL.md"

copy_dir "tests"
copy_dir "adapters"
copy_dir "docs/design"

template_root="$source_abs/templates/project"

copy_file_from "$template_root/README.md" "README.md"
copy_file_from "$template_root/PROJECT.md" "PROJECT.md"
copy_file_from "$template_root/HANDOFF.md" "HANDOFF.md"
copy_file_from "$source_abs/docs/DOCUMENTATION.md" "docs/DOCUMENTATION.md"
copy_file_from "$template_root/docs/CHANGELOG.md" "docs/CHANGELOG.md"
copy_file_from "$template_root/docs/DECISIONS.md" "docs/DECISIONS.md"
copy_file_from "$template_root/docs/LESSONS.md" "docs/LESSONS.md"
copy_file_from "$template_root/docs/TESTING.md" "docs/TESTING.md"
copy_file_from "$template_root/docs/PRODUCT_PLAN.md" "docs/PRODUCT_PLAN.md"
copy_file_from "$template_root/docs/CODE_STRUCTURE.md" "docs/CODE_STRUCTURE.md"
copy_file_from "$template_root/docs/DESIGN_STANDARDS.md" "docs/DESIGN_STANDARDS.md"

mkdir -p "$target_abs/scripts"
copy_file "scripts/check-runtime.sh"
copy_file "scripts/install-project-os.sh"
copy_file "scripts/install-adapter.sh"
copy_file "scripts/create-test-fixtures.sh"

if [ -f "$target_abs/.gitignore" ]; then
  if ! grep -q '^\.DS_Store$' "$target_abs/.gitignore"; then
    printf '\n.DS_Store\n' >> "$target_abs/.gitignore"
    log "updated .gitignore: added .DS_Store"
  fi
else
  printf '.DS_Store\n' > "$target_abs/.gitignore"
  log "created .gitignore"
fi

log "installed items: $installed"

if [ "$backed_up" -gt 0 ]; then
  log "backed up existing items: $backed_up"
  log "backup location: $backup_root"
fi

log "next: run 'bash scripts/check-runtime.sh .'"
