---
description: "用于取得和找回精确不可变市场快照的有界 MAOQ 工具。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-maoq-snapshot

[English](README.md) | 中文

## 概述

`dsh-tool-maoq-snapshot` 让 MAOQ 统帅发现获准的行情来源、串行生成一个小型不可变日线快照窗口、列出已存哈希，并检查某个精确快照。它不分析市场、不排序股票、不修改源数据、不删除快照，也不下单。

## 目录

- [使用本包](#use-this-package)
- [理解边界](#understand-the-boundaries)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

把它挂载在 `dsh-market-snapshot` 和至少一个支持近期交易日发现的适配器之后。MAOQ Profile 允许 `long-short-stock-mysql`，并把单次生成限制为十个交易日。`maoq_snapshot_generate` 必须收到显式来源、允许的最新交易日、证据截止时间和数量。它按交易日升序返回精确哈希，并把最新哈希与历史哈希分开，供 `maoq_analyze_strategy` 使用。

| 字段 | 默认值 | 含义 |
|---|---|---|
| `allowedAdapters` | `long-short-stock-mysql` | 模型可以调用的数据来源。 |
| `maxGenerateCount` | `10` | 单次调用最多串行生成的快照数。 |
| `maxListCount` | `20` | 单次列表最多返回的摘要数。 |
| `maxScanFiles` | `500` | 单次列表最多校验的不可变文件数。 |
| `generateTimeoutMs` | `600000` | 前台生成超时。 |

<a id="understand-the-boundaries"></a>
## 理解边界

来源凭据保留在适配器或部署配置中，永远不会进入工具参数。来源允许名单和规模上限由宿主配置，模型无法放大。生成过程串行且只追加，每个产物都经过校验并以 SHA-256 寻址。列表在扫描上限内校验已存字节，检查则要求精确的小写哈希。快照服务不存在隐式选择“最新”的查询。

-----

<a id="further-exploration"></a>
## 延伸阅读

- [市场快照](../market-snapshot/README.zh.md)——规范事实与只追加存储。
- [MySQL 适配器](../market-snapshot-mysql/README.zh.md)——经过质量门禁的日线数据取得。
- [MAOQ 决策工具](../../workflow/tool-maoq-decision/README.zh.md)——消费精确的当前与历史哈希。

<a id="model-experience"></a>
## 模型体验

### 系统提示与工具结构

#### 模型看到的内容

统帅会看到四个生成的[工具结构](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-maoq-snapshot)以及以下稳定工作流指引。

##### MAOQ 快照指引

```markdown
Use maoq_snapshot_sources before acquisition when the source is unknown. Generate snapshots only when the user requests fresh immutable facts or a strategic question lacks exact hashes. Preserve the requested cutoff, use the smallest sufficient window, and never treat generation as analysis. Use maoq_snapshot_list and maoq_snapshot_inspect to recover exact hashes; then pass explicit current and history hashes to maoq_analyze_strategy. Snapshot tools cannot delete facts, change source data, rank stocks, or place orders.
```

#### Token 影响

一段较短的稳定指引和四个有界结构会增加父请求前缀成本。工具结果返回摘要，不返回全部股票行。

#### KV Cache 影响

只要插件可见性和部署上限不变，前缀就保持稳定。生成的哈希与摘要属于当前轮数据，不改变固定提示。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **仅前台执行**——取得过程有界，但尚未作为持久后台任务运行。
- **有界线性目录扫描**——列表直接校验文件；大型归档需要独立的不可变索引。
- **必须支持发现**——模型触发的生成会拒绝只能加载已知身份的适配器。
- **仅日级事实**——本包不生成盘中快照。
- **没有变更工具**——删除、覆盖、源数据修复、券商和组合操作均刻意缺席。

### 开发备注

<a id="dev-note"></a>

<details>
<summary>维护者工作上下文——点击展开</summary>

保持事实取得与战略解释分离。新增能力应成为权限最小的独立工具，而不是扩大生成工具。

</details>
