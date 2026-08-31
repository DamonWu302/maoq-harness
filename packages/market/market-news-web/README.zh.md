---
description: "把截止点前的联网政策与新闻搜索冻结为 MAOQ 不可变证据批次。"
kind: "package-reference"
---

# `@deepseek-ai/dsh-market-news-web`

[English](README.md) | 中文

## 概述

本包把既有 `ctx.web` 搜索 seam 转换为可复现的政策、宏观与新闻证据。采集必须在决策截止点之前开始并结束。结果按规范 SHA-256 只写一次；后续快照构建只读取该精确批次，绝不重复搜索。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在 `dsh-web` 和配置好的搜索提供方之后挂载服务。MAOQ Profile 把批次保存在 `.maoq/news`。

```yaml
- name: '@deepseek-ai/dsh-market-news-web'
  config:
    root: .maoq/news
```

在截止点前用带版本查询调用 `ctx.marketNews.acquire()`。每个查询提供明确的影响板块映射与置信度策略；它们是采集元数据，不是模型结论。把 `news:<批次内容哈希>` 加入市场快照身份，再用该精确身份请求 MySQL 适配器。

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-market-news-web)是穷尽式来源。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

服务为整个批次记录一个完成时间。每条来源都必须提供 URL、标题和不晚于截止点的有效发布时间。发布时间元数据一致的重复 URL 会合并影响板块并采用较低置信度。发布方取 URL 主机名，事件时间保守地等于发布时间；两项转换都保留在来源谱系中。时间证据缺失、元数据冲突、采集过晚、发布过晚或持久化字节损坏都会失败关闭。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [市场快照 MySQL 适配器](../market-snapshot-mysql/README.zh.md)——把精确批次合并到每日事实。
- [市场快照子系统](../../../docs/subsystems/market-snapshot.zh.md)——身份和截止点规则。
- [MAOQ 路线图](../../../docs/maoq-roadmap.zh.md)——P1 验收与后续解释边界。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本包不增加模型可见上下文或工具。

#### KV Cache 影响

无。证据保持在宿主侧，直到后续受约束消费者呈现选定记录。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **必须在截止点前调度**——首次在截止点后执行的搜索不能进入该截止点的快照。
- **必须有提供方时间戳**——只含 URL 或没有日期的搜索结果会被拒绝，不会猜测。
- **必须为查询策略设版本**——板块映射和置信度是调用方拥有的策略输入；改变它们必须使用新的 `queryVersion`。
- **以发布时间回退事件时间**——独立事件时间需要未来带自身版本和证据测试的结构化提取器。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

不要增加“最新批次”查询。内容哈希是唯一回放地址，市场快照身份必须明确指定它。

</details>
