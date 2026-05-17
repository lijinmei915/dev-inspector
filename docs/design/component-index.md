# 组件与交互索引

> 用途：记录 DevInspector 当前识别到的组件 / primitive / Inspector 模块交互规则。
> 什么时候更新：新增组件类型、相同元素规则、可编辑白名单或模块交互规则变化时。
> 不要写什么：产品阶段规划、决策原因全文、一次性实现流水。

SSOT：

- 当前产品状态和阶段目标：`../../PROJECT.md`
- 产品文档和业务规则入口：`../product/README.md`
- 为什么采用某个交互决策：`../DECISIONS.md`
- token 命中、预设与自定义规则：`tokens.md`
- 本文件只写“具体组件或模块怎么交互”。

## 当前状态

- 尚未接入 Radix / shadcn / ai-components
- 尚未建立 `src/components`
- 已开始沉淀 DevInspector 自身的组件语义和 primitive 交互规则
- Inspector 内部已建立 `Component Capability Registry`，用于集中描述组件识别后的可编辑白名单

## 组件分层

| 层级 | 说明 |
|------|------|
| Primitive | 基础 UI 原语或跨组件元素，如 Button、Input、Icon |
| Component | 具备业务/语义类名的可复用组件，如 task-card、status-badge |
| Pattern | 业务组合与交互规则，如 SearchBar、DataTable、FormSection |
| Page | 页面级编排，不提前抽复用 |

## Inspector 模块交互

| 模块 | 默认展示 | 高级 / 自定义 | 规则来源 |
|------|----------|---------------|----------|
| 选择与高亮 | 当前选中对象、相同元素数量 | 可切换父层 / 子层 | `PROJECT.md` 当前产品模块 |
| 作用范围 | 当前元素 / 相同元素 | 相同元素按组件或 primitive 规则计算 | 本文件“相同元素规则” |
| 组件模式 | 组件名、状态、真实变体、可编辑内容插槽、子组件入口、AI 动作 | 外部布局独立展示 | `../DECISIONS.md` |
| 文字 | 组件文字样式预设 | 字号、字重、颜色自定义 | `tokens.md` |
| 容器 | 容器样式预设 | 背景、边框色、粗细、线型、圆角 | `tokens.md` |
| 布局 | 组件外部布局或普通元素布局 | 位置、尺寸模式 | `../DECISIONS.md` |
| 阴影 / 间距 | 普通元素样式模块 | 阴影和间距采用紧凑 token 栏；自定义时展开参数并 live apply | `tokens.md` |
| 发送给 AI | 页面、元素、范围、选择器、改动、定位提示 | 结合备注输出补充说明 | `PROJECT.md` 当前产品模块 |

## 视觉层级规则

- 每个 Inspector 面板只保留一个实底主按钮：底部 `发送给AI`。
- 当前值、选中态、分段控件、tab 和展开入口使用浅紫底、紫色文字、描边或标记，不使用实底反白。
- 紫色只表达 token / 组件语义命中；`自定义` 和硬编码值使用深色文字，不用紫色。
- `复制定位`、`复制样式` 等都是次级动作，不使用主按钮视觉。
- 弹窗内也遵守同一规则：确认提交类按钮可使用实底主按钮，tab / 选项选中态不用实底主按钮。
- 组件卡片默认只展示组件语义名、变体、状态和组件能力；类型层级、相同元素计数、selector 属于调试信息，不默认展示。
- 组件语义名按“类型-对象”展示，例如源 class `.task-card` 在面板中显示为 `card-task`；真实 selector 仍通过 `复制定位` 使用。
- 组件识别成功后，不默认展示 `高级元素样式`；组件内部只通过 capability 白名单暴露变体、状态、内容插槽或子组件入口。
- 普通 DOM / 未识别对象才展示文字、容器、布局、阴影、间距等元素级样式模块。

## 组件命名规范

组件命名分三层，不混在一起：

| 层 | 说明 | 示例 |
|----|------|------|
| Source selector | 页面真实 class / attribute，保留项目原始写法 | `.task-card`、`.ghost-button`、`[data-component="TaskCard"]` |
| Inspector display name | DevInspector 归一化后的语义名，用于面板和 AI 任务 | `card-task`、`button` |
| Component attributes | 变体、状态、尺寸、色调等组件属性，不进入组件名 | `variant: ghost`、`state: selected`、`size: M` |

推荐源码命名：

- 业务组件使用“对象-类型”：`.task-card`、`.status-badge`、`.search-input`、`.user-avatar`。
- 通用组件变体优先作为 modifier 或属性表达：`.button--primary`、`data-variant="ghost"`。
- 已存在的历史写法也要识别：`.ghost-button`、`.primary-btn`、`.btn-secondary`。
- 状态使用 `is-*`、`has-*`、`state-*` 或 `--selected`、`--open`、`--disabled` 等状态修饰，不参与组件命名。
- 语义色调、尺寸等属性不参与组件命名，进入对应 capability。
- 组件卡片只展示组件定义允许的变体 / 属性；不在组件卡片里新增背景、边框、内边距、阴影等样式细节。
- 组件内部内容按插槽开放：标题、说明文等组件定义为可编辑的内容可以改；内容插槽默认只作用当前组件实例，不跟随 `相同元素` 批量改文案。
- 状态标签、图标、按钮等嵌套组件不在父组件里直接改；父组件只提供子组件入口，点击后选中对应子组件，再进入它自己的 capability 面板。
- 组件作为页面里的整体时，可以在组件卡片外调整外部布局，例如位置和尺寸。
- 外部布局采用紧凑属性表：`位置` 和 `尺寸` 并列排布；分组名只作为 X/W 上方的小灰字提示，不占左侧标题列；位置用 X/Y 纵向输入行，尺寸用 W/H 纵向输入行与模式选择；X/Y/W/H 等数值字段都提供上下步进；不再使用方向键簇或两张大卡片。

Inspector 展示名规则：

| Source selector | Inspector display name | 属性 |
|-----------------|------------------------|------|
| `.task-card` | `card-task` | `type: Card` |
| `.status-badge` | `badge-status` | `type: Badge` |
| `.success-badge` | `badge` | `tone: success` |
| `.search-input` | `input-search` | `type: Control / Input` |
| `.ghost-button` | `button` | `variant: ghost` |
| `.primary-btn` | `button` | `variant: primary` |

开放识别规则：

- DevInspector 自带默认命名规则，作为插件分发时的推荐规范。
- 外部项目可以导入自己的 naming adapter，把 `TaskCard`、`c-card--task`、`data-component="Card"` 等写法映射成同一套 `type / object / variant / state / size`。
- 未识别组件先回退到真实 selector；用户确认后再沉淀成 adapter 规则。
- 新增组件能力前，先确认 display name、source selector 和 capability 是否已经分层清楚。

## 组件能力表

`Component Capability Registry` 是组件模式的单一配置入口。新增组件类型时，先登记能力，再渲染默认组件属性。

| 能力 | 说明 | 当前覆盖 |
|------|------|----------|
| `editableText` | 允许直接改组件文案，并即时作用到当前元素或相同元素 | Button、Badge |
| `textSlots` | 允许改组件内部已声明的内容插槽，并即时作用到当前组件实例 | Card 标题、说明文 |
| `childSlots` | 展示父组件内可被继续选中的子组件入口；点击后切到子组件自己的 capability 面板 | Card 状态标签 |
| `variantKind` | 允许在组件定义好的真实变体之间切换 | Button、Card |
| `toneKind` | 允许在语义色调之间切换 | Badge |
| `colorKind` | 允许调整 primitive 的语义颜色 | Icon |
| `sizeKind` | 允许在 S / M / L 尺寸间切换 | Button、Icon、Badge |

## 相同元素规则

- 业务组件：按去掉状态类后的业务类名分组，例如 `.ghost-button`。
- 状态类：`is-*`、`has-*`、`state-*`、`--active`、`--selected`、`--current`、`--open`、`--disabled` 等不参与相同元素分组。
- Icon primitive：`svg.lucide` 统一按 `.lucide` 分组，不按 `lucide-search`、`lucide-file-plus` 等具体图标名拆开。
- Card：按基础类分组，例如 `.task-card`，不被 `.task-card--floating`、`.task-card--compact` 等真实变体拆开。
- Badge / Tag：按基础类分组，例如 `.status-badge`，不被 `--progress`、`--done` 等状态修饰类拆开。
- 当前元素：只作用于当前选中 DOM 元素。
- 相同元素：作用于同一组件或 primitive 分组下的元素。

## 组件交互规则

| 组件 / Primitive | 分层 | 默认模式 | 可编辑白名单 | 相同元素规则 |
|------------------|------|----------|--------------|------------|
| Button / `.ghost-button` | Component | 组件模式 | 文案、variant、尺寸 | 按按钮基础类聚合，`.ghost-button` 展示为 `button` + `variant: ghost` |
| Icon / `svg.lucide` | Primitive | 组件模式 | 尺寸、颜色；默认不暴露布局/阴影/间距 | `.lucide` |
| Badge / Tag / Chip | Component | 组件模式 | 文案、色调、尺寸 | 按基础类，如 `.status-badge` |
| Text | Primitive | 文字模块 | 文字预设、字号、字重、颜色；不默认展示容器样式 | 命中具体文本类或当前元素 |
| Container | Primitive / 普通元素 | 普通元素样式模块 | 容器预设、背景、边框、圆角 | 命中具体容器类或当前元素 |
| Card | Component | 组件模式 | 真实变体；可编辑标题、说明文；状态标签作为子组件入口；外部布局独立调整 | 具体 card 类名 |

## 后续登记规则

新增共享组件时再登记：

| 组件 / Pattern | 分层 | 文档 | 代码位置 |
|----------------|------|------|----------|
| 暂无 | 暂无 | 暂无 | 暂无 |

备注：
- 没有真实代码和真实用法前，不预填组件清单。
- 组件层选型完成后，再补组件索引。
- 当规则已经稳定为产品决策时，只在 `../DECISIONS.md` 写“为什么”，不要把本文件复制过去。
