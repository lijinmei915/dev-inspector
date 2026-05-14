#!/usr/bin/env bash
# PostToolUse — showcase ↔ docs/design 同步提醒（可选，仅 UI 项目）
# 使用方式：把 {{SHOWCASE_FILE}} 替换成项目真实的 showcase 组件路径
# 无 showcase 的项目：直接删除本文件，并在 settings.local.json 里移除对应 hook

inp=$(cat)
fp=$(echo "$inp" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

[[ -z "$fp" ]] && exit 0

# 替换 {{SHOWCASE_FILE}} 为真实路径，如 DesignShowcasePage.tsx
if [[ "$fp" =~ {{SHOWCASE_FILE}} ]]; then
  echo "📐 已编辑 showcase — 请确认 docs/design/ 对应文档是否需要同步更新（1:1 对应原则）" >&2
fi

if [[ "$fp" =~ /docs/design/.*\.md$ ]]; then
  echo "📐 已编辑设计文档 — 请确认 showcase 对应 section 是否需要同步更新（1:1 对应原则）" >&2
fi

exit 0
