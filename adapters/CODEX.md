# Codex Adapter

This file is a Codex adapter for Project OS.

`AGENTS.md` is the single source of truth. This file only translates the shared Project OS rules into Codex working behavior.

中文说明：
这是 Codex 适配文件，不是新的规则源头。
通用规则以 `AGENTS.md` 为准。

---

## Required Reading

For project-level requests:

1. Read `AGENTS.md`
2. Read `PROJECT.md` for current state
3. Read `HANDOFF.md` when continuing prior work
4. Use `scripts/check-runtime.sh .` after Project OS structure changes

中文说明：
Codex 接手项目任务时，先读规则和状态，再动文件。

---

## Project OS Routing

Before editing files, classify the request:

```txt
Project OS install/check/upgrade -> project-setup / INSTALL
vague product request -> project-setup / CLARIFICATION
new software/system/app -> project-setup / INIT
analyze only -> project-setup / AUDIT
existing/messy project takeover -> project-setup / HYBRID
design tokens / UI rules -> design-system
specific page/component implementation -> frontend
```

中文说明：
不要把“做系统 / 接管项目 / 检查结构”直接当成普通代码实现。

If the route is `INSTALL / INIT`, print that route first.
If installation completes in the same turn, continue directly into the INIT start mode question.
Do not stop at installation summary only.
The turn is only complete after the INIT start mode is clear.

---

## Codex Notes

- Prefer small, verifiable patches.
- Preserve existing user work.
- Run shell checks when available.
- Explain changed files and remaining risks after edits.

中文说明：
Codex 适合做文件修改和校验。改动要小，能测就测。
