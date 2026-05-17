# 当前交接

> 用途：回答“上一轮做了什么、现在能不能继续、风险是什么、下一步具体干什么”。
> 什么时候更新：完成一次连续任务后，或风险、阻塞、下一步发生变化时。
> 不要写什么：长期路线图、完整历史、产品介绍、已经稳定的架构决策全文。

## 当前状态

- 当前做到：组件模式默认面板和 `Component Capability Registry` 已实现；Button / Icon / Badge / Card 已有组件级白名单属性；Card 已改为真实变体，并开放当前实例的标题/说明文内容插槽，状态标签作为子组件入口可继续选中；面板视觉已收敛为 `发送给AI` 单主按钮；组件命名已按 source selector / display name / attributes 三层记录；`本次修改内容` 已改为跨对象本地草稿篮。
- 当前阻塞：无明确阻塞；Input / Textarea / IconButton 等组合组件尚未进入能力表。
- 是否可继续：可以继续按能力表补更多组件类型。

## 本次已完成

- `PROJECT.md` 增加当前产品定位、SSOT 索引、当前模块、进度、已知问题和下一步重点。
- `docs/DECISIONS.md` 增加分类索引，并把“组件模式默认、普通元素样式分层”归入 `Product Interaction`。
- `docs/design/component-index.md` 增加 Inspector 模块交互、相同元素规则和 Button/Icon/Text/Container/Card 的初始交互白名单。
- 保持文档互相索引：当前状态看 `PROJECT.md`，决策原因看 `DECISIONS.md`，具体组件交互看 `component-index.md`。
- `packages/dev-inspector/src/DevInspector.tsx` 增加组件识别元信息、组件卡片、复制定位和组件能力白名单。
- `packages/dev-inspector/src/dev-inspector.css` 增加组件模式卡片样式。
- `packages/dev-inspector/src/DevInspector.tsx` 增加 `Component Capability Registry`，统一管理 Button / Icon / Badge / Card 的组件属性。
- Button 支持文案、variant、尺寸；Icon 支持颜色、尺寸；Badge 支持文案、色调、尺寸；Card 支持真实变体。
- `packages/dev-inspector/src/dev-inspector.css` 收敛主按钮层级：作用范围、组件属性、预设、tab 等选中态改为浅底描边，保留 `发送给AI` 为唯一实底主按钮。
- 组件卡片隐藏类型层级、重复的相同元素计数和 selector；源 class `.task-card` 这类名称按 `card-task` 的“类型-对象”方式展示。
- 组件识别成功后不默认展示 DOM / CSS 散样式区；普通 DOM / 未识别对象继续展示元素样式能力。
- Card 组件卡片去掉容器、密度、阴影样式项，只保留真实变体；demo 增加 `.task-card--compact`、`.task-card--floating`、`.task-card--emphasis`。
- 组件选中时默认展示“外部布局”，用于整体位置和尺寸调整；外部布局已改为 `位置 / 尺寸` 并列的紧凑属性表，分组名放在 X/W 上方作小灰字提示，X/Y/W/H 数值字段支持上下步进；Inspector 选中高亮改用 outline，避免覆盖组件自身阴影。
- Card 组件选中时支持直接改当前实例的内部标题和说明文；状态标签作为子组件入口展示，点击后切换到 `badge-status` 面板；组件识别成功后不再显示 `高级元素样式` 入口。
- 阴影模块已从 `Token / 预览` 两张卡片改为紧凑属性栏；左侧只展示状态名作为选择入口，右侧展示预览和 token/custom 具体值；token 状态只读展示，自定义状态展开 X/Y/模糊/扩散/颜色并即时作用到页面；进入自定义时从零值开始，不继承当前 token；修改记录中的自定义阴影必须带具体参数值。
- 间距模块正在收敛为紧凑 token 表：内边距 / 外边距 / 元素间距默认只读摘要，自定义时展开输入；视觉规则新增“紫色只用于 token / 组件语义，自定义和硬编码值用深色”；`无 / 0 / none` 属于空值状态，不算 token。
- 文字样式下拉里的 `自定义` 不再作为平级预设项展示，改为底部动作 `基于当前样式自定义`，进入后才显示自定义模式。
- 选中 h1 / p / span 等纯文字元素时，不默认展示容器区，避免把文字 primitive 误当成容器 primitive。
- `本次修改内容` 不再依赖当前选中态；多个对象未发送的改动会持续保留，标题直接显示修改数量，对象支持删除，单条属性支持重置并同步清除临时页面效果。
- `docs/design/component-index.md` 增加组件命名规范：推荐源码命名、Inspector 展示名、组件属性和外部 naming adapter 预留规则。
- `docs/PRODUCT_PLAN.md` 补上插件面向外部使用的方向，并把外部 adapter / workspace-aware 识别按 L0-L3 归档为暂不实现。
- 产品文档改为主流结构：`docs/product/README.md`、`MRD.md`、`PRD.md`、`INTERACTION_SPEC.md`、`DATA_DICTIONARY.md`、`BUSINESS_RULES.md`；当前产品规则不再承接到 `docs/PRODUCT_PLAN.md`。
- `AGENTS.md` 和 `docs/DOCUMENTATION.md` 增加 AI 文档读取顺序：先行为规则，再文档路由，再项目状态、产品、设计、决策和交接。
- `packages/dev-inspector/src/DevInspector.tsx` 调整展示名逻辑：`.task-card` 展示为 `card-task`，`.ghost-button` 展示为 `button`，ghost 作为 variant；`.search-input` 展示为 `input-search`；`发送给AI` 的元素字段使用展示名，真实 selector 单独输出。

## 风险与待确认

- 当前组件能力和 Card slot 规则仍在 `DevInspector.tsx` 内，后续如果继续增长，应拆出独立 registry 文件。
- 组件识别规则目前覆盖 Button、Card、Icon、Control、Badge，更多业务组件需要按真实类名逐步补充。
- naming adapter 已归档为后续方向，当前阶段明确不做外部配置导入和 workspace-aware 源码扫描。
- 业务对象 / 销货号 / SKU 等规则目前只是建立落档入口，没有登记具体规则；后续必须有 PRD、代码 schema、接口、导入模板、页面行为或用户确认后再写入。

## 下一步

1. 补 Input / Textarea / IconButton 的组件能力。
2. 视体量把 `Component Capability Registry` 从 `DevInspector.tsx` 拆出独立模块；naming adapter 暂不实现。
3. 校准组件模式下 `发送给AI` 的任务文本和定位字段。
