# Project OS Skill Registry

Project OS does not depend on external skills.

All required clarification and routing must be handled internally.

中文说明：
Project OS 不依赖外部 skill。
所有必要的澄清和路由都由内部 skill 自己完成。

## Skills

| Skill | Role | Boundary |
|-------|------|----------|
| `project-setup` | Entry controller for project-level work | Owns INIT / AUDIT / HYBRID / clarification |
| `design-system` | Design rules and visual system | Owns tokens, layout rules, UI constraints |
| `frontend` | UI/page implementation | Owns implementation after project-setup and design-system boundaries are clear |

## Routing Principle

`project-setup` is the default controller for Project OS.

Domain skills do not compete for entry.
They are called after the project-level mode and intent are clear.

中文说明：
`project-setup` 是 Project OS 的默认控制器。
领域 skill 不抢入口，只在边界明确后被调用。
