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

-----

<a id="related-documentation"></a>
## 相关文档

- [市场快照子系统](../../docs/subsystems/market-snapshot.zh.md)——持久化事实、身份、截止点和适配器规则。
- [MAOQ 路线图](../../docs/maoq-roadmap.zh.md)——P1 范围和验收标准。

-----

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
