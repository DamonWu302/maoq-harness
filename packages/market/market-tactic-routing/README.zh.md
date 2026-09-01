---
description: "构建符合截止点的 MAOQ 条件战绩与确定性前三战法名单，无需重新扫描完整市场历史。"
kind: "package-library"
---

# @deepseek-ai/dsh-market-tactic-routing

[English](README.md) | 中文

## 概述

`dsh-market-tactic-routing` 把已经结束的战法结果归因到原决策截止点可知的战略事实，持久化不可变结果与聚合代际，并从一份有界战绩中路由当前合格战法。路由器最多输出三项目录战法，同时提供分数组成、证据引用、拒绝原因、风险上限和现金下限。它不使用模型；主动证据不足时，`defensive_no_trade` 始终可用。

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

### 何时使用

请在 P0 资格评估之后、P2 模型辅助综合之前使用本库。已经结束的模拟或回放结果通过 `attributeMaturedTacticOutcome()` 进入；该函数接收原始 `StrategicFeatureRecord`，派生固定环境分桶并绑定当前目录版本。`advanceTacticScorecard()` 只接受上一截止点之后新近可见的结果。随后，`routeEligibleTactics()` 读取聚合代际，不读取原始结果或完整日线历史。

### 入口

```text
const outcome = attributeMaturedTacticOutcome(completed)
const next = advanceTacticScorecard(previous, [outcome], cutoffTime)
const route = routeEligibleTactics(features, eligibility, next)
```

成功时会返回不可变且带内容地址的记录。未来可见结果、不兼容战法版本、未推进的截止点、不匹配的资格记录、残缺战略事实，以及晚于决策截止点的战绩都会失败关闭。`TacticRoutingStore` 按 UTC 可用日期发布结果，并按内容身份发布战绩；有界区间读取只取得两个战绩截止点之间的分区。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

v1 环境使用市场状态、情绪周期、头部板块结构、由状态派生的波动区间、头部板块拥挤度，以及调用方提供的执行质量区间。每个单元保存充分统计量、近期有效性的指数平均和最近可见时间。因此，增量更新无需在战绩中保存原始日线。

主动战法需要八个同环境成熟样本、为正的 95% 期望下界、为正的翻倍成本期望、不低于 50% 的成交率，以及为正的最终得分。固定分数合并状态适配、条件期望、精确环境对齐、近期有效性、执行与翻倍成本证据，再扣除回撤、拥挤、状态转换和样本不确定性惩罚。研究战法可以进入研究名单，但模拟仓位上限仍为零。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [市场战法路由子系统](../../../docs/subsystems/market-tactic-routing.zh.md)——结果可见性、聚合代际与路由语义。
- [市场战法资格](../market-tactic-eligibility/README.zh.md)——共享目录与硬环境门禁。
- [动态战术统帅层](../../../docs/maoq-dynamic-tactic-commander.zh.md)——P0-P2 架构与验收标准。

-----

<a id="model-experience"></a>
## 模型体验

通过未来向模型呈现有界名单的 P2 消费方间接影响模型。本库不注册提示词或工具，也从不调用模型。

#### KV Cache 作用

无。未来消费方负责把选定名单文本加入模型上下文。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **只使用精确环境**——v1 不从相邻或更宽泛的环境单元借用证据；缺少精确证据时会保留不确定性并选择防守。
- **结果事实由执行或回放提供**——本库校验并归因已经结束的结果，但不会根据战略特征虚构收益。
- **尚未比较模型**——P2 负责 DSH 辅助选择，以及相对本确定性路由的增量归因。
- **没有实盘订单权限**——已晋级名单仍然只是模拟风险上限，不是券商指令。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
