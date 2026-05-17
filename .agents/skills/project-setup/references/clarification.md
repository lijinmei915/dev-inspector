# CLARIFICATION FLOW

## Purpose

Use this reference when the user expresses a vague product or project intent.

Examples:

- 我想做一个产品
- 我有个产品想法
- 我想做个东西
- 帮我规划一个产品
- I want to build a product
- I have an idea

中文说明：
当用户只说“产品”“想法”“东西”，但没有明确是软件系统、产品方案、页面原型还是代码实现时，先用本流程澄清。

---

## Principle

Do not depend on external clarification skills.

Project OS handles minimal clarification internally.

中文说明：
不要依赖外部澄清 skill。
Project OS 自己完成最小澄清。

---

## Required Question

For vague product requests, the first response MUST identify this as CLARIFICATION and ask one short clarification:

```txt
这是一个模糊产品请求。我先确认一下：

1. 你是想做软件系统，还是产品方案？
2. 如果是软件系统，是想快速出原型，还是先建项目基础？
```

English version:

```txt
This is a broad product request. Let me clarify:

1. Do you mean a software system or a product strategy?
2. If it is software, do you want a quick prototype or project foundation first?
```

---

## Routing After Clarification

- Software system / app / website / dashboard / page -> INIT
- Existing project / repo / codebase -> HYBRID
- Review / analyze only -> AUDIT
- Product strategy only -> stay in project-setup and produce planning output, without generating code

中文说明：
澄清后再进入 INIT / HYBRID / AUDIT。
如果只是产品方案，不生成代码，仍留在 project-setup 输出规划。

---

## Hard Rules

- MUST ask at most one clarification question.
- MUST include `CLARIFICATION` intent in the response when possible.
- MUST NOT generate files before intent is clear.
- MUST NOT route to frontend before software intent is confirmed.
- MUST NOT assume every product request is software.

## Anti-Patterns

Do NOT answer vague product requests with only:

```txt
什么产品？说说想法。
```

中文说明：
这种回答太泛，会绕过 Project OS 的内部澄清分流。
