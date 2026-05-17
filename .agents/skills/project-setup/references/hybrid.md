# HYBRID FLOW - Project Takeover Mode

## Purpose

Use HYBRID when the project is not fully new and not fully mature.

HYBRID means project takeover.

It is used when:

- the project already has some files or code
- the structure is incomplete or inconsistent
- documentation is missing
- the user wants to continue, fix, organize, or improve the project
- the project looks like a half-finished or inherited codebase

中文说明：
HYBRID 是“项目接管模式”。
适用于项目已经有一些东西，但还不完整、不规范、比较乱，需要先接管、盘点、整理，再继续推进。

---

## Core Principle

Do not rush into coding.

First understand the project, then stabilize it, then continue.

中文说明：
不要一上来就写代码。
先看清楚项目，再整理稳定，最后再继续开发。

---

## When to Use

Use HYBRID when the user says things like:

### Chinese

- 这个项目有点乱
- 帮我整理这个项目
- 帮我接着做
- 继续开发这个项目
- 这个项目做到一半了
- 帮我看看并整理一下
- 在现有项目里加功能
- 当前项目
- 这个项目
- 继续做

### English

- take over this project
- continue this project
- this project is messy
- clean up this codebase
- improve this repo
- add features to this existing project
- help me with this existing project

---

## Step 1: Project Inventory

First inspect and summarize the current project.

If the user says "这个项目", "当前项目", "继续做", or "整理一下" while the agent is running inside a workspace, assume the current workspace is the project.

Do not ask whether "this project" means local files, Supabase, Vercel, GitHub, or another platform unless there is no current workspace context.

If file-reading tools are unavailable, still classify as HYBRID and say that inspection is blocked by tool access. Ask for file access or the minimum files needed.

中文说明：
在项目目录里运行时，“这个项目 / 当前项目 / 继续做”默认指当前 workspace。
不要先把范围发散到 Supabase、Vercel、GitHub 等平台。
如果没有读文件工具，也要先声明 HYBRID，而不是回到泛澄清。

Check:

- directory structure
- existing source files
- package files
- README / docs
- config files
- design tokens / styles
- components
- pages / routes
- API or backend files
- test files
- git state if available

Output:

```txt
当前项目盘点：
1. 已存在：
2. 缺失：
3. 明显问题：
4. 风险：
5. 建议下一步：
```

---

## Step 2: Classify Project Maturity

Classify the project into one of these:

```txt
Prototype     -> 有原型或简单页面，但不完整
Scaffold      -> 有工程骨架，但业务还少
Feature-ready -> 基础完整，可以继续开发功能
Legacy-mess   -> 结构混乱，需要先治理
```

中文说明：
这个分类不是为了贴标签，而是为了决定下一步是继续开发，还是先整理治理。

---

## Step 3: Stabilize Before Building

Before adding new features, stabilize the project if needed.

Possible actions:

- clean unnecessary files
- update README
- create or update PROJECT.md
- create or update HANDOFF.md
- document project structure
- document run / build commands
- document known gaps
- organize references
- add pending-items / roadmap notes
- align AGENTS.md if needed

中文说明：
HYBRID 的重点是让项目变得“可理解、可运行、可继续”。
不是立刻堆新功能。

---

## Step 4: Decide Next Action

After inventory and stabilization, decide the next path:

- UI / tokens / visual rules -> design-system
- page / component / frontend implementation -> frontend
- API / data / backend logic -> backend
- tests / validation -> testing
- project structure / docs / governance -> stay in project-setup

中文说明：
project-setup 仍然是控制器。
只有当方向明确后，才路由到 design-system / frontend / backend / testing。

---

## Interaction Strategy

Ask as few questions as possible.

If the project can be inspected, inspect first.

Only ask when necessary:

```txt
这是一个 HYBRID 请求。我会先接管并盘点当前项目。你希望我优先关注哪一块？

1. 项目结构和文档
2. 前端页面和组件
3. 设计规范 / tokens
4. 接口和数据结构
5. 全部整体梳理（推荐）
```

If tools are unavailable:

```txt
这是一个 HYBRID 请求，但当前没有可用的文件读取工具。
请提供文件访问权限，或先贴 README.md / PROJECT.md / AGENTS.md 的内容。
```

Legacy wording:

```txt
我会先接管并盘点这个项目。你希望我优先关注哪一块？

1. 项目结构和文档
2. 前端页面和组件
3. 设计规范 / tokens
4. 接口和数据结构
5. 全部整体梳理（推荐）
```

English version:

```txt
I'll first take over and assess this project. What should I prioritize?

1. Structure and documentation
2. Frontend pages and components
3. Design system / tokens
4. APIs and data model
5. Full cleanup (recommended)
```

---

## Output Contract

Every HYBRID run must output:

```txt
接管结论：
- 当前状态：
- 项目成熟度：
- 主要问题：
- 已完成整理：
- 建议下一步：
```

If no files were modified, say clearly:

```txt
本次仅完成盘点，没有修改文件。
```

If files were modified, list them:

```txt
本次修改：
- README.md
- PROJECT.md
- ...
```

---

## Hard Rules

- MUST inspect before large changes.
- MUST NOT start large refactoring before inventory.
- MUST NOT generate unrelated UI or code.
- MUST keep project-setup as controller.
- MUST prefer small, safe changes.
- MUST explain what was changed and why.
- MUST preserve existing user work.

中文说明：
HYBRID 模式下，不能直接大改。
必须先盘点，再做小步整理。
任何修改都要说明改了什么、为什么改。

---

## Anti-Patterns

Do NOT:

- rewrite the whole project immediately
- delete files without reason
- generate a new app on top of an existing one
- ignore existing structure
- treat "这个项目" as ambiguous when a current workspace exists
- skip documentation
- bypass project-setup
- jump directly into frontend implementation

---

## Correct Example

User:
这个项目有点乱，帮我整理一下继续做。

Correct behavior:

1. Inspect files
2. Summarize current structure
3. Identify missing docs / config / rules
4. Make small stabilizing changes
5. Suggest next step

Incorrect behavior:
直接生成一个新后台系统，覆盖当前项目。
