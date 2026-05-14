#!/usr/bin/env bash
# PreToolUse — 保护文件写入拦截（可选，按需调整覆盖范围）
# 默认保护：memory/*、docs/*、根目录 *.md（含 CLAUDE.md、AGENTS.md）
# 解锁方式：向用户说明意图，获得确认后执行 touch /tmp/project_write_confirmed，再重试
# Token 持久到手动清理（rm /tmp/project_write_confirmed）或机器重启

inp=$(cat)
fp=$(echo "$inp" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

[[ -z "$fp" ]] && exit 0

if [[ "$fp" =~ /memory/ ]] || [[ "$fp" =~ /docs/ ]] || [[ "$fp" =~ \.md$ ]]; then
  if [ -f /tmp/project_write_confirmed ]; then
    exit 0
  else
    echo "⚠️  拦截：准备写入保护文件 → $fp" >&2
    echo "请先向用户说明要写什么、写到哪里，获得确认后执行：" >&2
    echo "  touch /tmp/project_write_confirmed" >&2
    echo "然后重试。" >&2
    exit 2
  fi
fi

exit 0
