---
description: Run or guide Project OS v1 routing tests.
allowed-tools: Bash(claude -p:*), Bash(bash scripts/check-runtime.sh:*)
---

# Project OS Routing Test

Validate the v1 Project OS routing cases.

## First

Run the runtime check:

- Runtime check: !`bash scripts/check-runtime.sh .`

## Then

If Claude CLI is available and logged in, run these 7 cases one by one:

```bash
printf '%s' '我想做一个产品' | claude -p --no-session-persistence --tools ""
printf '%s' '我想做一个后台管理系统' | claude -p --no-session-persistence --tools ""
printf '%s' '我想快速做一个后台管理系统原型' | claude -p --no-session-persistence --tools ""
printf '%s' '帮我看看这个项目架构怎么样' | claude -p --no-session-persistence --tools ""
printf '%s' '这个项目有点乱，帮我整理一下继续做' | claude -p --no-session-persistence --tools ""
printf '%s' '帮我设计 tokens 规范' | claude -p --no-session-persistence --tools ""
printf '%s' '帮我写一个登录页' | claude -p --no-session-persistence --tools ""
```

Expected routes are recorded in:

```txt
.claude/skills/tests/cases.md
```

## Output

Respond in Chinese.

Use this format:

```txt
Project OS 路由测试：
- Case 1:
- Case 2:
- Case 3:
- Case 4:
- Case 5:
- Case 6:
- Case 7:

结论：
- pass:
- fail:
- 需要修改：
```

If CLI testing is blocked by login or permissions, clearly say so and provide the exact command the user can run manually.

