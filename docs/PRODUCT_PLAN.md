# 产品规划

> 本文件回答：这个项目接下来往哪走、这个阶段先做什么、哪些事暂时不做。
>
> 用途：定义阶段目标、优先级和暂不做事项。
> 什么时候更新：阶段目标、优先级、本阶段不做事项变化时。
> 不要写什么：当前交接、详细变更历史、纯实现细节。

## 产品愿景

- DevInspector 是面向本地页面的组件语义 Inspector，帮助使用者把页面里的 DOM / CSS 转成可理解的组件、token、变体和 AI 修改任务。
- DevInspector 自带一套推荐组件命名和交互规范，别人可以直接参考。
- DevInspector 也应支持导入外部项目或组件库的命名规则，把别人的 class、attribute、组件约定识别成统一的 `type / object / variant / state / size / capability`。

## 当前阶段目标

- 收口组件语义 Inspector 内核：组件识别、相同元素规则、组件能力白名单、命名规范和 AI 任务文本先稳定。
- 默认规则先服务当前 demo 和本地 workspace；外部 adapter 方向只归档，不进入当前阶段实现。

## 本阶段要做

1. 稳定默认命名规则：source selector / Inspector display name / component attributes 三层分离。
2. 稳定 `Component Capability Registry`：按组件类型声明可编辑能力，而不是默认开放所有 DOM 样式。
3. 稳定样式面板的信息层级：组件模式优先展示组件语义能力，普通元素模式才展示文字、容器、布局、阴影、间距等元素样式。
4. 记录 naming adapter 方向：允许外部项目未来导入自己的组件命名规则，但当前不开发导入系统。

## 本阶段不做

- 不要求外部项目必须改成 DevInspector 的源码 class 命名。
- 不把 DevInspector 做成完整组件库或设计系统管理后台。
- 不在组件识别还没稳定前批量扩很多组件类型。
- 不做 `dev-inspector.config.ts` / JSON 外部 adapter 导入。
- 不做 workspace-aware 源码扫描来推断完整组件变体。

## 归档：外部规范识别方向

这个方向暂时不做实现，只保留产品判断：

| 层级 | 场景 | 能力边界 |
|------|------|----------|
| L0 无接入页面 | 只在 Local 页面运行，没有额外配置 | 只能从 DOM、class、data attribute、computed style 推断当前元素；不能知道组件库完整变体 |
| L1 新项目默认规范 | 新项目直接采用 DevInspector 推荐命名或 `data-di-*` | 可以稳定识别组件类型、对象、当前变体、状态和尺寸 |
| L2 老项目 adapter | 已有设计系统或历史 class 规则 | 通过导入规则把项目自己的 class / attribute 映射到统一组件语义 |
| L3 Workspace-aware | 未来具备本地 workspace / CLI / companion 能力 | 可以读源码或组件配置，推断完整 props、variant 和能力表 |

当前阶段只做 L0 + 少量 L1 默认规范；L2 / L3 作为插件走向外部项目时的后续能力。

## 待确认问题

- naming adapter 的落地形态：`dev-inspector.config.ts`、JSON 配置，还是从组件库包内读取。
- 外部规范导入的最小字段：组件类型、对象名、变体、状态、尺寸、可编辑能力。
- 未识别组件是否提供“本次标记并保存规则”的交互。
