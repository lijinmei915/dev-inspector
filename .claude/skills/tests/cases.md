# Project OS Skill Routing Cases

目标：验证 Project OS 内部 skill 的边界，不依赖外部 skill。

v1.0.0 通过标准：

```txt
7 条里至少 5 条稳定通过。
```

记录格式：

```txt
Result:
- pass / fail:
- actual:
- reason:
- patch:
```

## Case 1

Input: 我想做一个产品

Expected:
- project-setup
- CLARIFICATION

Result 2026-05-01:
- status: fail
- local rule check: pass
- actual: 想做什么产品？说说你的想法。
- reason: Did not show project-setup / CLARIFICATION, and did not ask the internal clarification split between software system and product strategy.
- patch: Strengthen project-setup metadata and clarification routing for vague product requests, or accept this as generic product clarification outside Project OS scope.

Result 2026-05-06:
- status: fail
- command: `printf '%s' '我想做一个产品' | claude -p --no-session-persistence --tools ""`
- actual: 什么产品？说说想法。
- reason: Did not enter Project OS clarification. It asked a generic product question instead of routing to `project-setup / CLARIFICATION`.
- patch: Strengthen `project-setup` metadata and `references/clarification.md` so vague product requests are handled internally by Project OS.

Result 2026-05-06 after root-rule fix:
- status: pass
- actual: Identified `CLARIFICATION` and asked whether this is a software system or product strategy.
- reason: Correctly routed vague product intent to Project OS internal clarification.

## Case 2

Input: 我想做一个后台管理系统

Expected:
- project-setup
- INIT

Result 2026-05-01:
- status: pass-with-issue
- local rule check: pass
- actual: 识别为全新的 starter pack、没有实质代码、可以从零开始；询问用途、技术偏好、数据存储、部署。
- reason: Routing is effectively project-setup / INIT and no files were generated. Issue: did not ask INIT start mode before product/tech questions.
- patch: Strengthen INIT Start Mode Gate priority if this issue repeats in Case 3.

Result 2026-05-06:
- status: fail
- command: `printf '%s' '我想做一个后台管理系统' | claude -p --no-session-persistence --tools ""`
- actual: Asked for tech stack, feature scope, and whether there is existing code.
- reason: It did not ask the required INIT start mode question before product/tech questions.
- patch: Make `INIT Start Mode Gate` the first required response for unclear INIT requests.

Result 2026-05-06 after root-rule fix:
- status: pass
- actual: Asked the INIT start mode first: 快速原型 / 项目治理 / 完整项目.
- reason: Correctly delayed tech stack and feature questions until start mode is clear.

## Case 3

Input: 我想快速做一个后台管理系统原型

Expected:
- project-setup
- INIT
- Prototype-first

Result 2026-05-01:
- status: pass-with-issue
- local rule check: pass
- actual: 询问技术栈偏好、功能模块、UI 风格、原型程度；没有直接生成文件。
- reason: User explicitly said "快速" and "原型", and the response behaved like Prototype-first scoping. Issue: did not explicitly state `Start mode: Prototype-first`, and asked 4 questions instead of a minimal prototype-first question.
- patch: Update INIT / Prototype-first guidance to require explicit `Start mode: Prototype-first` when the user says 快速 / 原型 / prototype, and keep scope questions minimal.

Result 2026-05-06:
- status: pass-with-issue
- command: `printf '%s' '我想快速做一个后台管理系统原型' | claude -p --no-session-persistence --tools ""`
- actual: Asked prototype scoping questions about stack, modules, and login.
- reason: The response followed a prototype scoping direction and did not generate files. Issue: it did not explicitly state `Start mode: Prototype-first` and asked too many questions.
- patch: Require explicit `Start mode: Prototype-first` when the user says 快速 / 原型 / prototype.

Result 2026-05-06 after root-rule fix:
- status: pass
- actual: Output `Start mode: Prototype-first` and asked prototype direction questions.
- reason: Correctly recognized explicit 快速 / 原型 intent.

## Case 4

Input: 帮我看看这个项目架构怎么样

Expected:
- project-setup
- AUDIT

Result 2026-05-01:
- status: pass-with-issue
- local rule check: pass
- actual: 输出项目架构分析，基于 git status 和 CLAUDE.md 判断当前是 AI 助手工作框架模板；未修改文件。
- reason: Behavior matches AUDIT/analyze-only. Issue: did not explicitly show project-setup / AUDIT, and `--tools ""` prevented deeper file inspection.
- patch: For audit-quality testing, rerun with read-only tools enabled; no routing patch needed yet.

Result 2026-05-06:
- status: pass-with-issue
- command: `printf '%s' '帮我看看这个项目架构怎么样' | claude -p --no-session-persistence --tools ""`
- actual: Produced a project architecture review and did not modify files.
- reason: Behavior matches AUDIT/analyze-only. Issue: output relied on limited/stale visible context because tools were disabled.
- patch: Keep as routing pass, but use read-only tools for deeper audit-quality testing.

Result 2026-05-06 after root-rule fix:
- status: pass
- actual: Produced an architecture review without modifying files.
- reason: Correctly behaved as AUDIT/analyze-only.

## Case 5

Input: 这个项目有点乱，帮我整理一下继续做

Expected:
- project-setup
- HYBRID

Result 2026-05-01:
- status: fail
- local rule check: pass
- actual: 询问“这个项目”是本地目录、Supabase 项目还是其他平台；询问“继续做”是未完成任务还是重新梳理方向。
- reason: Did not enter project-setup / HYBRID takeover. It treated current project context as ambiguous instead of defaulting to current cwd/project.
- patch: Strengthen HYBRID trigger for “这个项目 / 当前项目 / 继续做 / 整理” to assume current workspace when running inside a project directory.

Result 2026-05-06:
- status: fail
- command: `printf '%s' '这个项目有点乱，帮我整理一下继续做' | claude -p --no-session-persistence --tools ""`
- actual: Asked the user to paste `AGENTS.md`, `README.md` / `PROJECT.md`, and `docs/HANDOFF.md`.
- reason: Did not enter a HYBRID takeover flow. It did not default "这个项目" to the current workspace.
- patch: Strengthen HYBRID trigger for “这个项目 / 当前项目 / 继续做 / 整理” to assume current workspace.

Result 2026-05-06 after root-rule fix:
- status: pass
- actual: Identified HYBRID scenario for current project cleanup and continuation.
- reason: Correctly treated "这个项目" as the current workspace.

## Case 6

Input: 帮我设计 tokens 规范

Expected:
- design-system

Result 2026-05-01:
- status: pending real-run
- local rule check: pass
- actual:
- reason:
- patch:

Result 2026-05-06:
- status: fail
- command: `printf '%s' '帮我设计 tokens 规范' | claude -p --no-session-persistence --tools ""`
- actual: Asked whether tokens means Design Tokens, Auth Tokens, or LLM context tokens.
- reason: The Chinese word “设计” should make this a design-system request.
- patch: Strengthen `design-system` metadata for `设计 tokens / tokens 规范 / Design Tokens`.

Result 2026-05-06 after root-rule fix:
- status: pass
- actual: Identified `design-system` and started Design Tokens planning.
- reason: Correctly treated “设计 tokens” as Design Tokens.

## Case 7

Input: 帮我写一个登录页

Expected:
- frontend

Result 2026-05-01:
- status: pending real-run
- local rule check: pass
- actual:
- reason:
- patch:

Result 2026-05-06:
- status: pass-with-issue
- command: `printf '%s' '帮我写一个登录页' | claude -p --no-session-persistence --tools ""`
- actual: Asked for framework, login method, and styling approach.
- reason: Behavior matches a frontend page request and did not route to project-setup. Issue: it did not explicitly identify `frontend`.
- patch: Strengthen `frontend` metadata for Chinese page-generation requests if explicit skill selection is required.

Result 2026-05-06 after root-rule fix:
- status: pass-with-issue
- actual: Asked for technology stack, backend/login mode, and design style before implementation.
- reason: Behavior matches a frontend page request. Issue: it did not explicitly identify `frontend`.
- patch: If explicit skill label is required, add a frontend first-response label to `AGENTS.md`.

Result 2026-05-06 after frontend-prefix fix:
- status: pass
- actual: First line was `Skill: frontend`, then asked for technology stack, styling, and login method.
- reason: Explicitly identified the frontend route before implementation questions.

---

## Project OS Installation Entry Tests

目标：验证 Project OS 安装 / 接入 / 检查入口同时支持自然语言和 `/os`。

### Install Case 1

Input: 帮我初始化这个项目

Expected:
- INSTALL FLOW
- directory detection
- INIT if empty / near-empty
- CHECK-UPGRADE if Project OS is already installed

Result 2026-05-06:
- status: pass
- command: `claude -p "帮我初始化这个项目" --no-session-persistence --tools ""`
- actual: Detected current directory as an installed Project OS project and routed to `INSTALL / CHECK-UPGRADE`.
- reason: Correctly avoided treating an already-installed Project OS directory as normal HYBRID takeover.

### Install Case 2

Input: 这个老项目有点乱，帮我接管一下

Expected:
- INSTALL FLOW
- directory detection
- HYBRID if existing codebase

Result 2026-05-06:
- status: pass
- command: `claude -p "这个老项目有点乱，帮我接管一下" --no-session-persistence --tools ""`
- actual: Routed to `INSTALL / HYBRID` and proposed takeover steps.
- reason: Correctly treated takeover / organize / continue intent as HYBRID.

### Install Case 3

Input: /os

Expected:
- INSTALL FLOW
- directory detection
- EMPTY -> INSTALL / INIT
- EXISTING -> INSTALL / HYBRID
- INSTALLED -> INSTALL / CHECK-UPGRADE

Result 2026-05-06:
- status: pass-with-note
- command: interactive `claude`, then `/os`
- actual: Claude Code discovered the project slash command and displayed `/os` with description: "Enter Project OS install/adopt/check flow for the current directory."
- reason: Command registration is valid. Automated `-p` print mode does not expand slash commands, so execution must be hand-tested in interactive Claude Code.

### Install Case 4

Input: 帮我检查一下 Project OS 有没有缺文件

Expected:
- INSTALL FLOW
- existing Project OS check
- repair proposal if files are missing

Result 2026-05-06:
- status: pass-with-issue
- command: `claude -p "帮我检查一下 Project OS 有没有缺文件" --no-session-persistence --tools ""`
- actual: Detected installed Project OS and entered CHECK-UPGRADE mode, then reported file visibility limitations.
- reason: Route is correct. Issue: first line did not exactly print `INSTALL / CHECK-UPGRADE`, but the body classified the mode correctly.
- patch: Keep first-response prefix rule in `CLAUDE.md` / `AGENTS.md`; retest in normal interactive mode with read tools enabled if strict output format is required.

### Install Case 5

Input: 只帮我看看，不要改

Expected:
- AUDIT
- no file modification

Result 2026-05-06:
- status: pass
- command: `claude -p "只帮我看看，不要改" --no-session-persistence --tools ""`
- actual: Produced an `AUDIT` result and did not modify files.
- reason: Correctly respected inspect-only intent.

### Install Case 6

Input: 我想做一个项目

Expected:
- INIT
- ask start mode if unclear

### Install Case 7

Input: 接管这个老项目

Expected:
- HYBRID
- inspect existing project first
