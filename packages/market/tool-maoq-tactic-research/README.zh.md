---
description: "用于发现固定研究战法，并以经过质量门控的日线历史评估单一战法的有界 MAOQ 工具。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-maoq-tactic-research

[English](README.md) | 中文

## 概述

`dsh-tool-maoq-tactic-research` 让 MAOQ 统帅发现固定的带版本战法，并且每次只运行一项确定性历史试验。每项试验以流式方式读取经过质量门控的日线数据，使用统一的 A 股次日开盘执行方式，报告按时间折与成本翻倍结果，并保留准确来源哈希。所有结果都保持为研究证据，不能授权实盘交易。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

请在 `dsh-market-tactic-lab` 和至少一个已注册的 `TacticLabHistoryAdapter` 之后挂载本工具。MAOQ Profile 允许生产 MySQL 历史适配器，要求每个交易时段至少包含 3,000 只股票，每个分块读取 30 个交易时段，并把单次调用限制在五年日历区间内。

```yaml
- id: tool-maoq-tactic-research
  name: '@deepseek-ai/dsh-tool-maoq-tactic-research'
  config:
    allowedAdapters:
      - long-short-stock-history-mysql
    minimumStocks: 3000
    chunkSessions: 30
    maxRangeDays: 1827
    evaluationTimeoutMs: 900000
    recentSignalLimit: 10
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `allowedAdapters` | `long-short-stock-history-mysql` | 模型可以评估的历史来源。 |
| `minimumStocks` | `3000` | 每个获准交易时段必须具备的完整股票行数。 |
| `chunkSessions` | `30` | 每个提供方分块最多流式返回的交易时段数。 |
| `maxRangeDays` | `1827` | 单次调用允许的最大闭区间日历跨度。 |
| `evaluationTimeoutMs` | `900000` | 前台评估超时。 |
| `recentSignalLimit` | `10` | 紧凑报告返回的最近非空信号日期数。 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-maoq-tactic-research)是完整字段参考。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

`maoq_tactic_research_sources` 无需扫描数据库，即可列出已注册历史来源和全部三项固定战法版本。`maoq_tactic_backtest` 接收一个获准来源、一项固定战法 id 和一个闭区间日期范围。工具强制执行部署所有的质量与范围上限，只以流式方式读取所选适配器一次，并返回数量、绩效统计、按时间折、最近非空候选信号、内容哈希与晋级阻断项，而不是完整权益曲线或全部市场行。

模型不能降低股票数量下限、放大分块或日期区间、改变组合构建、调整信号阈值，也不能移除成本翻倍回放。取消会在下一历史分块前停止；已在执行中的数据库查询需要先由提供方返回，工具才能观察到取消。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [市场战法实验室](../market-tactic-lab/README.zh.md)——统一历史、信号、执行与评估语义。
- [MySQL 行情适配器](../market-snapshot-mysql/README.zh.md)——生产环境中经过质量门控的历史提供方。
- [P3 战法研究](../../../docs/maoq-p3-tactic-research.zh.md)——证据与晋级策略。

-----

<a id="model-experience"></a>
## 模型体验

### 系统提示与工具 schema

#### 模型看到的内容

统帅会看到两个生成的[工具 schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-maoq-tactic-research)以及以下稳定工作流指引。

##### MAOQ 战法研究指引

```markdown
Use maoq_tactic_research_sources before a historical evaluation when the source or tactic is unknown. Run maoq_tactic_backtest for one fixed tactic and the smallest sufficient date range; do not run all tactics by habit because each call scans quality-gated daily history. Treat every result as research evidence, preserve source hashes and promotion blockers, and never infer live-trading approval from Sharpe alone.
```

#### Token 影响

一段较短的稳定指引和两个有界 schema 会增加父请求前缀成本。完成的试验会增加一份紧凑 JSON 报告；有界分块哈希保留准确来源证据，而上下文只接收执行交易时段数量。股票行、逐交易时段哈希和完整权益曲线不会进入模型结果。

#### KV Cache 影响

只要工具可见性和部署上限不变，前缀就保持稳定。试验报告属于当前轮数据，不会修改固定提示前缀。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **前台评估**——长区间历史扫描有界，并可在分块间取消，但尚不是持久后台任务。
- **每次一项战法**——比较全部战法需要显式串行调用，防止模型意外并发触发三次全历史扫描。
- **仅日线执行**——报告不能模拟盘中止损、集合竞价排队优先级或成交量参与。
- **仅研究状态**——晋级前仍必须在本工具之外补齐 Deflated Sharpe、PBO、市场状态利润集中度与容量证据。
- **紧凑模型结果**——完整成交、拒绝、信号与权益点保留在评估器内存中，本包不会持久化这些内容。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

质量下限和组合构建应留在部署或评估器代码中。不要暴露能降低证据质量，或者在观察结果后调整试验的模型参数。

</details>
