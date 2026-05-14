# Cursor Adapter

This file is a Cursor adapter for Project OS.

`AGENTS.md` is the single source of truth. This file should be installed into Cursor rules, usually:

```txt
.cursor/rules/project-os.md
```

中文说明：
这是 Cursor 适配文件，应写入 `.cursor/rules/project-os.md`。

---

## Cursor Rule

Always follow `AGENTS.md` first.

For project-level requests, route before coding:

```txt
Project OS install/check/upgrade -> project-setup / INSTALL
vague product request -> project-setup / CLARIFICATION
new software/system/app -> project-setup / INIT
analyze only -> project-setup / AUDIT
existing/messy project takeover -> project-setup / HYBRID
design tokens / UI rules -> design-system
specific page/component implementation -> frontend
```

Do not generate unrelated UI or code before route classification.
If the route is `INSTALL / INIT`, print that route first and continue into INIT start mode selection after installation/check completes.

中文说明：
Cursor 里也要先分流，再写代码。
`AGENTS.md` 是总规则。
