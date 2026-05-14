# INSTALL FLOW - Project OS Installation Entry

## Purpose

Decide how Project OS should be installed, adopted, checked, repaired, or upgraded in the current directory.

This flow handles how Project OS enters a project directory.

It does not replace INIT, HYBRID, AUDIT, or CLARIFICATION.
It routes to them after determining the directory state and user intent.

中文说明：
INSTALL FLOW 负责“Project OS 怎么进入当前目录”。
它不是普通产品初始化，也不是业务开发流程。
它先判断目录状态，再决定走新项目安装、已有项目接入、检查升级，还是只审计。

---

## Entry Sources

INSTALL FLOW may be entered from:

1. Natural language intent detection
2. Explicit `/os` command

The assistant should not require the user to use `/os`.

中文说明：
普通用户可以直接说自然语言，不需要知道 `/os`。
高级用户可以用 `/os` 明确触发。
如果 AI 自动识别失败，`/os` 是兜底入口。

---

## Natural Language Intent Detection

When the user expresses intent to initialize, install, adopt, repair, check, or upgrade Project OS in the current directory, automatically route to INSTALL FLOW.

Typical expressions include:

- 帮我初始化这个项目
- 帮我把 Project OS 装进这个项目
- 帮我接管这个老项目
- 这个项目有点乱，帮我规范一下
- 帮我检查 Project OS 有没有缺文件
- 帮我升级一下 Project OS
- 这是空目录，帮我开始
- 这是已有项目，帮我接入规范
- initialize Project OS here
- adopt Project OS into this repo
- check Project OS files
- upgrade Project OS

中文说明：
只要用户表达的是“把 Project OS 接进当前目录 / 检查当前目录的 Project OS”，就进入 INSTALL。
不要要求用户必须输入 `/os`。

---

## Explicit Command Entry

When the user invokes:

```txt
/os
```

route directly to INSTALL FLOW.

The `/os` command is an explicit shortcut and fallback entry, not the only supported entry.

中文说明：
`/os` 是显式入口和高级入口，不是唯一入口。

---

## Intent Priority

Before choosing the final route, classify the user intent:

### 1. Install / initialize / check / upgrade Project OS

Examples:

- 帮我初始化这个项目
- 帮我把 Project OS 装进这个项目
- 帮我检查 Project OS 有没有缺文件
- 帮我升级一下 Project OS
- /os

Route by directory state:

```txt
EMPTY / NEAR-EMPTY -> INSTALL / INIT
INSTALLED          -> INSTALL / CHECK-UPGRADE
EXISTING           -> INSTALL / HYBRID
UNKNOWN            -> INSTALL / NEEDS ACCESS
```

中文说明：
如果用户是在说“把 Project OS 装好 / 初始化 / 检查 / 升级”，已安装目录不要误判成 HYBRID。
已经有 Project OS，就应该检查缺口或升级。

### 2. Take over / continue / organize existing work

Examples:

- 帮我接管这个老项目
- 这个项目有点乱，帮我规范一下
- 帮我整理一下继续做
- 这是已有项目，帮我接入规范

Route:

```txt
Existing or installed workspace -> INSTALL / HYBRID
```

中文说明：
如果用户是在说“接管、整理、继续做”，即使目录里已经有 Project OS，也可以进入 HYBRID。
因为用户关注的是继续推进当前项目，而不是检查 Project OS 自身是否缺文件。

### 3. Inspect only

Examples:

- 只帮我看看，不要改
- 先审计一下
- 不要生成文件
- 只检查问题

Route:

```txt
AUDIT
```

中文说明：
用户明确只看不改时，尊重 AUDIT。

---

## Directory State Detection

Before modifying files, inspect the current directory state.

Classify the directory as one of:

### 1. Empty / near-empty directory

Examples:

- no source code
- no package manager files
- no framework structure
- no existing `.claude/skills`
- only placeholder files such as `README.md`, `.gitignore`, or empty folders

Route:

```txt
Install Project OS as new project
-> INIT
```

中文说明：
空目录或近似空目录，按新项目安装 Project OS。

### 2. Existing codebase without Project OS

Examples:

- has source code
- has package manager files
- has frontend/backend framework structure
- does not have `.claude/skills`
- has no clear Project OS registry

Route:

```txt
Adopt Project OS into existing project
-> HYBRID
```

中文说明：
已有代码但没有 Project OS，按已有项目接入，不覆盖用户文件。

### 3. Existing directory with Project OS already installed

Examples:

- has `.claude/skills`
- has `.claude/skills/REGISTRY.md`
- has project-setup skill files
- has partial Project OS structure

Route:

```txt
Check current Project OS structure
-> detect missing files
-> suggest safe repair or upgrade
```

中文说明：
已经安装过 Project OS，就检查结构、缺口和升级建议。

### 4. User only asks to inspect / audit / review

Examples:

- 只帮我看看，不要改
- 先审计一下
- 不要生成文件
- 只检查问题
- review only
- audit only

Route:

```txt
AUDIT
```

中文说明：
用户明确说只看不改，就尊重 AUDIT，不进入安装写文件。

### 5. Unknown directory state

Examples:

- file-reading tools are unavailable
- current directory cannot be inspected
- workspace context is unclear

Route:

```txt
INSTALL / NEEDS ACCESS
```

中文说明：
看不了目录时，不猜、不写文件，先说明需要文件访问权限或目录结构。

---

## Safety Rule

Do not modify files until the mode is clear.

If the user intent or directory state is ambiguous, ask one short clarification question or choose the safest non-destructive path.

Default safe path:

```txt
AUDIT first, then propose next action
```

中文说明：
---

## Output Contract

The first response must show the route prefix before any long explanation.

Examples:

```txt
INSTALL / INIT
INSTALL / HYBRID
INSTALL / CHECK-UPGRADE
AUDIT
INSTALL / NEEDS ACCESS
```

中文说明：
INSTALL 相关请求第一行先打路由前缀，方便人和测试工具判断当前分流。

---

## Continuation Rule

If the route is `INSTALL / INIT`, installation is not the final stop.

After Project OS files are installed or confirmed, continue into INIT in the same turn:

1. restate that the route is `INSTALL / INIT`
2. state whether installation/check is complete
3. if start mode is unclear, immediately ask the INIT start mode question
4. do not stop at installation summary only
5. treat the turn as incomplete until the INIT start mode is clear

Required follow-up when start mode is unclear:

```txt
这是一个 INIT 请求。你希望我按哪种方式开始？

1. 快速原型：先生成一个能看的页面
2. 项目治理：先建立项目结构、文档、规范
3. 完整项目：先建基础，再生成页面
```

Do not ask about tech stack, modules, database, deployment, or UI library before this step.

中文说明：
空目录里“初始化并接入 Project OS”不是只把文件装进去就结束。
安装完成后，要在同一轮继续进入 INIT 启动方式判断。
不要停在安装总结，更不要先问技术栈和模块。
本轮结束条件不是“安装完成”，而是“INIT 启动方式已经明确”。
不确定时先审计，不直接写文件。
已有项目优先保护用户现有文件。

---

## Output Contract

Every INSTALL run must output:

```txt
INSTALL 结论：
- Entry source: Natural language / /os
- Directory state:
- Route:
- 已发现：
- 建议动作：
- 是否会修改文件：
```

If files were modified:

```txt
本次修改：
- ...
```

If no files were modified:

```txt
本次仅完成 INSTALL 判断，没有修改文件。
```

---

## Anti-Patterns

Do NOT:

- require the user to use `/os`
- expose separate `/os-init` and `/os-adopt` as required user-facing commands
- ask the user to choose new vs existing before inspecting
- overwrite existing project files without confirmation
- treat `/os` as normal product INIT
- generate business UI during INSTALL
- install component libraries during INSTALL

中文说明：
用户不需要记新项目还是老项目。
Project OS 应该自己判断。
INSTALL 只做 Project OS 安装 / 接入 / 检查，不做业务功能，不接组件库。
