---
description: Enter Project OS install/adopt/check flow for the current directory.
allowed-tools: Bash(find:*), Bash(git status:*), Bash(bash scripts/check-runtime.sh:*)
---

# Project OS Entry

Enter INSTALL FLOW for the current directory.

This command is an explicit shortcut and fallback entry.
It is not the only way to use Project OS.

Natural language requests such as "帮我初始化这个项目" or "帮我接管这个老项目" should also route to INSTALL FLOW automatically.

## Context

- Directory files: !`find . -maxdepth 2 -type f`
- Git status: !`git status --short`
- Runtime check: !`bash scripts/check-runtime.sh .`

## Task

Use:

```txt
.claude/skills/project-setup/references/install.md
```

Classify the current directory:

```txt
EMPTY        -> INSTALL / INIT
EXISTING     -> INSTALL / HYBRID
INSTALLED    -> INSTALL / CHECK-UPGRADE
UNKNOWN      -> INSTALL / NEEDS ACCESS
AUDIT ONLY   -> AUDIT
```

## Output

Respond in Chinese.

Use this format:

```txt
INSTALL 结论：
- Entry source: /os
- Directory state:
- Route:
- 已发现：
- 建议动作：
- 是否会修改文件：
```

Do not modify files unless the user explicitly confirms the proposed action.
