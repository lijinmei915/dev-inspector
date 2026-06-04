# PRD

> 用途：记录当前产品需求、功能边界、模块范围和验收入口。
> 什么时候更新：当前版本需求、模块职责、功能边界或验收标准变化时。
> 不要写什么：市场分析、长期路线图、字段级编码规则、一次性实现流水。

## 当前版本目标

- 收口组件语义 Inspector 内核。
- 稳定组件识别、相同元素规则、组件能力白名单、命名规范和 AI 任务文本。
- 默认规则先服务当前 demo 和本地 workspace；外部 adapter 方向只归档，不进入当前阶段实现。

## 功能模块

| 模块 | 功能边界 | 详细规则 | 数据源 | 状态 |
|------|----------|----------|--------|------|
| 选择与高亮 | 从页面选择元素，显示当前选中对象和相同元素数量 | `INTERACTION_SPEC.md`、`../design/component-index.md` | 当前 demo / `PROJECT.md` | 已登记 |
| 作用范围 | 当前元素 / 相同元素切换，相同元素按组件或 primitive 规则计算 | `INTERACTION_SPEC.md`、`../design/component-index.md` | 当前 demo / 已确认交互 | 已登记 |
| 组件模式 | 展示组件语义能力、内容插槽、子组件入口和外部布局 | `INTERACTION_SPEC.md`、`../design/component-index.md` | `Component Capability Registry` | 已登记 |
| 页面级容器样式 | 识别页面壳层 / 整页容器，但不展示页面摘要，直接进入普通样式模块 | `INTERACTION_SPEC.md`、`../design/component-index.md` | 当前 demo / 用户确认交互 | 已登记 |
| 布局容器 | 识别重复集合 / 列表网格容器，默认只调整外层位置、尺寸、padding、gap 和对齐 | `INTERACTION_SPEC.md`、`../design/component-index.md` | 当前 demo / 用户确认交互 | 已登记 |
| 普通元素样式 | 文字、容器、布局、阴影、间距等元素级样式能力 | `INTERACTION_SPEC.md`、`../design/tokens.md` | 当前 demo / 已确认交互 | 已登记 |
| 本次修改内容 | 跨对象保留未发送草稿，支持对象删除和属性级重置 | `INTERACTION_SPEC.md` | 当前 demo / 已确认交互 | 已登记 |
| 发送给 AI | 复制结构化任务文本，包含页面、元素、范围、选择器、组件规格 / 样式改动和定位提示 | `INTERACTION_SPEC.md`、`../../PROJECT.md` | 当前实现 / 已确认文案结构 | 已登记 |

## 本阶段不做

- 不要求外部项目必须改成 DevInspector 的源码 class 命名。
- 不把 DevInspector 做成完整组件库或设计系统管理后台。
- 不在组件识别还没稳定前批量扩很多组件类型。
- 不做 `dev-inspector.config.ts` / JSON 外部 adapter 导入。
- 不做 workspace-aware 源码扫描来推断完整组件变体。

## 验收入口

- 运行时检查：`bash scripts/check-runtime.sh .`
- 类型检查：`npm run typecheck`
- demo 构建：`npm run build:demo`
- 当前 demo 页面：`http://127.0.0.1:8765/`
- 页面级容器验收：选中 `demo-shell` / 页面壳层时，面板显示 `页面样式`，不展示页面区块摘要、页面布局摘要或 `生成页面规格`，直接显示普通样式模块。
- 布局容器验收：选中 `task-grid` / 重复集合容器时，面板显示 `布局样式`，不显示 `创建组件`，默认只管理同类子项入口和整体布局调整。

## 待补充

- Input / Textarea / IconButton 的组件能力
- 更多业务组件和 primitive 的识别规则
- `发送给AI` 任务文本的最终验收样例
