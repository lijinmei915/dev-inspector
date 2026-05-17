---
name: frontend
description: >
  Internal Project OS skill for frontend page and component implementation.
  Use this skill for concrete UI implementation requests such as "帮我写一个登录页",
  "生成登录页", "做一个页面", "写一个组件", page, screen, form, table, or component.
  Broad project-level software requests still go through project-setup first.
  If design constraints are missing, ask only the minimum needed or use simple defaults.
---

# frontend

## Role

Frontend implementation for Project OS.

中文说明：
负责页面和组件实现。

## Boundary

For broad project-level requests, use this skill only after:

1. `project-setup` has classified the request.
2. Design constraints are clear when UI is involved.

For a concrete standalone page or component request, this skill may respond directly.

Do not act as the first responder for broad project requests.

中文说明：
不要抢项目入口。只有项目级意图和设计边界清楚后，才进入实现。

## Current Status

Placeholder skill for v1 routing stability.

Do not connect Radix, shadcn, or ai-components yet.

## Expected Behavior

User:
帮我写一个登录页

Correct response:
First line:

```txt
Skill: frontend
```

Then confirm or use minimal technology and styling defaults before implementing the login page.

中文说明：
具体页面 / 组件请求必须先显式标记 `Skill: frontend`，方便测试判断没有误进 `project-setup`。

Incorrect response:
切到 project-setup，或把单页请求当成新项目初始化。
