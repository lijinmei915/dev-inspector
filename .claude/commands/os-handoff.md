---
description: Update Project OS handoff and summarize next steps.
allowed-tools: Bash(git status:*), Bash(git log:*)
---

# Project OS Handoff

Prepare a Project OS handoff summary.

## Context

- Git status: !`git status --short`
- Recent commits: !`git log --oneline -5`

## Task

Read the current Project OS state from:

- `PROJECT.md`
- `HANDOFF.md`
- `docs/CHANGELOG.md`

Then summarize:

```txt
当前做到：
已完成：
未提交改动：
风险：
下一步：
```

If files need to be updated, propose the exact updates before editing.

