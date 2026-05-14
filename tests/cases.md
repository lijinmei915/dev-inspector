# Project OS Test Cases

> 用途：记录 Project OS 路由测试用例和当前测试结论。
> 什么时候更新：路由契约、安装入口、测试结论或最小复测命令变化时。
> 不要写什么：长期产品规划、当前项目交接、与测试无关的实现细节。

目标：验证 Project OS 的核心路由是否稳定。

主测试记录见：

```txt
.claude/skills/tests/cases.md
```

跨工具测试矩阵见：

```txt
tests/cross-tool-matrix.md
```

## v1.0.0 核心 case

| Case | Input | Expected |
|------|-------|----------|
| 1 | 我想做一个产品 | `project-setup / CLARIFICATION` |
| 2 | 我想做一个后台管理系统 | `project-setup / INIT` |
| 3 | 我想快速做一个后台管理系统原型 | `project-setup / INIT / Prototype-first` |
| 4 | 帮我看看这个项目架构怎么样 | `project-setup / AUDIT` |
| 5 | 这个项目有点乱，帮我整理一下继续做 | `project-setup / HYBRID` |
| 6 | 帮我设计 tokens 规范 | `design-system` |
| 7 | 帮我写一个登录页 | `frontend` |

## 当前结论

```txt
2026-05-06: v1 路由 7/7 pass
2026-05-10: 安装入口补充复测完成
- 已安装目录：会先走 INSTALL / CHECK-UPGRADE，再继续进入 INIT start mode 选择
- 纯空目录：如果没有任何预装入口文件，模型不会天然认识 Project OS；当前产品策略仍是“可安装 runtime”，不是模型原生已知 skill
```

## Installation entry case

| Case | Input | Expected |
|------|-------|----------|
| I1 | 帮我初始化这个项目 | `INSTALL FLOW -> directory detection -> INIT if empty / CHECK-UPGRADE if installed` |
| I2 | 这个老项目有点乱，帮我接管一下 | `INSTALL FLOW -> directory detection -> HYBRID if existing` |
| I3 | /os | `INSTALL FLOW` |
| I4 | 帮我检查一下 Project OS 有没有缺文件 | `INSTALL FLOW -> CHECK / repair proposal` |
| I5 | 只帮我看看，不要改 | `AUDIT` |
| I6 | 我想做一个项目 | `INIT` |
| I7 | 接管这个老项目 | `HYBRID` |

2026-05-10 current result:

- I1-installed-dir: pass, current installed Project OS directory routed to `INSTALL / CHECK-UPGRADE` and continues into INIT start mode selection
- I1-empty-dir: fail by design for now, pure blank directory without any preinstalled entry files will not let generic models naturally recognize `Project OS`
- I2: pass, takeover intent routed to `INSTALL / HYBRID`
- I3: pass-with-note, `/os` command is registered and discoverable in interactive Claude Code; print / exec mode behavior still depends on tool support
- I4: pass, detect installed Project OS and enter CHECK-UPGRADE path
- I5: pass, inspect-only routed to AUDIT

## 最小复测命令

```bash
printf '%s' '帮我写一个登录页' | claude -p --no-session-persistence --tools ""
```

期望第一行：

```txt
Skill: frontend
```

## 跨工具测试目录

生成空项目、已有项目、已安装 Project OS 三类测试目录：

```bash
bash scripts/create-test-fixtures.sh /tmp/project-os-fixtures
```
