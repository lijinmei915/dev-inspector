---
description: Run Project OS health check and summarize current workspace status.
allowed-tools: Bash(bash scripts/check-runtime.sh:*), Bash(git status:*)
---

# Project OS Check

Run the Project OS runtime health check and summarize the result.

## Context

- Runtime check: !`bash scripts/check-runtime.sh .`
- Git status: !`git status --short`

## Output

Respond in Chinese.

Use this format:

```txt
Project OS 体检：
- 结构校验：
- 工作区状态：
- 需要处理：
```

If the runtime check reports warnings or errors, explain what should be fixed next.

