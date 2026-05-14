---
name: design-system
description: >
  Internal Project OS skill for design rules, Design Tokens, layout constraints,
  and UI system guidance. Use this skill for Chinese requests such as
  "帮我设计 tokens 规范", "设计 tokens", "tokens 规范", "设计规范",
  "UI 规范", or "组件规范" when the task is about visual or design-system
  tokens. Do not treat "设计 tokens" as auth tokens or LLM context tokens.
  Broad project requests still go through project-setup first.
---

# design-system

## Role

Design rules and visual system guidance for Project OS.

中文说明：
负责设计规则、tokens、布局约束和 UI 规范。

## Boundary

Use this skill after `project-setup` has clarified the project-level intent.

Use this skill directly when the request is clearly about design rules, Design Tokens, UI standards, layout rules, or component standards.

Do not act as the first responder for broad project requests.

中文说明：
不要抢项目入口。只有当任务明确进入设计规范、tokens、布局或 UI 规则时才使用。

## Current Status

Placeholder skill for v1 routing stability.

Do not add component library implementation yet.

## Expected Behavior

User:
帮我设计 tokens 规范

Correct response:
进入 `design-system`，按 Design Tokens 处理颜色、字号、间距、圆角、阴影、层级等规范。

Incorrect response:
先问 tokens 是 Auth Tokens、LLM Tokens 还是 Design Tokens。
