---
description: "market 组地图：为 MAOQ 研究与回放提供不可变的时点正确市场事实。"
kind: "package-group"
---

# packages/market

[English](README.md) | 中文

## 概述

market 组把取得的 A 股日线、板块、宽度、情绪和新闻事实转化为不可变的时点输入。它阻止供应商字段进入下游策略代码，并在分析开始前拒绝残缺或时间不合格的证据。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 职责 | ctx 键 |
|---|---|---|
| [`market-snapshot`](market-snapshot/README.zh.md) | 构建、持久化和查询规范日级市场快照 | `ctx.marketSnapshots` |
| [`market-snapshot-json`](market-snapshot-json/README.zh.md) | 按精确快照身份导入审计过的供应商无关草稿 | 注册适配器 |
| [`market-snapshot-mysql`](market-snapshot-mysql/README.zh.md) | 从既有 MySQL 流水线取得通过质量门禁的日线事实 | 注册适配器 |
| [`market-strategic-state`](market-strategic-state/README.zh.md) | 计算可回放战略特征并校验证据约束的解释 | 库 |
| [`tool-maoq-snapshot`](tool-maoq-snapshot/README.zh.md) | 提供有界快照发现、生成、列表和检查工具 | 工具 |

-----

<a id="related-documentation"></a>
## 相关文档

- [市场快照子系统](../../docs/subsystems/market-snapshot.zh.md)——持久化事实、身份、截止点和适配器规则。
- [市场战略状态子系统](../../docs/subsystems/market-strategic-state.zh.md)——确定性标签、证据引用与解释规则。
- [MAOQ 路线图](../../docs/maoq-roadmap.zh.md)——P1 范围和验收标准。

-----

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
