---
description: "面向 MAOQ P3 的时点正确日线研究特征与统一真实 A 股模拟执行策略。"
kind: "package-library"
---

# @deepseek-ai/dsh-market-tactic-lab

[English](README.md) | 中文

## 概述

`dsh-market-tactic-lab` 为 MAOQ 战法研究提供统一的测量和执行基础。它为有界的复权特征交易时段与原始执行交易时段对生成内容地址，计算日线研究特征，并且只允许收盘后生成的订单在次一市场交易时段开盘成交，同时显式执行 A 股交易规则和成本。

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

请把有序或无序的不可变日线交易时段传给 `computeDailyHistoryFeatures()`。最新交易时段定义决策日期；个股交易时段缺失时，受影响窗口会返回 `null`，不会跳过缺口。板块相对收益要求该股票在完整窗口内始终属于同一个时点正确板块。

```text
const features = computeDailyHistoryFeatures(snapshots)
```

历史提供方实现 `TacticLabHistoryAdapter`，并以流式方式返回有界 `TacticLabHistoryChunk`。`buildTacticLabHistoryChunk()` 校验日期一一对应关系，对来源版本排序，记录首尾日期，并冻结 SHA-256 内容地址，使评估器无需把多年全市场数据全部保存在内存中，也能引用精确输入。

请把另一份包含每日精确涨跌停价的未复权原始执行序列，以及收盘后生成的订单传给 `simulateNextOpenExecution()`。默认策略从模拟现金开始，并采用保守的显式成本。订单只在次一市场交易时段尝试一次成交，否则记录一个稳定拒绝原因。

```text
const result = simulateNextOpenExecution(snapshots, orders)
```

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

快照个股价格已经由取得适配器完成复权，因此研究会直接使用这些价格，绝不重复应用复权因子。成交量和成交额保持原始值。特征窗口按市场交易时段推进，要求个股观察完整，引用不可变输入，并且从不读取环境时钟。板块多交易时段收益会复合每个交易时段的相对板块水平，不会把这些单日水平误当作连续指数。

执行使用未复权原始价格。交易时段 `t` 收盘后生成的订单最早只能在 `t+1` 成交；缺少行情或停牌时不会顺延到之后更有利的交易时段。开盘涨停的买单和开盘跌停的卖单均被拒绝。滑点相对开盘价计算，并限制在当日观察区间内。持仓保留取得日期，卖出检查强制执行 T+1，最终权益使用最新观察到的未复权收盘价标记剩余股份。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [市场战法实验室子系统](../../../docs/subsystems/market-tactic-lab.zh.md)——特征与执行语义。
- [P3 战法研究](../../../docs/maoq-p3-tactic-research.zh.md)——候选证据与晋级协议。
- [市场快照](../market-snapshot/README.zh.md)——不可变日线输入。
- [市场战法资格](../market-tactic-eligibility/README.zh.md)——个股排序前的状态与晋级门禁。

-----

<a id="model-experience"></a>
## 模型体验

无。本宿主侧库不会增加模型可见上下文或工具。

#### KV Cache 影响

无。后续消费方负责向模型呈现任何选定特征或结果。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **尚无运行时历史消费方**——`dsh-market-snapshot-mysql` 已提供生产只读适配器，但评估器与模型可见研究工具尚未挂载它。
- **只有一种次日开盘订单**——盘中止损、集合竞价、排队优先级和成交量参与需要独立的带版本执行策略。
- **没有组合优化器**——回放强制执行现金与持仓约束，但不选择权重、战法或订单。
- **没有绩效统计**——walk-forward 折、夏普、Deflated Sharpe、PBO、回撤和容量报告属于下一评估层。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作背景——点击展开</summary>

比较时所有战法必须共享这套执行策略。战法专属成交捷径属于评估变更，需要新的引擎版本，不能只是本地回测选项。

</details>
