# 项目状态

> 用途：回答“这个项目现在是什么阶段、架构怎样、进度到哪、下一步重点是什么”。
> 什么时候更新：阶段、架构、当前进度、已知问题、下一步重点变化时。
> 不要写什么：交接流水、详细历史、面向新用户的教程、长期决策论证。

## 项目定位

- 项目名：`DevInspector`
- 一句话定位：面向本地页面的组件语义样式检查与 AI 任务生成工具。
- 当前阶段：收口期，从 DOM 样式编辑器收敛为组件语义 Inspector。

## SSOT 索引

- 当前产品状态、阶段和模块边界：以本文件为准。
- 产品文档入口、业务规则入口和落档索引：见 `docs/product/README.md`。
- 重要产品 / 交互 / 工程决策原因：见 `docs/DECISIONS.md`。
- 中长期产品方向和暂不做事项：见 `docs/PRODUCT_PLAN.md`。
- 具体组件、primitive 和 Inspector 模块交互规则：见 `docs/design/component-index.md`。
- token 命中、预设与自定义规则：见 `docs/design/tokens.md`。
- MRD、PRD、交互文档、数据字典和业务规则：见 `docs/product/*`。
- 当前交接和下一步执行事项：见 `HANDOFF.md`。

## 当前架构

- 入口层：`packages/dev-inspector/src/index.ts`、`mountDevInspector`、demo Vite 页面。
- 规则层：`packages/dev-inspector/src/config.ts` 提供 typography、container、spacing、shadow 等 token 配置；设计规则记录在 `docs/design/*`。
- 执行层：`packages/dev-inspector/src/DevInspector.tsx` 负责选中、高亮、作用范围、样式读取、live apply 和 AI 任务文本生成。
- Demo 层：`packages/demo` 直接引用 workspace source，用于本地 `127.0.0.1:8765` 验证，不再手改 dist。

## 当前产品模块

- 选择与高亮：从页面选择元素，显示当前选中对象和相同元素数量。
- 作用范围：支持“当前元素”和“相同元素”；相同元素按组件语义或 primitive 规则计算。
- 组件模式：当选中组件根节点或 UI primitive 时，默认只展示组件信息、相同元素、状态、真实变体、可编辑内容插槽、子组件入口和 AI 定位动作。
- 组件能力表：通过 `Component Capability Registry` 集中维护 Button / Icon / Badge / Card 的可编辑白名单；Card 当前支持标题、说明文按当前实例可编辑，状态标签作为子组件入口可继续选中。
- 组件命名：源码 selector、Inspector 展示名、组件属性三层分离；当前默认规则和后续外部导入规则见 `docs/design/component-index.md`。
- 外部布局：组件作为页面整体时允许调整位置和尺寸，但不混入组件卡片；采用 `位置 / 尺寸` 并列的紧凑属性表，分组名作为 X/W 上方的小灰字提示，X/Y/W/H 数值字段提供上下步进。
- 页面级容器：选中页面壳层或整页容器时不展示页面摘要或 `生成页面规格`，直接进入普通样式模块。
- 布局容器：选中重复集合或列表网格容器时只管理外层位置、尺寸、padding、gap 和对齐；里层卡片、标签和文字需要单独选中后再改。
- 普通元素样式：文字、容器、布局、阴影、间距等 DOM 级样式能力用于未识别对象或普通文本元素，不在组件识别成功后默认展示。
- 文字：支持组件化文字样式预设，也支持字号、字重、颜色自定义。
- 容器：背景、边框、粗细、线型、圆角合并为容器样式，支持预设和自定义。
- 布局：支持 X/Y 位置输入和 W/H 尺寸模式，数值字段可直接输入或用上下步进微调。
- 阴影与间距：支持 token / 自定义与 live apply；token 状态只读展示，自定义时才展开参数输入。
- 组件创建：当前只做“普通元素沉淀为组件规格”的轻量流程；入口在样式面板底部 `创建组件` 次级按钮，点击后打开面板内抽屉，先确认 `容器`，再按容器展示有限 `用途` 推荐，并联动生成组件名和使用场景，确认后作为 `组件规格` 写入 `本次修改内容`，最后统一 `发送给AI`。`归类` 是按当前元素自动识别的职责路径，例如 `页面 / 标题`、`列表 / 功能列表`，不混入全量已有组件列表，也不维护无限用途枚举；同一归类已有组件时提示 `复用已有组件 / 新建同类组件`；`可改内容` 使用自动识别的字段列表，固定封装或子组件以只读项展示。暂不做多变体、组件库浏览、加入已有组件或基于当前组件生成新组件。
- 发送给 AI：复制短结构任务文本，强调页面、元素、范围、选择器、改动和定位提示。
- 视觉层级：Inspector 面板内只保留 `发送给AI` 一个实底主按钮，选中态和次级动作不使用主按钮视觉；紫色只表达 token / 组件语义命中，自定义和硬编码值使用深色文字。
- 产品规则落档：产品文档入口看 `docs/product/README.md`；当前需求进入 `docs/product/PRD.md`；交互进入 `docs/product/INTERACTION_SPEC.md`；业务对象和字段进入 `docs/product/DATA_DICTIONARY.md`；编码、校验和状态流转进入 `docs/product/BUSINESS_RULES.md`。

## 当前进度

- 已完成：demo 引用 workspace source；文字和容器样式完成预设 / 自定义双态；负数间距输入；相同元素 primitive 规则；发送给 AI 短结构文本；组件模式默认面板第一版；Button / Icon / Badge / Card 已进入组件能力表；Card 已收敛为真实变体并支持标题/说明文内容插槽；面板主按钮视觉已收敛为单主按钮；组件命名规范已沉淀为 source selector / display name / attributes 三层；普通元素 `创建组件` 抽屉已接入本次修改篮；页面壳层已改为普通样式模块；重复集合已分流为 `布局容器`。
- 正在做：组件模式产品收口、更多组件能力补齐，以及组件创建任务文本验证。
- 尚未开始：Input / Textarea / IconButton 等组合组件的完整识别体系。

## 已知问题

- 组件能力表已覆盖 Button / Icon / Badge / Card，但更多业务组件仍需按真实类名逐步补充。
- 相同元素规则已覆盖 `svg.lucide` primitive 和 Badge 基础类聚合，但其他 primitive 仍需按真实使用逐步补充。
- 项目暂时没有 test script，`scripts/check-runtime.sh` 会提示 warning。

## 下一步重点

1. 按 `Component Capability Registry` 继续补 Input / Textarea / IconButton 等组件能力。
2. 扩展组件识别规则，覆盖更多真实业务类名和 primitive。
3. 验证 `创建组件` 抽屉生成的 `组件规格` 任务文本是否能稳定引导 AI 定位源码。
4. 抽出可导入的 naming adapter，让外部项目可以复用或映射自己的组件命名规范。
