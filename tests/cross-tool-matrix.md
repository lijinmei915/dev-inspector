# Cross-Tool Project OS Test Matrix

> 用途：记录不同工具下的验收矩阵，回答“哪些平台测过、测什么、预期是什么”。
> 什么时候更新：测试目标、工具覆盖范围、验收项目或判断标准变化时。
> 不要写什么：产品规划、当前交接流水、与跨工具测试无关的实现细节。

目标：验证 Project OS 在可代码桌面端和终端 CLI 中都能进入同一套 INSTALL FLOW。

验收重点不是所有工具都原生支持同一个命令，而是所有工具都能理解同一个意图：

```txt
我要把 Project OS 装进 / 接入 / 检查 / 升级当前项目
```

---

## Test Targets

| Target | Entry Source | Notes |
|--------|--------------|-------|
| Codex | `AGENTS.md` + `adapters/CODEX.md` | 通过通用规则和 Codex adapter 理解 Project OS |
| Claude Code | `.claude/skills` + `.claude/commands/os.md` + `adapters/CLAUDE.md` | 支持自然语言和 `/os` 项目命令 |
| 可代码桌面端 | `AGENTS.md` + 对应 adapter | Cursor / Windsurf / 其他能读写项目的 agent |

---

## Test Directories

用脚本生成三类目录：

```bash
bash scripts/create-test-fixtures.sh /tmp/project-os-fixtures
```

生成结果：

```txt
/tmp/project-os-fixtures/empty-project
/tmp/project-os-fixtures/existing-codebase
/tmp/project-os-fixtures/installed-project-os
```

目录含义：

| Directory | Purpose | Expected Route |
|-----------|---------|----------------|
| `empty-project` | 空目录 / 近似空目录 | `INSTALL FLOW -> INIT` |
| `existing-codebase` | 已有代码但没有 Project OS | `INSTALL FLOW -> HYBRID` |
| `installed-project-os` | 已安装但可能缺文件 | `INSTALL FLOW -> CHECK-UPGRADE` |

---

## Cross-Tool Matrix

| 测试项 | Codex | Claude Code | 可代码桌面端 |
|--------|-------|-------------|--------------|
| 自然语言触发 INIT | 待测 | 待测 | 待测 |
| 自然语言触发 HYBRID | 通过 | 待测 | 待测 |
| `/os` 触发 INSTALL FLOW | 待测 | 待测 | 待测 |
| 已安装项目检查升级 | 待测 | 待测 | 待测 |
| 只看不改进入 AUDIT | 待测 | 待测 | 待测 |
| 不直接生成业务代码 | 通过 | 待测 | 待测 |
| 不覆盖已有文件 | 通过 | 待测 | 待测 |

---

## Cases

### Case 1: Natural Language INIT

Directory:

```txt
empty-project
```

Input:

```txt
帮我初始化这个项目，接入 Project OS
```

Expected:

```txt
INSTALL FLOW
Directory state: Empty / near-empty
Route: INSTALL / INIT
After install/check, continue into INIT start mode question in the same turn
No business UI/code generation
No file changes before mode is clear
```

### Case 2: Natural Language HYBRID

Directory:

```txt
existing-codebase
```

Input:

```txt
这个项目有点乱，帮我接管一下，接入 Project OS
```

Expected:

```txt
INSTALL FLOW
Directory state: Existing codebase without Project OS
Route: INSTALL / HYBRID
Inspect existing structure first
Do not overwrite source files
```

Latest result:

```txt
Codex: pass
- Route prefix: INSTALL / HYBRID
- Existing source files preserved: package.json, src/App.tsx, src/main.tsx
- Existing README backed up to .project-os/backups/
- Project OS runtime installed as clean template set
```

### Case 3: Explicit `/os`

Directory:

```txt
any fixture directory
```

Input:

```txt
/os
```

Expected:

```txt
INSTALL FLOW
Directory state detection
Route to INIT / HYBRID / CHECK-UPGRADE / AUDIT based on state and user intent
```

Note:
Non-Claude tools may not treat `/os` as a native slash command. They should still treat `/os` as plain-text instruction meaning "Enter Project OS INSTALL FLOW".

### Case 4: CHECK-UPGRADE

Directory:

```txt
installed-project-os
```

Input:

```txt
帮我检查一下 Project OS 有没有缺文件，需要的话升级一下
```

Expected:

```txt
INSTALL FLOW
Directory state: Existing directory with Project OS already installed
Route: INSTALL / CHECK-UPGRADE
List missing files
Propose repair before editing
Do not reinitialize from scratch
```

### Case 5: AUDIT Only

Directory:

```txt
existing-codebase
```

Input:

```txt
只帮我看看，不要改文件，看看这个项目适不适合接入 Project OS
```

Expected:

```txt
AUDIT
Read-only analysis
No AGENTS.md creation
No .claude/skills creation
No source file edits
```

---

## Final Pass Standard

Project OS interaction is successful when all three are true:

```txt
1. Natural language can trigger INSTALL FLOW without requiring a command.
2. /os can explicitly enter INSTALL FLOW where the tool supports or understands it.
3. Codex, Claude Code, and coding desktop agents all follow:
   INSTALL FLOW -> INIT / HYBRID / AUDIT / CHECK-UPGRADE
```
