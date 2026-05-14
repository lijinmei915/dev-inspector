# INIT FLOW

## Purpose

INIT is used when the user wants to start a new product, system, app, website, dashboard, page, repo, or project.

INIT does not mean directly generating code.
INIT first decides how the project should start.

中文说明：
INIT 用于启动新的软件 / 系统 / 应用 / 页面 / 项目。
它不是默认直接写代码，而是先判断启动方式。

---

## Start Modes

### 1. Prototype-first

Use when the user wants to quickly see a visual result.

中文：
先生成一个可打开、可看的原型页面。少问问题，文件尽量少。

### 2. Foundation-first

Use when the user wants a formal project foundation.

中文：
先建立项目结构、文档、规范、规则，不急着写页面。

### 3. Full setup

Use when the user wants both foundation and implementation.

中文：
先建基础，再生成页面或代码。

---

## Start Mode Decision

If the user explicitly asks for a prototype, use Prototype-first.

If the user explicitly asks for docs, rules, structure, governance, or project setup, use Foundation-first.

If the user asks for a complete runnable project, use Full setup.

If unclear, ask the Required Question.

中文说明：
用户明确要原型，就走快速原型。
用户明确要文档、结构、规范，就走项目治理。
用户明确要完整可运行项目，就走完整项目。
不明确时才问问题。

---

## Required Question

When start mode is unclear, ask:

```txt
这是一个 INIT 请求。你希望我按哪种方式开始？

1. 快速原型：先生成一个能看的页面
2. 项目治理：先建立项目结构、文档、规范
3. 完整项目：先建基础，再生成页面
```

Do not continue execution until the start mode is clear.

Do not ask about tech stack, features, database, deployment, or UI library before this question when the start mode is unclear.

中文说明：
启动方式不明确时，第一优先级是问“快速原型 / 项目治理 / 完整项目”，不是先问技术栈、功能模块、数据库或组件库。

If INIT was reached from `INSTALL / INIT`, ask this question in the same turn after installation/check is complete.

中文说明：
如果 INIT 是从 `INSTALL / INIT` 进来的，安装完成后同一轮就要接着问这个问题，不要停住。
只要启动方式还没明确，这一轮就不能结束。

---

## Prototype-first

Goal: quickly produce a visible prototype.

Rules:

- Ask as few questions as possible.
- Generate minimal files only.
- Prefer static prototype if no tech stack is specified.
- State clearly that this is a prototype, not the final project foundation.
- Do not create broad governance docs unless asked.
- If details are missing, use reasonable prototype defaults instead of asking a long questionnaire.

Output:

```txt
Start mode: Prototype-first
本次目标：先生成一个可见原型。
```

---

## Foundation-first

Goal: establish project foundation before UI/code.

Collect only what is needed:

1. 项目是什么：项目名、一句话定位、目标用户、解决的问题、线上地址
2. 当前阶段：从 0 起步、PoC、已有代码、已有线上产品
3. 近期目标：1-2 周最想落地什么、最高优先级、本阶段不做什么
4. 技术栈：框架、样式、UI 组件、后端、部署、语言、代码位置
5. 目录分层：pages、components、hooks、utils、lib、scripts 是否沿用默认结构
6. 关键决策：已经确定的技术或产品选择，以及原因
7. 已知禁区：踩过的坑、明确不要做的方向
8. 设计规则：有 UI 时确认视觉基调、组件来源、核心交互、设计禁区
9. 用户偏好：读取可访问的全局偏好，复述后确认是否需要项目覆盖；项目特殊覆盖写入 `HANDOFF.md` 或 `PROJECT.md`
10. 交接机制：确认 `PROJECT.md`、`HANDOFF.md`、changelog、memory 的维护方式

Output:

```txt
Start mode: Foundation-first
本次目标：先建立项目结构、文档和规则。
```

---

## Full setup

Goal: establish foundation first, then generate UI/code.

Process:

1. Run the Foundation-first flow.
2. Confirm the first UI/code target.
3. Route to design-system or frontend only after foundation is clear.

Output:

```txt
Start mode: Full setup
本次目标：先建基础，再生成页面或代码。
```

---

## Output Contract

Every INIT run must state:

```txt
INIT 结论：
- Start mode:
- 当前状态：
- 下一步：
```

If files were modified, list them:

```txt
本次修改：
- ...
```

If no files were modified, say:

```txt
本次仅完成 INIT 判断，没有修改文件。
```

---

## Anti-Patterns

Do NOT:

- assume Prototype-first just because the user says "build"
- force Foundation-first when the user clearly wants a prototype
- ask a long questionnaire before choosing start mode
- ask tech stack / database / UI library before start mode is clear
- generate files before the start mode is clear
- skip project-level classification
