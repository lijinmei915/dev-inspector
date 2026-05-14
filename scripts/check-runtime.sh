#!/usr/bin/env bash
set -u

target="${1:-.}"

if [ ! -d "$target" ]; then
  echo "ERROR: target directory not found: $target"
  exit 2
fi

cd "$target" || exit 2

warnings=0
errors=0
is_source_repo=0

if [ -d "templates/project" ]; then
  is_source_repo=1
fi

warn() {
  warnings=$((warnings + 1))
  echo "WARN: $*"
}

error() {
  errors=$((errors + 1))
  echo "ERROR: $*"
}

has_file() {
  [ -f "$1" ]
}

contains() {
  file="$1"
  pattern="$2"
  [ -f "$file" ] && grep -q "$pattern" "$file"
}

check_guidance_header() {
  file="$1"
  [ -f "$file" ] || return 0
  header_preview="$(head -n 12 "$file" 2>/dev/null || true)"
  for pattern in "用途：" "什么时候更新：" "不要写什么："; do
    if ! printf '%s\n' "$header_preview" | grep -q "$pattern"; then
      warn "document should include guidance header ($pattern): $file"
    fi
  done
}

has_any() {
  file="$1"
  shift
  [ -f "$file" ] || return 1
  for pattern in "$@"; do
    if grep -q "$pattern" "$file"; then
      return 0
    fi
  done
  return 1
}

count_matches() {
  pattern="$1"
  if command -v rg >/dev/null 2>&1; then
    rg -n "$pattern" README.md AGENTS.md PROJECT.md HANDOFF.md .claude/skills/project-setup/SKILL.md .claude/skills/project-setup/references 2>/dev/null | wc -l | tr -d ' '
  else
    grep -R -n "$pattern" README.md AGENTS.md PROJECT.md HANDOFF.md .claude/skills/project-setup/SKILL.md .claude/skills/project-setup/references 2>/dev/null | wc -l | tr -d ' '
  fi
}

echo "Checking AI Runtime docs in: $(pwd)"

for file in README.md AGENTS.md PROJECT.md HANDOFF.md; do
  if ! has_file "$file"; then
    error "missing core file: $file"
  fi
done

for file in README.md AGENTS.md PROJECT.md HANDOFF.md INSTALL.md CLAUDE.md docs/CHANGELOG.md docs/CODE_STRUCTURE.md docs/DECISIONS.md docs/DESIGN_STANDARDS.md docs/DOCUMENTATION.md docs/LESSONS.md docs/PRODUCT_PLAN.md docs/TESTING.md tests/cases.md tests/cross-tool-matrix.md examples/filled-project.md examples/prompt-simulation.md; do
  check_guidance_header "$file"
done

for file in INSTALL.md scripts/install-project-os.sh scripts/install-adapter.sh; do
  if ! has_file "$file"; then
    warn "missing Project OS installation helper: $file"
  fi
done

if ! has_file "docs/DOCUMENTATION.md"; then
  warn "missing documentation governance file: docs/DOCUMENTATION.md"
fi

if [ "$is_source_repo" -eq 1 ]; then
  for file in tests/cross-tool-matrix.md scripts/create-test-fixtures.sh; do
    if ! has_file "$file"; then
      warn "missing Project OS cross-tool testing helper: $file"
    fi
  done
  for file in templates/global/GLOBAL_USER_PREFERENCES_TEMPLATE.md templates/global/GLOBAL_USER_PROFILE_TEMPLATE.md templates/global/MEMORY_RULES.md; do
    if ! has_file "$file"; then
      warn "missing global collaboration template: $file"
    fi
  done
fi

for file in adapters/CLAUDE.md adapters/CODEX.md adapters/CURSOR.md adapters/GEMINI.md; do
  if ! has_file "$file"; then
    warn "missing Project OS adapter template: $file"
  fi
done

for file in .claude/skills/REGISTRY.md .claude/skills/project-setup/SKILL.md .claude/skills/project-setup/references/install.md .claude/skills/project-setup/references/init.md .claude/skills/project-setup/references/audit.md .claude/skills/project-setup/references/hybrid.md .claude/skills/project-setup/references/clarification.md .claude/skills/design-system/SKILL.md .claude/skills/frontend/SKILL.md .claude/skills/tests/cases.md .claude/skills/changelog/README.md; do
  if ! has_file "$file"; then
    error "missing Project OS skill file: $file"
  fi
done

for file in .claude/commands/os.md .claude/commands/os-check.md .claude/commands/os-test.md .claude/commands/os-handoff.md; do
  if ! has_file "$file"; then
    warn "missing optional Project OS slash command: $file"
  fi
done

if has_file ".claude/skills/project-setup/SKILL.md"; then
  if ! has_any ".claude/skills/project-setup/SKILL.md" "name: project-setup" "Primary entry skill"; then
    warn "project-setup SKILL.md should include skill metadata and entry role"
  fi
  if ! has_any ".claude/skills/project-setup/SKILL.md" "Project-Level Gate"; then
    warn "project-setup SKILL.md should define project-level gate"
  fi
  if ! has_any ".claude/skills/project-setup/SKILL.md" "Prototype-first" "Foundation-first" "Full setup"; then
    warn "project-setup SKILL.md should define INIT start modes"
  fi
  if ! has_any ".claude/skills/project-setup/SKILL.md" "before any code" "MUST decide INIT start mode"; then
    warn "project-setup SKILL.md should require classification before generation"
  fi
fi

if has_file ".claude/skills/REGISTRY.md"; then
  if ! has_any ".claude/skills/REGISTRY.md" "does not depend on external skills" "不依赖外部 skill"; then
    warn "REGISTRY.md should state Project OS has no external skill dependency"
  fi
fi

for file in docs/PRODUCT_PLAN.md docs/CODE_STRUCTURE.md docs/TESTING.md; do
  if ! has_file "$file"; then
    warn "missing optional but recommended file: $file"
  fi
done

if ! has_file "tests/cases.md"; then
  warn "missing Project OS test cases: tests/cases.md"
fi

if has_file "tests/cases.md"; then
  if ! has_any "tests/cases.md" "Case 8" "Project OS Test Cases"; then
    warn "tests/cases.md should include the v1 Project OS cases"
  fi
fi

if [ "$is_source_repo" -eq 1 ]; then
  for file in examples/filled-project.md examples/prompt-simulation.md; do
    if ! has_file "$file"; then
      warn "missing example file: $file"
    fi
  done
fi

placeholder_count="$(count_matches '\{\{[^}]+\}\}')"
todo_count="$(count_matches 'TODO')"

if [ "$placeholder_count" -gt 0 ]; then
  warn "found $placeholder_count template placeholder line(s): {{...}}"
fi

if [ "$is_source_repo" -eq 1 ] && [ "$todo_count" -gt 0 ]; then
  warn "found $todo_count TODO line(s)"
fi

if [ -f ".DS_Store" ]; then
  warn "found .DS_Store; remove it before committing or copying this runtime"
fi

if has_file "HANDOFF.md"; then
  if contains "HANDOFF.md" "{{"; then
    warn "HANDOFF.md still has placeholders; fill current status before handoff"
  fi
  if ! has_any "HANDOFF.md" "下一步" "Next"; then
    warn "HANDOFF.md should include a next-step section"
  fi
  if ! has_any "HANDOFF.md" "当前状态" "本次已完成" "风险与待确认"; then
    warn "HANDOFF.md should include current status, completed work, and risks"
  fi
  if has_any "HANDOFF.md" "v1.5" "v2" "v3" "长期方向（3-6 个月" "中期规划（1-3 个月" "产品愿景"; then
    warn "HANDOFF.md looks too roadmap-heavy; move long-term planning to docs/PRODUCT_PLAN.md"
  fi
fi

if has_file "docs/DOCUMENTATION.md"; then
  for pattern in "README.md" "AGENTS.md" "PROJECT.md" "HANDOFF.md" "CHANGELOG.md" "SSOT"; do
    if ! contains "docs/DOCUMENTATION.md" "$pattern"; then
      warn "docs/DOCUMENTATION.md should define boundary for $pattern"
    fi
  done
  for pattern in "Required" "Recommended" "Reference Implementation" "Structure Rule"; do
    if ! contains "docs/DOCUMENTATION.md" "$pattern"; then
      warn "docs/DOCUMENTATION.md should define documentation structure contract: $pattern"
    fi
  done
  for pattern in "用途" "什么时候更新" "不要写什么"; do
    if ! contains "docs/DOCUMENTATION.md" "$pattern"; then
      warn "docs/DOCUMENTATION.md should define template guidance fields: $pattern"
    fi
  done
fi

for file in templates/project/README.md templates/project/PROJECT.md templates/project/HANDOFF.md templates/project/docs/CHANGELOG.md templates/project/docs/DECISIONS.md templates/project/docs/LESSONS.md templates/project/docs/TESTING.md templates/project/docs/PRODUCT_PLAN.md templates/project/docs/CODE_STRUCTURE.md templates/project/docs/DESIGN_STANDARDS.md templates/global/GLOBAL_USER_PREFERENCES_TEMPLATE.md templates/global/GLOBAL_USER_PROFILE_TEMPLATE.md templates/global/MEMORY_RULES.md; do
  check_guidance_header "$file"
done

if has_file "docs/PRODUCT_PLAN.md"; then
  if [ "$is_source_repo" -eq 1 ]; then
    if ! has_any "docs/PRODUCT_PLAN.md" "v1" "v1.5" "v2" "v3"; then
      warn "docs/PRODUCT_PLAN.md should define staged product roadmap (v1 / v1.5 / v2 / v3)"
    fi
    if ! has_any "docs/PRODUCT_PLAN.md" "近期规划" "当前优先级" "本阶段要做"; then
      warn "docs/PRODUCT_PLAN.md should include near-term priorities"
    fi
    if ! has_any "docs/PRODUCT_PLAN.md" "本阶段不做" "暂不"; then
      warn "docs/PRODUCT_PLAN.md should say what this stage will not do"
    fi
  else
    if ! has_any "docs/PRODUCT_PLAN.md" "当前阶段目标" "本阶段要做"; then
      warn "target project docs/PRODUCT_PLAN.md should define current stage goal and planned work"
    fi
    if ! has_any "docs/PRODUCT_PLAN.md" "本阶段不做"; then
      warn "target project docs/PRODUCT_PLAN.md should say what this stage will not do"
    fi
  fi
  if has_any "docs/PRODUCT_PLAN.md" "本次已完成" "当前阻塞" "是否可继续"; then
    warn "docs/PRODUCT_PLAN.md should not include handoff-style execution details"
  fi
fi

if has_file "PROJECT.md"; then
  if ! has_any "PROJECT.md" "当前架构" "当前进度" "当前状态"; then
    warn "PROJECT.md should describe current architecture and status"
  fi
  if ! has_any "PROJECT.md" "当前阶段" "下一步重点"; then
    warn "PROJECT.md should include current stage and next priorities"
  fi
  if has_any "PROJECT.md" "本次已完成" "当前阻塞" "是否可继续"; then
    warn "PROJECT.md should not include handoff-only status fields"
  fi
  if has_any "PROJECT.md" "v1.5" "v2" "v3" "长期方向（3-6 个月" "中期规划（1-3 个月"; then
    warn "PROJECT.md looks too roadmap-heavy; keep long-term phases in docs/PRODUCT_PLAN.md"
  fi
fi

if has_file "docs/DESIGN_STANDARDS.md"; then
  for file in docs/design/component-index.md docs/design/layout.md docs/design/tokens.md; do
    if ! has_file "$file"; then
      warn "design standards exist but missing design helper file: $file"
    fi
  done
fi

if has_file "package.json"; then
  if ! grep -q '"test"' package.json; then
    warn "package.json has no test script; add one when real code exists"
  fi
fi

if [ "$is_source_repo" -eq 1 ] && has_file "docs/TESTING.md"; then
  if ! has_any "docs/TESTING.md" "Prompt 行为测试" "产品规划偏离" "设计一致性" "代码测试"; then
    warn "docs/TESTING.md should cover prompt, product, design, and code checks"
  fi
fi

if [ "$errors" -gt 0 ]; then
  echo "Result: failed with $errors error(s), $warnings warning(s)."
  exit 1
fi

echo "Result: completed with $warnings warning(s)."
exit 0
