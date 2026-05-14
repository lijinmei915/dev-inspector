# AGENTS

> 用途：定义 AI 在本仓库中的运行规则、入口控制、路由契约、文档更新规则和禁止行为。
> 什么时候更新：AI 行为、路由规则、安装入口、文档更新策略或禁止行为变化时。
> 不要写什么：产品介绍、详细变更历史、当前交接流水、长期路线图。

`AGENTS.md` 是 AI 运行规则，不是项目介绍。

本项目定位为 AI Runtime / Project OS。所有助手在本仓库内工作时，优先遵守本文，再按任务需要加载其他文档。

## 系统结构

本项目分为三层：

- `project-setup`：入口与路由
- `design-system`：设计规则
- `frontend`：代码实现

当前阶段是收口期：只稳定内核，不扩功能。

## 规则优先级

1. 当前对话里用户刚刚明确说的话
2. 本文件 `AGENTS.md`
3. `PROJECT.md`、`HANDOFF.md`、仓库内相关文档
4. 工具适配文件，如 `CLAUDE.md`、`CODEX.md`、`.cursor/rules/project-os.md`
5. 全局用户偏好
6. 助手自身默认行为

冲突处理：越靠近当前任务、越具体的规则优先。

## 入口控制

- 所有项目相关请求优先进入 `project-setup`
- 其他领域能力不能直接抢入口
- Project OS 安装 / 接入 / 检查请求进入 `INSTALL FLOW`
- 如果请求涉及新项目、接管项目、结构整理、协作规则、文档收口，必须先按 `project-setup` 判断
- 模糊产品请求先走 `project-setup / CLARIFICATION`
- 不确定当前项目状态时，默认按 `HYBRID` 处理

中文说明：
`project-setup`、`design-system`、`frontend` 是 Project OS 的逻辑分层。
当前仓库把它们实现为 `.claude/skills/*`，但这是参考实现，不等于只能给 Claude 用。

## Project OS Installation Entry

Project OS 支持两种安装 / 接入入口：

```txt
自然语言识别意图 = 默认入口
/os = 显式入口 / 高级入口 / 兜底入口
```

当用户表达以下意图时，自动进入 `INSTALL FLOW`，不要要求用户必须输入 `/os`：

- 帮我初始化这个项目
- 帮我把 Project OS 装进这个项目
- 帮我接管这个老项目
- 这个项目有点乱，帮我规范一下
- 帮我检查 Project OS 有没有缺文件
- 帮我升级一下 Project OS
- 这是空目录，帮我开始
- 这是已有项目，帮我接入规范

当用户输入：

```txt
/os
```

也直接进入 `INSTALL FLOW`。

`INSTALL FLOW` 只负责判断 Project OS 如何进入当前目录，不做业务 UI，不接组件库。

中文说明：
`/os` 是当前参考实现里的显式命令入口。
如果某个工具不支持 slash commands，仍然应通过自然语言意图进入同一条 INSTALL 路由。

INSTALL 路由必须同时看用户意图和目录状态：

```txt
安装 / 初始化 / 检查 / 升级 Project OS：
- 空目录 / 近似空目录 -> INSTALL / INIT
- 已安装 Project OS -> INSTALL / CHECK-UPGRADE
- 已有代码但未安装 Project OS -> INSTALL / HYBRID

接管 / 继续 / 整理项目：
- 已有项目或已安装 Project OS -> INSTALL / HYBRID

只看不改：
- AUDIT
```

中文说明：
“帮我初始化这个项目”在已安装 Project OS 的目录里，不要误判成 HYBRID；应该先检查当前 Project OS 结构和缺口。
“帮我接管这个老项目 / 整理继续做”才进入 HYBRID。

## 路由规则

`project-setup` 负责这些模式：

- `INSTALL`：Project OS 安装 / 接入 / 检查 / 升级
- `CLARIFICATION`：模糊产品 / 想法 / 东西请求
- `INIT`：启动新软件产品、系统、应用、网站、看板、仓库
- `AUDIT`：分析项目现状，包括职责承接和缺口
- `HYBRID`：接管项目，默认模式

当前参考实现的内部流程材料放在：

- `.claude/skills/project-setup/references/install.md`
- `.claude/skills/project-setup/references/init.md`
- `.claude/skills/project-setup/references/audit.md`
- `.claude/skills/project-setup/references/hybrid.md`
- `.claude/skills/project-setup/references/clarification.md`

这些文件是内部流程材料，不是独立产品功能，也不是新的规则源头。
对非 Claude 工具，等价行为应通过 `AGENTS.md` 和 `adapters/` 适配得到。

## v1 路由契约

以下输入必须稳定分流：

| 用户输入 | 目标 |
|----------|------|
| 我想做一个产品 | `project-setup / CLARIFICATION` |
| 我想做一个后台管理系统 | `project-setup / INIT` |
| 我想快速做一个后台管理系统原型 | `project-setup / INIT / Prototype-first` |
| 帮我看看这个项目架构怎么样 | `project-setup / AUDIT` |
| 这个项目有点乱，帮我整理一下继续做 | `project-setup / HYBRID` |
| 帮我设计 tokens 规范 | `design-system` |
| 帮我写一个登录页 | `frontend` |

v1 测试输出必须先打路由前缀，再进入正文。

```txt
帮我写一个登录页
-> 第一行：Skill: frontend
```

INSTALL / AUDIT 测试同样必须先打路由前缀：

```txt
帮我检查一下 Project OS 有没有缺文件
-> INSTALL / CHECK-UPGRADE
```

```txt
只帮我看看，不要改
-> AUDIT
```

安装相关第一响应也必须稳定：

```txt
输入：帮我初始化这个项目，接入 Project OS
第一行：INSTALL / INIT
```

如果同一轮里已经完成安装，不能停在“已安装完成”。
必须继续进入 INIT，并在启动方式不明确时立刻输出：

```txt
这是一个 INIT 请求。你希望我按哪种方式开始？

1. 快速原型：先生成一个能看的页面
2. 项目治理：先建立项目结构、文档、规范
3. 完整项目：先建基础，再生成页面
```

本轮结束条件：

```txt
INIT 启动方式已经明确
```

如果 `Prototype-first / Foundation-first / Full setup` 还没明确，本轮不能结束在安装总结。

### CLARIFICATION 第一响应

用户只说“我想做一个产品 / 我有个想法 / 想做个东西”时，不要泛问“什么产品”。

必须先走内部澄清，且只问下面这一组问题，不要扩展成目标用户、平台、技术栈、已有代码：

```txt
这是一个 CLARIFICATION 请求。我先确认一下：

1. 你是想做软件系统，还是产品方案？
2. 如果是软件系统，是想快速出原型，还是先建项目基础？
```

### INIT 第一响应

用户想做新的软件、系统、应用、网站、看板时，如果没有明确启动方式，先问启动模式。

不要先问技术栈、功能范围、数据库、部署、权限、模块、用户角色或组件库。

```txt
这是一个 INIT 请求。你希望我按哪种方式开始？

1. 快速原型：先生成一个能看的页面
2. 项目治理：先建立项目结构、文档、规范
3. 完整项目：先建基础，再生成页面
```

如果用户明确说“快速 / 原型 / prototype”，直接判定：

```txt
Start mode: Prototype-first
本次目标：先生成一个可见原型。
```

之后最多问一个范围问题，不要先问技术栈、数据库、组件库。

### v1 验收输入的固定处理

这几条是 v1 收口测试用例，必须稳定输出：

```txt
输入：我想做一个产品
输出：这是一个 CLARIFICATION 请求。我先确认一下：
1. 你是想做软件系统，还是产品方案？
2. 如果是软件系统，是想快速出原型，还是先建项目基础？
```

```txt
输入：我想做一个后台管理系统
输出：这是一个 INIT 请求。你希望我按哪种方式开始？
1. 快速原型：先生成一个能看的页面
2. 项目治理：先建立项目结构、文档、规范
3. 完整项目：先建基础，再生成页面
```

```txt
输入：帮我初始化这个项目，接入 Project OS
输出第一行：INSTALL / INIT
如果已完成安装且启动方式不明确，继续输出 INIT 启动方式选择；不要停在安装总结。
```

```txt
输入：我想快速做一个后台管理系统原型
输出：Start mode: Prototype-first
本次目标：先生成一个可见原型。
```

```txt
输入：帮我写一个登录页
输出：Skill: frontend
```

### HYBRID 第一响应

用户说“这个项目 / 当前项目 / 继续做 / 整理一下”时，在项目目录里默认指当前 workspace。

不要先问这是本地项目、Supabase、Vercel、GitHub 还是其他平台。

如果没有文件读取工具：

```txt
这是一个 HYBRID 请求，但当前没有可用的文件读取工具。
请提供文件访问权限，或先贴 README.md / PROJECT.md / AGENTS.md 的内容。
```

### 领域 skill 第一响应

- “设计 tokens / tokens 规范 / UI 规范”默认是 `design-system`，不要先解释 Auth Token 或 LLM Token。
- “登录页 / 页面 / 组件 / 表单 / 表格”默认是 `frontend`，不要当成新项目初始化。
- 具体页面 / 组件请求的第一行应输出 `Skill: frontend`，方便测试和交接判断。

## 设计约束

涉及 UI 时必须经过 `design-system`。

UI 必须：

- 使用 tokens，不写死样式
- 使用布局原语，如 Page、Stack、Grid
- 使用标准组件
- 遵守已有设计规范

禁止：

- 随意设计 UI
- 跳过 tokens
- 自由发挥组件风格

## 前端约束

`frontend` 只负责实现，不负责重新设计。

实现前必须确认：

- 设计规则来自 `design-system`
- 组件边界清楚
- 交互状态完整
- 可点击元素有 hover 和 focus-visible 状态

## 语言规则

- 自动识别用户语言
- 用用户语言回答
- Scheduling / hard rules: English first, with Chinese explanation when needed
- 日常说明 / 项目文档：中文为主
- 用户交互文案：跟随用户语言
- 内部调度名、目录名、模式名使用稳定英文

原则：

```txt
English for scheduling, Chinese for cognition.
```

中文解释：调度名、模式名、硬规则用英文优先，降低歧义；项目说明和认知文档用中文为主；面向用户的产品文案跟随用户语言。

语言分层：

| 文件 / 区域 | 语言策略 |
|-------------|----------|
| `SKILL.md` | English hard rules + 中文解释 |
| `AGENTS.md` | 中英混合 |
| `README.md` | 中文 |
| `PROJECT.md` | 中文 |
| `HANDOFF.md` | 中文 |
| `references/` | 中文为主，关键约束可用英文 |

总规则：

```txt
The closer to scheduling and execution, the more English.
The closer to understanding and handoff, the more Chinese.
```

## 协作规则

- 默认短答：先结论，再方案，最后补风险
- 任何代码或文件改动前，先说方案，等用户确认后再执行
- 只做用户明确要求的事，不擅自扩展任务范围
- 发现缺失文件时，先报告缺什么和处理选项，不顺手创建
- 能基于现有文档和上下文判断的，不重复追问
- 做 review 时，先列具体问题，再说影响和建议
- 改完按“改了什么 / 为什么这样改 / 还有什么风险或待确认”汇报
- commit 后主动问“要推上去吗？”，未确认前不 push

## 文档分层

- `README.md`：给人看的入口说明
- `AGENTS.md`：给 AI 用的运行规则
- `PROJECT.md`：当前项目状态
- `HANDOFF.md`：当前交接上下文
- `docs/DOCUMENTATION.md`：文档编写规范和更新边界
- `docs/CHANGELOG.md`：结构性变更记录
- `docs/DECISIONS.md`：架构决策原因
- `docs/LESSONS.md`：错误模式和新增约束

README 不写运行规则。

AGENTS 不写产品介绍。

PROJECT 不写交接细节。

HANDOFF 不写长期路线。

CHANGELOG 不写当前状态。

adapters 不写新的规则源头。

详细文档边界和更新决策表见 `docs/DOCUMENTATION.md`。

在新建或更新任何项目文档前：

1. 先看 `docs/DOCUMENTATION.md`
2. 判断这是“当前状态 / 当前交接 / 中长期路线 / 结构变更 / 决策原因 / 错误复盘”里的哪一类
3. 如果有对应模板，优先沿用模板结构，不自己发明新格式
4. 改完后运行 `bash scripts/check-runtime.sh .`

### 文档更新规则

- 小型任务或普通交接：只更新 `HANDOFF.md`
- 当前阶段、进度、已知问题改变：更新 `PROJECT.md` + `HANDOFF.md`
- 中长期阶段路线改变：更新 `docs/PRODUCT_PLAN.md`，必要时只在 `PROJECT.md` 留短摘要
- AI 行为或路由规则改变：更新 `AGENTS.md` + tests + `HANDOFF.md`
- 安装、分发、适配层、SSOT 结构改变：更新 `docs/CHANGELOG.md`，必要时同步 `README.md` / `INSTALL.md`
- 犯错、误改、误判后新增约束：更新 `docs/LESSONS.md`
- 不要默认四个核心文档一起改

## 冲突处理

如果被其他泛化澄清流程带偏，但用户请求仍属于本项目相关工作，必须切回 `project-setup`。

如果文档之间冲突，按 SSOT 判断：

- 入口说明看 `README.md`
- AI 行为看 `AGENTS.md`
- 当前状态看 `PROJECT.md`
- 当前交接看 `HANDOFF.md`
- 文档边界看 `docs/DOCUMENTATION.md`

## 禁止行为

- 不要把 reference 当成 skill
- 不要把流程片段暴露成入口能力
- 不要在收口期增加功能
- 不要优化 UI
- 不要新增自动化
- 不要为了填满文档而编造信息

## 犯错后必须记录

任何一次触发 bug、误删、误配、误改的操作，都必须把复盘和新增约束写进 `docs/LESSONS.md`。
