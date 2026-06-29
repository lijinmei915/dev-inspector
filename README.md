# DevInspector

> 用途：告诉使用者这是什么项目、怎么启动、怎么接入别的项目。
> 什么时候更新：项目定位、安装方式、入口说明或对外使用方式变化时。
> 不要写什么：AI 运行细则、当前交接、详细历史、内部路由实现。

DevInspector 是一个面向本地页面的组件语义检查与 AI 任务生成工具。

它的目标是让你在页面上直接看到：

- 当前选中的组件或元素
- 组件的变体、状态、尺寸和 token
- 当前修改会被整理成什么 AI 任务
- 外部项目如何接入自己的组件和 token 说明

---

## 怎么开始

本仓库用于本地开发和验证。

```bash
npm install
npm run dev
```

默认会打开本地 demo 页面，用来调试 Inspector 和设计库能力。

---

## 怎么安装到别的项目

如果你想把这套协作规范和 Inspector 能力安装到另一个项目，先运行安装脚本：

```bash
tmp_dir="$(mktemp -d)"
git clone https://github.com/lijinmei915/project-os-starter.git "$tmp_dir/project-os-starter"
bash "$tmp_dir/project-os-starter/scripts/install-project-os.sh" .
bash scripts/check-runtime.sh .
```

如果对方项目使用特定 AI 工具，再安装对应 adapter：

```bash
bash scripts/install-adapter.sh codex .
bash scripts/install-adapter.sh claude .
bash scripts/install-adapter.sh cursor .
bash scripts/install-adapter.sh gemini .
```

安装后，项目里的 AI 会先读这些文件：

- `AGENTS.md`
- `PROJECT.md`
- `HANDOFF.md`
- `docs/product/README.md`
- `docs/design/component-index.md`
- `docs/design/tokens.md`

---

## 协作文档

- AI 运行规则：`AGENTS.md`
- 当前项目状态：`PROJECT.md`
- 当前交接上下文：`HANDOFF.md`
- 产品文档入口：`docs/product/README.md`
- 组件与交互规则：`docs/design/component-index.md`
- Token 规则：`docs/design/tokens.md`

---

## 直接对 AI 说

```txt
帮我初始化这个项目
```

或者：

```txt
这个项目有点乱，帮我接管一下
```
