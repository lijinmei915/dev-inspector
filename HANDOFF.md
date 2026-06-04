# 当前交接

> 用途：回答“上一轮做了什么、现在能不能继续、风险是什么、下一步具体干什么”。
> 什么时候更新：完成一次连续任务后，或风险、阻塞、下一步发生变化时。
> 不要写什么：长期路线图、完整历史、产品介绍、已经稳定的架构决策全文。

## 当前状态

- 当前做到：组件模式默认面板和 `Component Capability Registry` 已实现；Button / Icon / Badge / Card 已有组件级白名单属性；Card 已改为真实变体，并开放当前实例的标题/说明文可编辑内容，状态标签作为子组件入口可继续选中；面板视觉已收敛为 `发送给AI` 单主按钮；组件命名已按 source selector / display name / attributes 三层记录；`本次修改内容` 已改为跨对象本地草稿篮；Inspector 内部插件区只保留 `组件制作`，产品心智独立、技术上先内置在 DevInspector 包内；当前组件制作 MVP 收口为“普通元素创建组件规格”：底部 `创建组件` 打开轻量抽屉，先确认 `容器`，再按容器展示有限 `用途` 推荐，并联动生成组件名和使用场景后写入 `本次修改内容`；`归类` 已定义为对象职责路径，例如 `页面 / 标题`、`列表 / 功能列表`，不再混入全量已有组件列表，也不维护无限用途枚举；同一归类已有组件时提示 `复用已有组件 / 新建同类组件`；`可改内容` 已改为自动识别字段列表，子组件或固定封装内容以只读项展示；暂不做组件库浏览、多变体、加入已有组件或基于当前组件生成新组件；样式复用统一走 `复制样式` -> `本次修改内容` -> `发送给AI`。
- 对外接入：`@lijinmei-810/dev-inspector` 和 `@lijinmei-810/dev-inspector-vite` 已补包内 README，明确 runtime panel / Vite plugin 双包组合和 AI 安装提示，避免外部项目误搜 `vite-plugin-dev-inspector` 或 `dev-inspector-vite-plugin`。
- 当前阻塞：无明确阻塞；Input / Textarea / IconButton 等组合组件尚未进入能力表。
- 是否可继续：可以继续按能力表补更多组件类型，或继续验证布局容器和普通样式模块的边界。

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
- `packages/dev-inspector/src/DevInspector.tsx` 增加普通元素 `创建组件` 抽屉：默认识别组件名、归类、使用场景和可改内容，确认后记录为 `组件规格`。
- `packages/dev-inspector/src/plugins/component-maker.ts` 抽出组件制作插件的 context、preview 和 prompt 生成逻辑；DevInspector 只负责收集选中对象上下文并调用该模块。
- 组件创建任务已从旧二级工作台收口：不再把“归属组件 / 动作 / 创建变体 / 组件库”作为当前 MVP 的主流程；这些方向只作为后续验证项保留。
- 普通元素组件名建议避免 `h1` / `div` 通用标签，标题类优先使用 `page-title`、`section-title`、`subsection-title` 这类语义名。
- 已移除独立 `同样式` 入口；样式复用不再走插件区，而是复用现有 `复制样式` 修改篮链路。
- `docs/product/INTERACTION_SPEC.md`、`docs/design/component-index.md`、`docs/DECISIONS.md`、`PROJECT.md` 记录组件创建抽屉的交互、能力边界和决策原因；`docs/LESSONS.md` 记录组件制作状态同步变量误用的复盘。
- 选中 `demo-shell` 这类整页容器时不再进入 `页面模式`：不展示页面区块摘要、页面布局摘要或 `生成页面规格`，直接展示普通样式模块。
- 页面级容器规则已同步到 `docs/product/PRD.md`、`docs/product/INTERACTION_SPEC.md` 和 `docs/design/component-index.md`：页面壳层 / 整页容器与普通结构对象同样直接进入样式编辑。
- 选中 `task-grid` 这类重复集合时已分流到 `布局容器`：不展示 `创建组件`，默认只管理同类子项入口和整体布局，AI 任务强调不修改子项内容和子组件样式。
- 间距规则已补齐：`元素间距` 只在当前对象本身是 flex / grid 容器且有 2 个及以上可见直接子项时展示；选中单个标题、文本或普通单元素时隐藏该行。
- 底部操作栏按钮规则已补齐：`重置`、`复制样式`、`创建组件` 作为左侧次级动作组，统一高度、左右内边距和横向间距；`创建组件` 只保留紫色语义，不单独放大宽度；普通元素四按钮状态下 `发送给AI` 保持固定宽度，组件模式缺少 `创建组件` 时 `发送给AI` 动态吃掉剩余宽度；所有相邻按钮之间保持同一 gap，同时保留面板右侧安全内边距，避免在 380px 面板内贴边、被裁或右侧残留空占位。
- 普通结构块规则已补齐：除重复集合 / 列表网格容器外，`demo-shell`、`demo-block`、`demo-block-head` 这类符合结构容器特征的普通对象都不再进入结构摘要模式，不展示“页面级容器 / 建议沉淀为组件 / 子元素 / 整体样式 / 子文本样式”，直接进入普通样式模块。
- 颜色 token 下拉已拆成上方色板滚动区和底部固定 footer row：自定义输入区始终贴在弹层底部，不随色板内容滚走；外层下拉不再额外叠加底部 padding，footer 上下留白一致；色块、hex 和透明度输入对齐间距区 compact 数值输入高度，色块按钮清掉原生 padding 且不使用 scale hover，保证三者同高并垂直居中。

## 风险与待确认

- 当前组件能力和 Card 可编辑内容规则仍在 `DevInspector.tsx` 内；组件制作 prompt 已先拆到 `plugins/component-maker.ts`，后续如果继续增长，应继续拆 `Component Capability Registry`。
- 组件识别规则目前覆盖 Button、Card、Icon、Control、Badge，更多业务组件需要按真实类名逐步补充。
- naming adapter 已归档为后续方向，当前阶段明确不做外部配置导入和 workspace-aware 源码扫描。
- 业务对象 / 销货号 / SKU 等规则目前只是建立落档入口，没有登记具体规则；后续必须有 PRD、代码 schema、接口、导入模板、页面行为或用户确认后再写入。

## 下一步

1. 继续验证普通结构对象和布局容器的分流边界：`demo-shell`、`demo-block` 走普通样式，`task-grid` 继续走布局容器。
2. 补 Input / Textarea / IconButton 的组件能力。
3. 视体量把 `Component Capability Registry` 从 `DevInspector.tsx` 拆出独立模块；naming adapter 暂不实现。
4. 校准组件模式下 `发送给AI` 的任务文本和定位字段。
