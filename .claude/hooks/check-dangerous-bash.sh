#!/usr/bin/env bash
# PreToolUse — 危险 Bash 命令拦截（必选）
# 覆盖：rm -rf、git reset --hard、git push --force、DROP TABLE
# 无 bypass，每次都需要向用户说明原因并获得明确授权

inp=$(cat)
cmd=$(echo "$inp" | jq -r '.tool_input.command // empty' 2>/dev/null)

[[ -z "$cmd" ]] && exit 0

if echo "$cmd" | grep -qE '(rm -r|git reset --hard|git\s+push.*--force|DROP TABLE|drop table)'; then
  echo "⛔  危险操作被拦截：" >&2
  echo "  $cmd" >&2
  echo "请向用户说明原因，获得明确授权后再执行。" >&2
  exit 2
fi

exit 0
