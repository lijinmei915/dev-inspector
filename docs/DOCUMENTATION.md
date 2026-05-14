# 文档编写规范

> 用途：定义 Project OS 的文档边界、编写规范、更新规则和校验约束。
> 什么时候更新：文档分层、模板规范、SSOT 判断、文档校验规则变化时。
> 不要写什么：当前交接流水、一次性任务细节、与文档治理无关的实现过程。

本文定义 Project OS 的文档边界和更新规则。

核心原则：

```txt
只写在最该负责的地方。
不要为了同步而同步。
```

补充原则：

```txt
写给 AI 读的 Markdown，要先让它快速判断：
这份文档是干嘛的、什么时候该改、什么不该写进来。
```

---

## SSOT 原则

`SSOT` 是 Single Source of Truth，意思是“单一真实来源”。

同一类信息只放在一个主要位置，其他文档只引用或简短指向它。

如果文档冲突，按这个顺序判断：

| 问题 | SSOT |
|------|------|
| 这个项目怎么开始用 | `README.md` |
| AI 应该怎么行动 | `AGENTS.md` |
| 现在项目是什么状态 | `PROJECT.md` |
| 下一个人或 AI 怎么接手 | `HANDOFF.md` |
| 为什么做过某个架构决定 | `docs/DECISIONS.md` |
| 这次结构性改动影响了哪里 | `docs/CHANGELOG.md` |
| 犯过什么错，新增了什么约束 | `docs/LESSONS.md` |
| 怎么测试和验收 | `docs/TESTING.md`、`tests/` |

---

## 文档结构契约

Project OS 不在文档里维护完整目录树。

原因：

```txt
完整目录树容易漂移。
结构契约更稳定。
```

文档结构分为六个区域：

1. Root core docs

根目录核心文档，负责入口、规则、状态、交接。

2. docs/

长期文档，负责规范、决策、测试策略、复盘和设计参考。

3. tests/

测试材料，负责可复测 case、验收矩阵和测试记录。

4. adapters/

工具适配层，负责把通用规则翻译成 Claude / Codex / Cursor / Gemini 等工具可读取的入口文件。

5. templates/project/

安装到目标项目时使用的模板层。

这里放“发给目标项目的干净文档模板”，不放本源仓库自己的运行历史。

6. templates/global/

全局协作模板层。

这里放“跨项目长期成立”的用户偏好、用户画像、memory 维护规则模板。
不要把它们混进根目录入口，也不要当成当前项目状态文档。

### Required

Project OS 最小可用结构必须包含：

```txt
README.md
AGENTS.md
PROJECT.md
HANDOFF.md
INSTALL.md
docs/DOCUMENTATION.md
scripts/check-runtime.sh
```

缺少这些文件时，Project OS 仍可能被人读懂一部分，但不能视为完整安装。

### Recommended

推荐结构：

```txt
docs/CHANGELOG.md
docs/DECISIONS.md
docs/LESSONS.md
docs/TESTING.md
tests/
adapters/
scripts/install-project-os.sh
scripts/install-adapter.sh
```

这些文件让 Project OS 具备可分发、可验证、可回溯、可跨工具适配的能力。

### Reference Implementation

当前参考实现：

```txt
.claude/
```

`.claude/` 提供 Claude Code 的 skills、commands、hooks 和项目配置。

它是 Project OS 的一个实现版本，不是 Project OS 的唯一形态。

### Install Templates

安装到目标项目时，以下内容不应直接复制源仓库当前状态，而应使用模板：

```txt
README.md
PROJECT.md
HANDOFF.md
docs/CHANGELOG.md
docs/DECISIONS.md
docs/LESSONS.md
docs/TESTING.md
docs/PRODUCT_PLAN.md
docs/CODE_STRUCTURE.md
docs/DESIGN_STANDARDS.md
```

规则：

```txt
源仓库自己的运行记录归源仓库。
目标项目拿到的是空白或半结构化模板。
```

模板规则：

```txt
每个模板顶部都应包含：
- 用途
- 什么时候更新
- 不要写什么
```

这样即使不回看总规则，AI 和人也知道该怎么填。

### AI 友好 Markdown 规范

为了让 AI 更稳定地读取、更新和引用文档，受本规范约束的文档应尽量满足以下结构：

#### 1. 顶部先给用途说明

推荐格式：

```md
# 文档标题

> 用途：这份文档回答什么问题
> 什么时候更新：什么情况下改它
> 不要写什么：哪些内容不该写进来
```

作用：

- 让 AI 先判断“该不该往这里写”
- 让人快速理解这份文档的边界
- 降低 `PROJECT.md` / `HANDOFF.md` / `PRODUCT_PLAN.md` 串层概率

#### 2. 标题尽量稳定

优先使用固定、可复用的标题，不要频繁改名。

例如：

```txt
当前阶段
当前进度
已知问题
下一步重点
风险与待确认
```

#### 3. 多用列表，少用散文

AI 更适合读取：

- 一条一个事实
- 列表式状态
- 稳定字段

而不是混合很多层意思的长段描述。

#### 4. 一文一责

一份文档只回答一类问题。

不要在同一份文档里同时写：

- 项目介绍
- AI 运行规则
- 当前交接
- 长期路线图

#### 5. 显式写“不该写什么”

约束不仅要写“该写什么”，也要写：

```txt
不要写什么
```

这样 AI 更容易避免把错误内容写进去。

### 受本规范约束的文档

以下文档默认必须带头部说明：

```txt
README.md
AGENTS.md
PROJECT.md
HANDOFF.md
INSTALL.md
CLAUDE.md
docs/*.md
tests/*.md
examples/*.md
templates/project/*.md
templates/project/docs/*.md
templates/global/*.md
```

说明：

- `templates/*` 是强约束，必须有完整头部说明
- 根目录核心文档和 `docs/*.md` 也应有完整头部说明
- `tests/*.md` 和 `examples/*.md` 也建议用同一格式，方便 AI 理解它们是“测试材料”还是“示例材料”
- `adapters/*`、`.claude/skills/*`、`.claude/commands/*` 属于工具适配或内部实现层，可以使用更轻的说明，不强制要求完整三行头部

### 文档语言分层规则

Project OS 的文档语言不追求“全部中文”或“全部英文”，而是按职责分层。

总原则：

```txt
The closer to scheduling and execution, the more English.
The closer to understanding and handoff, the more Chinese.
```

中文解释：

```txt
越靠近调度和执行，越偏英文。
越靠近认知、说明和交接，越偏中文。
```

#### 1. 英文优先 + 中文解释

适用范围：

```txt
SKILL.md
模式名
路由名
硬规则
安装流转名
slash command 名
adapter 中的工具执行规则
```

示例：

```txt
INSTALL / INIT / HYBRID / AUDIT / CLARIFICATION
Prototype-first / Foundation-first / Full setup
CHECK-UPGRADE
```

规则：

- 稳定调度词优先保留英文
- 关键硬规则可先写英文，再补中文解释
- 不要在不同文档里把同一个模式名来回翻译

#### 2. 中文为主

适用范围：

```txt
README.md
PROJECT.md
HANDOFF.md
docs/*.md
tests/*.md
examples/*.md
templates/project/*
templates/global/*
```

规则：

- 项目说明、交接、测试说明、产品规划和模板填写说明以中文为主
- 遇到稳定术语时，直接保留英文名，不强行翻译

例如：

```txt
AGENTS.md
project-setup
design-system
frontend
INSTALL / INIT / HYBRID
```

#### 3. 中英混合

适用范围：

```txt
AGENTS.md
CLAUDE.md
adapters/*
```

规则：

- 执行规则、模式名、工具行为约束：英文优先
- 解释、维护说明、备注：中文为主

#### 4. 稳定术语保持英文

以下术语在所有文档里应尽量保持英文，不要按上下文反复改名：

```txt
INSTALL
INIT
HYBRID
AUDIT
CLARIFICATION
CHECK-UPGRADE
project-setup
design-system
frontend
Prototype-first
Foundation-first
Full setup
```

### Global Templates

全局协作和 memory 相关内容应统一放在：

```txt
templates/global/
```

当前包括：

```txt
templates/global/GLOBAL_USER_PREFERENCES_TEMPLATE.md
templates/global/GLOBAL_USER_PROFILE_TEMPLATE.md
templates/global/MEMORY_RULES.md
```

规则：

```txt
项目模板归 templates/project/
全局协作模板归 templates/global/
不要把全局模板直接放在根目录入口层
```

### Source vs Install

判断一个文件该留在源仓库、还是该复制到目标项目时，用这三类：

#### Source repo only

只属于 `project-os-starter` 源仓库自己的运行历史和治理记录：

```txt
根目录 PROJECT.md
根目录 HANDOFF.md
docs/CHANGELOG.md
docs/DECISIONS.md
docs/LESSONS.md
```

#### Install to target

安装到目标项目时，应使用模板版本生成：

```txt
templates/project/README.md
templates/project/PROJECT.md
templates/project/HANDOFF.md
templates/project/docs/*
```

#### Both

源仓库保留，同时安装到目标项目：

```txt
AGENTS.md
INSTALL.md
docs/DOCUMENTATION.md
.claude/
adapters/
scripts/
tests/
docs/design/
```

### Structure Rule

判断文档结构时，优先看契约，不看临时目录树。

```txt
Required 缺失 = 安装不完整
Recommended 缺失 = 能跑但能力不完整
Reference implementation 缺失 = 对应工具能力不可用，不代表 Project OS 核心失效
```

---

## AI 工程项目四层模型

判断一个 AI 工程项目的文件该放哪里，先看它属于哪一层。

### 1. 项目源码层

回答：

- 项目本身怎么运行
- 真实业务代码放哪里
- 配置、接口、数据、页面在哪里

典型内容：

```txt
src/
app/
components/
api/
db/
package.json
```

规则：

- 这里只放真正运行的代码和配置
- 不把 AI 规则、交接、历史变更塞进源码层

### 2. AI 规则层

回答：

- AI 进入项目后怎么判断请求
- 哪些行为允许，哪些不允许
- 不同工具怎么读取同一套规则

典型内容：

```txt
AGENTS.md
CLAUDE.md
CODEX.md
.cursor/rules/
.claude/skills/
adapters/
```

规则：

- 这里只写 AI 怎么干活
- 不把产品介绍和当前进度混进来

### 3. 产品 / 设计 / 项目认知层

回答：

- 这是什么项目
- 现在到哪了
- 产品目标和设计边界是什么

典型内容：

```txt
README.md
PROJECT.md
docs/PRODUCT_PLAN.md
docs/CODE_STRUCTURE.md
docs/DESIGN_STANDARDS.md
docs/design/
```

规则：

- 这一层帮助人和 AI 理解项目
- 不写执行规则，不写交接流水

### 4. 验收 / 变更 / 交接层

回答：

- 上一轮改了什么
- 为什么这么改
- 有哪些坑
- 下一步怎么接
- 怎么验证没有跑偏

典型内容：

```txt
HANDOFF.md
docs/CHANGELOG.md
docs/DECISIONS.md
docs/LESSONS.md
docs/TESTING.md
tests/
scripts/check-runtime.sh
```

规则：

- 这一层负责可接手、可追溯、可验证
- 不负责项目介绍和源码分层

### 一句话区分

```txt
源码层 = 项目真正跑起来的代码
AI 规则层 = 告诉 AI 怎么干活
项目认知层 = 告诉人和 AI 这是什么项目
验收交接层 = 防止改完以后接不住、查不回、测不出
```

### 用这个模型判断越层

常见越层例子：

- `PROJECT.md` 写了太多变更历史：这些应该进 `docs/CHANGELOG.md`
- `HANDOFF.md` 写了太多项目介绍：这些应该进 `README.md` 或 `PROJECT.md`
- `README.md` 写了太多 AI 路由：这些应该进 `AGENTS.md`
- adapter 写了新的通用规则：这些应该回到 `AGENTS.md`

---

## 核心文件边界

### README.md

给人看的入口说明。

回答：

- 这是什么
- 能做什么
- 怎么安装
- 怎么开始使用
- 关键文件在哪里

不要写：

- AI 运行细则
- 临时交接
- 详细历史
- 内部路由实现细节

什么时候更新：

- 安装方式变了
- 对外使用方式变了
- 目录入口变了
- 项目定位面向用户的表述变了

---

### AGENTS.md

给 AI 用的运行规则。

回答：

- AI 进入项目后先读什么
- 请求如何路由
- 哪些行为禁止
- 文档之间冲突时谁优先
- 不同工具如何理解 Project OS

不要写：

- 面向用户的长介绍
- 当前进度流水账
- 交接细节
- 每次改动的历史记录

什么时候更新：

- 路由规则变了
- AI 行为边界变了
- 文档 SSOT 规则变了
- 跨工具入口约定变了

---

### PROJECT.md

当前项目状态。

回答：

- 这个项目现在是什么阶段
- 当前架构是什么
- 已完成什么
- 已知问题是什么
- 下一阶段重点是什么

不要写：

- 上一轮对话流水
- 详细变更历史
- 给新用户的教程
- 长期决策论证

什么时候更新：

- 项目阶段变了
- 架构分层变了
- 当前进度有实质变化
- 下一步重点变了
- 已知问题发生变化

---

### HANDOFF.md

当前交接上下文。

回答：

- 上一轮或当前连续任务做了什么
- 现在能不能继续
- 当前风险是什么
- 下一步具体干什么

不要写：

- 长期路线图
- 全量历史
- 产品介绍
- 已经稳定下来的架构决策全文

什么时候更新：

- 完成一次非平凡任务后
- 多文件改动后
- 有新的风险或下一步
- 准备交给下一个 AI / 人继续时

维护规则：

- 保持当前有效，不追求永久完整
- 旧的流水信息可以合并压缩
- 不要把 `docs/CHANGELOG.md` 复制进来

### docs/PRODUCT_PLAN.md

产品路线图。

回答：

- 这个产品分几个阶段演进
- 每个阶段的目标、交付物、成功标准是什么
- 当前阶段暂时不做什么

不要写：

- 当前回合做了什么
- 上一轮具体改了哪些文件
- 临时交接和阻塞

什么时候更新：

- 产品阶段定义变了
- 中长期路线变了
- 阶段目标或成功标准变了
- 明确新增或删除一个产品阶段

---

## 快速判断：该写 PROJECT、HANDOFF 还是 PRODUCT_PLAN

看到一条信息时，先问它回答的是哪个问题：

### 写到 PROJECT.md

如果它回答的是：

```txt
这个项目现在是什么
现在到哪了
当前最重要的下一步是什么
```

典型例子：

- 当前阶段从 v1 收口变成 v1.5 分发优化
- 已知问题新增或删除
- 下一步重点从“测路由”变成“推 GitHub 验收”

### 写到 HANDOFF.md

如果它回答的是：

```txt
这轮刚做了什么
接下来谁来接、先做什么
当前有哪些风险或阻塞
```

典型例子：

- 这次补了哪些规则
- 哪个测试刚跑过，结论是什么
- 哪个点还没验完
- 下一位 AI 先别碰什么

### 写到 docs/PRODUCT_PLAN.md

如果它回答的是：

```txt
这个产品未来怎么分阶段演进
v1 之后做什么
哪些事是下一阶段，不是当前阶段
```

典型例子：

- v1 做可安装 runtime
- v1.5 做分发体验优化
- v2 做工具原生适配包
- v3 做可发现 skill / package

### 一句话判断

```txt
PROJECT.md       = 现在是什么
HANDOFF.md       = 这轮做了什么，接下来怎么接
docs/PRODUCT_PLAN.md = 以后怎么演进
```

---

## docs/ 目录边界

### docs/DOCUMENTATION.md

文档治理规则。

回答：

- 每个文档负责什么
- 什么情况下更新哪个文件
- 哪些内容不能重复写

---

### docs/DECISIONS.md

架构决策记录。

回答：

- 做了什么决定
- 放弃了什么方案
- 为什么这么选
- 影响是什么

不要写：

- 当前状态流水
- 每次小改动
- 临时 TODO

---

### docs/CHANGELOG.md

结构性变更记录。

回答：

- 这次高价值改动是什么
- 影响到哪些层
- 相关文件有哪些

不要写：

- 当前状态
- 交接下一步
- 纯文案小修
- 无结构影响的零碎记录

什么时候更新：

- 跨层改动
- 安装 / 分发方式改变
- 路由机制改变
- 文档 SSOT 结构改变
- 适配层或测试体系改变

---

### docs/LESSONS.md

错误模式和复盘。

回答：

- 犯了什么错
- 根因是什么
- 新增了什么约束

什么时候更新：

- 误删、误改、误配
- 测试策略失效
- 路由反复跑偏
- 用户明确指出“你又猜了 / 又忘了 / 又乱改了”

---

### docs/TESTING.md 与 tests/

测试策略和测试用例。

`docs/TESTING.md` 写测试方法、验收原则、测试分层。

`tests/` 写具体 case、矩阵和可复测记录。

不要把测试结果塞进 `PROJECT.md`，除非它改变了当前项目状态。

---

## 适配层边界

### adapters/

工具适配模板。

回答：

- Claude / Codex / Cursor / Gemini 等工具应该读取什么入口
- 如何把 Project OS 的通用规则翻译成工具自己的规则文件

不要写：

- 新规则源头
- 与 `AGENTS.md` 冲突的行为规则
- 工具无关的项目状态

规则：

```txt
adapters/* 只能适配 AGENTS.md，不能替代 AGENTS.md。
```

---

## 全局协作模板边界

### templates/global/GLOBAL_USER_PREFERENCES_TEMPLATE.md

记录用户的长期协作偏好。

回答：

- 怎么称呼更合适
- 喜欢什么语气和解释方式
- 默认工作方式是什么

不要写：

- 当前项目状态
- 临时任务要求
- 一次性对话结论

### templates/global/GLOBAL_USER_PROFILE_TEMPLATE.md

记录跨项目稳定成立的用户画像。

回答：

- 这个人是谁
- 理解深度如何
- 是否接受专业术语

不要写：

- 当前项目业务
- 仅在单个项目里生效的特殊限制

### templates/global/MEMORY_RULES.md

定义 memory 应该记什么、什么时候更新、怎么写简洁。

回答：

- 什么值得进长期记忆
- 什么不该写进去
- 全局和项目边界怎么分

不要写：

- 本轮笔记
- 执行流水
- 已经在项目 SSOT 文档里可直接读取的细节

---

### .claude/

Claude Code 参考实现。

回答：

- Claude Code 如何加载 Project OS
- slash commands 如何进入 Project OS
- skill reference 如何组织

不要写：

- Project OS 唯一实现假设
- 非 Claude 工具必须遵守的唯一入口

规则：

```txt
.claude/* 是 reference implementation，不是 Project OS 本体。
```

---

## 更新决策表

| 场景 | 应更新 |
|------|--------|
| 安装方式改变 | `README.md`、`INSTALL.md`、`docs/CHANGELOG.md`、`HANDOFF.md` |
| AI 路由规则改变 | `AGENTS.md`、相关 tests、`HANDOFF.md` |
| 跨工具适配改变 | `adapters/`、`README.md` 或 `INSTALL.md`、`docs/CHANGELOG.md`、`HANDOFF.md` |
| 项目阶段或下一步改变 | `PROJECT.md`、`HANDOFF.md` |
| 完成一次连续任务 | `HANDOFF.md` |
| 架构决策改变 | `docs/DECISIONS.md`、必要时 `PROJECT.md` / `AGENTS.md` |
| 犯错或测试暴露新问题 | `docs/LESSONS.md`、必要时 `AGENTS.md` 或 tests |
| 仅修正文案错别字 | 通常只改原文件，不更新 `CHANGELOG.md` |
| 新增测试 case | `tests/`，必要时 `docs/TESTING.md` |

---

## 写作风格

- 面向人看的说明：中文为主
- 调度名、模式名、目录名：稳定英文
- 规则靠近执行层时：英文硬规则优先，可加中文解释
- 每段回答一个问题
- 路径必须写准确
- 不写“未来可能会”，除非放在路线图或待确认里
- 不为了显得完整而编造当前没有的能力

---

## 反模式

不要：

- 每次改动都同时更新 README / PROJECT / HANDOFF / CHANGELOG
- 把 `PROJECT.md` 写成流水账
- 把 `HANDOFF.md` 写成永久历史
- 把 `CHANGELOG.md` 写成 TODO
- 把运行规则写进 `README.md`
- 把当前状态写进 adapter
- 在 `.claude/skills` 里定义通用规则后忘记同步到 `AGENTS.md`

---

## 大白话

```txt
README.md        = 给新用户怎么开始
AGENTS.md        = AI 应该怎么做
PROJECT.md       = 现在是什么
HANDOFF.md       = 接下来怎么接
CHANGELOG.md     = 以前为什么变
DECISIONS.md     = 为什么这么定
LESSONS.md       = 犯错后怎么避免再犯
tests/           = 怎么证明它稳定
adapters/        = 不同工具怎么读同一套规则
.claude/         = Claude Code 的参考实现
```
