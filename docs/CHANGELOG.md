# 代码变更日志

> 只记录高价值结构改动，用于回溯“改了什么 / 为什么改 / 影响到哪里”。
> 不记录零碎样式微调；方案原因看 `DECISIONS.md`，踩坑复盘看 `LESSONS.md`。
>
> 用途：记录高价值结构改动。
> 什么时候更新：安装方式、路由机制、适配层、文档结构、跨层改动变化时。
> 不要写什么：当前状态、交接下一步、零碎文案调整、无结构影响的小修。

维护规则：
- 只记录跨层改动
- 每条固定写“改动 / 影响 / 相关文件”
- 无结构影响的小修不记录
- 一次连续任务合并成一条

---

## 2026-05-17

### 调整产品文档分层

- 改动：产品文档改为主流 MRD / PRD / 交互文档 / 数据字典 / 业务规则分层，并新增 `docs/product/README.md` 作为入口索引。
- 影响：`docs/PRODUCT_PLAN.md` 回到中长期规划职责；已经确认的现有产品规则不再主要沉淀在规划文档里。
- 相关文件：`docs/product/README.md`、`docs/product/MRD.md`、`docs/product/PRD.md`、`docs/product/INTERACTION_SPEC.md`、`docs/product/DATA_DICTIONARY.md`、`docs/product/BUSINESS_RULES.md`、`docs/DOCUMENTATION.md`、`PROJECT.md`。

### 新增 AI 文档读取顺序

- 改动：在 `AGENTS.md` 和 `docs/DOCUMENTATION.md` 增加 AI 接手时的文档读取顺序。
- 影响：后续 AI 先按行为规则、文档路由、项目状态、产品文档、设计规则、决策和交接顺序判断，降低跨文档串层。
- 相关文件：`AGENTS.md`、`docs/DOCUMENTATION.md`、`HANDOFF.md`。
