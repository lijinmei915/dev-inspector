---
name: project-setup
description: >
  Primary entry skill for project-level software work.
  Use this skill whenever the user expresses intent to create, build, start,
  set up, continue, review, improve, or take over any software product,
  system, app, website, dashboard, repo, or codebase.
  Also use this skill for vague product requests such as "我想做一个产品" and
  route them to CLARIFICATION before execution.
  When the user invokes /os or naturally asks to initialize, install, adopt,
  repair, check, or upgrade Project OS in the current directory, route to
  INSTALL before INIT, HYBRID, AUDIT, or CLARIFICATION.
  This skill classifies the request into INIT, AUDIT, or HYBRID before any code,
  UI, or file generation.
  For unclear INIT requests, ask the INIT start mode question before asking
  about tech stack, features, database, deployment, or UI library.
---

# project-setup

## Role

Primary entry skill for project-related requests.

This skill controls Project OS install/adoption, project setup, project audit, and project takeover workflows.

中文说明：
这是项目相关请求的主入口，负责判断用户是在安装 Project OS、初始化项目、审计项目，还是接管已有项目。

---

## Priority

Project-related requests MUST go through this skill first.

If the user wants to build, create, set up, review, improve, audit, or take over a project, use project-setup before any domain skill.

中文说明：
只要用户的请求和“项目”有关，都必须先进入 `project-setup`，不要直接跳到 `frontend`、`design-system` 或其他领域 skill。

---

## Project-Level Gate

Any request to create, build, start, set up, continue, review, improve, or take over software work is project-level.

Project-level requests MUST be classified before execution.

Classification:

- INSTALL: install / adopt / check / upgrade Project OS in current directory
- CLARIFICATION: vague product / idea / thing request
- INIT: new software product / system / app / website / dashboard / repo
- AUDIT: analyze only
- HYBRID: existing or messy project takeover

中文说明：
只要用户是在表达“我要做一个软件、系统、产品或项目”，不管他说后台、CRM、看板、网站，都先当成项目级请求。
项目级请求必须先分类，再执行。
如果用户只说“产品”“想法”“东西”，先走内部澄清流程，不依赖外部 skill。

---

## Project OS Installation Entry

Project OS can enter the installation flow through either natural language intent detection or the explicit `/os` command.

The assistant MUST NOT require the user to use `/os`.

### Entry Methods

#### 1. Natural language intent detection

When the user expresses intent to initialize, install, adopt, repair, check, or upgrade Project OS in the current directory, automatically route to `references/install.md`.

Typical expressions include:

- 帮我初始化这个项目
- 帮我把 Project OS 装进这个项目
- 帮我接管这个老项目
- 这个项目有点乱，帮我规范一下
- 帮我检查 Project OS 有没有缺文件
- 帮我升级一下 Project OS
- 这是空目录，帮我开始
- 这是已有项目，帮我接入规范

#### 2. Explicit command entry

When the user invokes:

```txt
/os
```

route directly to `references/install.md`.

The `/os` command is an explicit shortcut and fallback entry, not the only supported entry.

中文说明：
Project OS 支持两种入口：
普通用户直接说自然语言，高级用户可以输入 `/os`。
`/os` 是显式入口和兜底入口，不是唯一入口。

### Install routing

MUST route to INSTALL before INIT / HYBRID / AUDIT / CLARIFICATION.

INSTALL means Project OS distribution into a workspace.
It must inspect the directory and combine directory state with user intent:

```txt
Install / initialize / check / upgrade intent:
- EMPTY / NEAR-EMPTY -> INSTALL / INIT
- INSTALLED          -> INSTALL / CHECK-UPGRADE
- EXISTING           -> INSTALL / HYBRID
- UNKNOWN            -> INSTALL / NEEDS ACCESS

Take over / continue / organize intent:
- EXISTING or INSTALLED -> INSTALL / HYBRID

Inspect-only intent:
- AUDIT
```

中文说明：
INSTALL 不是普通项目需求，而是 Project OS 自己的安装 / 接入 / 检查入口。
它先判断用户是在安装检查 Project OS，还是接管继续做项目，再结合当前目录状态决定下一步。

If the route is `INSTALL / INIT`, the FIRST response must reveal that route.
If installation is performed in the same turn, do not stop after installation summary.
Continue directly into INIT and ask or decide the start mode before any UI/code generation.

中文说明：
如果判断结果是 `INSTALL / INIT`，第一响应必须显式写出这个路由。
如果这一轮已经完成安装，不要停在“安装好了”。
要继续进入 INIT，并在启动方式不明确时立刻问启动模式。

---

## Modes

This skill has three modes:

### INSTALL

Use INSTALL when the user invokes `/os` or asks to install, adopt, check, or upgrade Project OS in the current directory.

INSTALL means Project OS distribution and adoption.

中文说明：
INSTALL 是 Project OS 的分发和接入流程，不是普通产品初始化。

### INIT

Use INIT when the user wants to start or set up a project.

INIT means starting new software work. It may be prototype-first, foundation-first, or full setup.

中文说明：
INIT 是启动新的软件工作，不等于永远禁止生成页面。
需要先判断启动方式：快速原型、项目治理，还是完整项目。

### AUDIT

Use AUDIT when the user only wants to review or analyze an existing project.

AUDIT means analyze only. Do not modify files unless the user explicitly asks.

中文说明：
AUDIT 是“帮我看看”，只分析，不主动改项目。

### HYBRID

Use HYBRID when the project already has some files but is incomplete, messy, or needs continued work.

HYBRID means project takeover.

中文说明：
HYBRID 是“接管项目”，先盘点、整理、稳定，再继续推进。
如果不确定，默认使用 HYBRID。

---

## Hard Rules

- DO NOT let frontend act as the first responder for project-level requests.
- DO NOT route `/os` to normal INIT before INSTALL classification.
- DO NOT skip project state detection.
- MUST decide INSTALL / INIT / AUDIT / HYBRID before taking action.
- MUST decide INIT start mode before UI, code, or file generation.
- MUST continue from INSTALL / INIT into INIT start mode selection when the user is asking to initialize/start the project.
- MUST ask at most 2-3 questions when clarification is needed.
- MUST prefer HYBRID when unsure.

中文说明：
项目级请求不能跳过分类直接写页面或代码。
必须先判断项目状态，再决定走 `INSTALL` / `INIT` / `AUDIT` / `HYBRID`。
如果是 INIT，还要先明确启动方式。
如果是 `INSTALL / INIT`，安装不是终点，还要继续进入 INIT。
不确定时默认 `HYBRID`。

---

## INIT Start Mode Gate

For INIT requests, after detecting project state, MUST ask or decide the start mode before execution.

If the user did not clearly request a prototype, foundation, or full setup, the FIRST response after classification MUST be:

```txt
这是一个 INIT 请求。你希望我按哪种方式开始？

1. 快速原型：先生成一个能看的页面
2. 项目治理：先建立项目结构、文档、规范
3. 完整项目：先建基础，再生成页面
```

Do not ask about tech stack, features, database, deployment, or UI library before this start mode is clear.
Do not ask about business modules, permissions, users, or roles before this start mode is clear.

Start modes:

1. Prototype-first: generate a visible prototype first
2. Foundation-first: establish project structure, docs, and rules first
3. Full setup: establish foundation first, then generate UI/code

Do not generate files or code until the INIT start mode is clear.

中文说明：
INIT 阶段必须先确认启动方式。不能一上来直接问技术栈、功能范围、数据库、部署或组件库，更不能直接写代码或生成页面。

---

## Routing

After mode detection:

- INSTALL -> read `references/install.md`
- INIT -> read `references/init.md`
- AUDIT -> read `references/audit.md`
- HYBRID -> read `references/hybrid.md`
- CLARIFICATION -> read `references/clarification.md`

If a reference file does not exist yet, explain that the workflow is not implemented and use the mode rules in this file as fallback.

中文说明：
具体流程放到 `references/` 里。
`SKILL.md` 只负责入口、判断和路由，不承载所有细节。

---

## Domain Routing

If the request becomes domain-specific:

- design / UI / tokens -> `design-system`
- pages / components / frontend implementation -> `frontend`
- API / database / service -> `backend`
- tests / coverage -> `testing`

But project-setup remains the controller.

中文说明：
`project-setup` 是控制器。
其他 skill 是被调用的领域能力，不应该抢入口。

---

## Interaction Rules

- Respond in the same language as the user.
- Keep questions minimal.
- Prefer action over long explanation.
- Do not over-design the workflow.
- Do not create new skills unless explicitly needed.

中文说明：
用户用中文，就用中文回答。
不要问太多问题，不要过度设计，不要随便扩展新 skill。

---

## Expected Behavior

Example:

User:
我想做一个后台管理系统

Correct response:
这是一个 `INIT` 请求，先询问启动方式：快速原型、项目治理，还是完整项目。

Incorrect response:
不声明模式，直接问技术栈 / 功能范围 / 数据库 / 权限 / 用户角色，或直接生成完整后台页面。

User:
我想快速做一个后台管理系统原型

Correct response:
`Start mode: Prototype-first`，先生成一个可见原型。

Incorrect response:
先问 React / Vue、Supabase、UI 库或完整业务模块清单。

---

## Anti-Conflict Rule

If another generic skill or clarification flow is selected, but the user request is project-related:

Use project-setup instead.

中文说明：
如果被泛化澄清流程带偏，但请求明显是项目相关，要切回 `project-setup`。
