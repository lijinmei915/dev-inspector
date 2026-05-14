# Gemini Adapter

This file is a Gemini adapter for Project OS.

`AGENTS.md` is the single source of truth. This file only translates the shared Project OS rules into Gemini-friendly guidance.

中文说明：
这是 Gemini 适配文件，不是新的规则源头。

---

## Required Reading

For project-level work:

1. Read `AGENTS.md`
2. Read `PROJECT.md`
3. Read `HANDOFF.md` if continuing existing work

中文说明：
Gemini 进入项目任务时，先读通用规则和当前状态。

---

## Routing

Classify before execution:

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
不要跳过 Project OS 路由直接生成业务代码。
如果是 `INSTALL / INIT`，先明确打印这个路由；安装结束后同一轮继续进入 INIT 启动方式选择。
