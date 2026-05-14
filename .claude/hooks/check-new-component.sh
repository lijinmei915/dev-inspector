#!/usr/bin/env bash
# PostToolUse — 新组件文件检测，提示生成设计文档
# 前提：.claude/project.json 里 preview_page 有值且不是 pending/空
# 无预览页 → 静默跳过，不打扰用户

inp=$(cat)
fp=$(echo "$inp" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

[[ -z "$fp" ]] && exit 0

# 只关心 src/components/ 下的组件文件
if ! echo "$fp" | grep -qE 'src/components/.*\.(tsx|jsx|vue|svelte)$'; then
  exit 0
fi

# 读取预览页配置
config=".claude/project.json"
preview=""
if [ -f "$config" ]; then
  preview=$(jq -r '.preview_page // empty' "$config" 2>/dev/null)
fi

# 没有配置预览页 → 静默跳过
[[ -z "$preview" || "$preview" == "pending" ]] && exit 0

# 提取组件文件名
component=$(basename "$fp")

echo "🧩 检测到组件文件 \`$component\` 已更新。" >&2
echo "需要帮你生成设计文档并同步预览页吗？告诉我「帮我写这个组件的文档」就可以。" >&2

exit 0
