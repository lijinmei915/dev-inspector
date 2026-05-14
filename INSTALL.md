# Project OS 安装说明

> 用途：回答“怎样把 Project OS 安装到当前项目、会装进什么、安装后怎么用”。
> 什么时候更新：安装步骤、安装脚本、适配器写入方式、安装产物或安装入口变化时。
> 不要写什么：当前项目交接、长期产品路线、无关的业务实现细节。

这个仓库可以作为 Project OS 源仓库，被安装到空目录或已有项目里。

目标是让使用者只需要拿到 GitHub 地址，然后用自然语言让 AI 安装。

源仓库：

```txt
https://github.com/lijinmei915/project-os-starter.git
```

---

## 给 AI 的一句话

把下面这段发给任意 coding agent：

```txt
请把 Project OS 安装到当前项目。

源仓库：
https://github.com/lijinmei915/project-os-starter.git

请按以下方式执行：
1. clone 源仓库到临时目录
2. 运行源仓库里的 scripts/install-project-os.sh，把 Project OS 安装到当前目录
3. 安装后运行 scripts/check-runtime.sh .
4. 不要接组件库，不要生成业务 UI，不要扩展新功能
5. 如果当前目录已有同名文件，先备份再覆盖
```

---

## AI 可执行命令

在目标项目目录里执行：

```bash
tmp_dir="$(mktemp -d)"
git clone https://github.com/lijinmei915/project-os-starter.git "$tmp_dir/project-os-starter"
bash "$tmp_dir/project-os-starter/scripts/install-project-os.sh" .
bash scripts/check-runtime.sh .
```

中文说明：
这会把 Project OS 复制到当前目录，并做一次结构校验。

---

## 安装到已有项目

如果当前目录已经有项目文件，安装脚本会先备份冲突文件到：

```txt
.project-os/backups/
```

然后再写入 Project OS 文件。

会安装的核心内容：

```txt
.claude/skills/
.claude/commands/
.claude/hooks/
.claude/project.json
.claude/settings.local.json
AGENTS.md
README.md
PROJECT.md
HANDOFF.md
INSTALL.md
docs/DOCUMENTATION.md
docs/CHANGELOG.md
docs/DECISIONS.md
docs/LESSONS.md
docs/TESTING.md
docs/PRODUCT_PLAN.md
docs/CODE_STRUCTURE.md
docs/DESIGN_STANDARDS.md
docs/design/
tests/
scripts/check-runtime.sh
scripts/install-project-os.sh
scripts/install-adapter.sh
scripts/create-test-fixtures.sh
adapters/
```

可选内容：

```txt
CLAUDE.md
```

中文说明：
核心规则源头是 `AGENTS.md`。
`.claude/*` 是当前仓库自带的参考实现，`adapters/*` 是面向不同工具的适配层。
`CLAUDE.md` 是 Claude 专属增强文件。如果源仓库里没有这个文件，安装脚本会安全跳过，不影响 Project OS 运行。
`README.md` / `PROJECT.md` / `HANDOFF.md` / `docs/CHANGELOG.md` 等会使用干净模板，不会把源仓库自己的状态历史直接带进目标项目。

---

## 安装模型 / 工具适配

Project OS 的通用规则源头是：

```txt
AGENTS.md
```

不同工具的专属入口由 adapter 生成：

```txt
adapters/CLAUDE.md -> CLAUDE.md
adapters/CODEX.md  -> CODEX.md
adapters/CURSOR.md -> .cursor/rules/project-os.md
adapters/GEMINI.md -> GEMINI.md
```

安装方式：

```bash
bash scripts/install-adapter.sh claude .
bash scripts/install-adapter.sh codex .
bash scripts/install-adapter.sh cursor .
bash scripts/install-adapter.sh gemini .
```

中文说明：
adapter 不是新的规则源头，只是把 `AGENTS.md` 的职责翻译成对应工具更容易自动读取的文件。
需要哪个工具，就安装哪个 adapter。

---

## 安装后怎么用

普通用户直接说：

```txt
帮我初始化这个项目
```

或：

```txt
这个老项目有点乱，帮我接管一下
```

高级用户可以输入：

```txt
/os
```

Project OS 会先进入 `INSTALL FLOW`，判断当前目录状态，再决定走：

```txt
INSTALL / INIT
INSTALL / HYBRID
INSTALL / CHECK-UPGRADE
AUDIT
```

---

## 手动安装

如果不想运行脚本，也可以手动复制这些内容到目标项目：

```txt
.claude/
AGENTS.md
README.md
PROJECT.md
HANDOFF.md
INSTALL.md
docs/DOCUMENTATION.md
docs/CHANGELOG.md
docs/DECISIONS.md
docs/LESSONS.md
docs/TESTING.md
docs/PRODUCT_PLAN.md
docs/CODE_STRUCTURE.md
docs/DESIGN_STANDARDS.md
docs/design/
tests/
scripts/check-runtime.sh
scripts/install-project-os.sh
scripts/install-adapter.sh
scripts/create-test-fixtures.sh
adapters/
```

然后执行：

```bash
bash scripts/check-runtime.sh .
```
