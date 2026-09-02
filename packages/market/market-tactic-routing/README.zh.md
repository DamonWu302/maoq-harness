---
description: "构建符合截止点的 MAOQ 战绩、确定性战法名单与经过校验的统帅决策，无需重新扫描完整市场历史。"
kind: "package-library"
---

# @deepseek-ai/dsh-market-tactic-routing

[English](README.md) | 中文

## 概述

`dsh-market-tactic-routing` 把已经结束的战法结果归因到原决策截止点可知的战略事实，持久化不可变结果与聚合代际，并从一份有界战绩中路由当前合格战法。它还把统帅受名单约束的建议与独立否决校验并持久化为一份可回放决策。确定性路由器不使用模型；主动证据不足时，`defensive_no_trade` 始终可用。

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
const decision = createTacticCommanderDecision(route, proposal, risk)
```

成功时会返回不可变且带内容地址的记录。未来可见结果、不兼容战法版本、未推进的截止点、不匹配的资格记录、残缺战略事实、晚于决策截止点的战绩、名单外战法或矛盾的否决都会失败关闭。`TacticRoutingStore` 按 UTC 可用日期发布结果，并按内容身份发布战绩、名单与统帅决策；有界区间读取只取得两个战绩截止点之间的分区。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

路由环境使用市场状态、情绪周期、头部板块结构、由状态派生的波动区间、头部板块拥挤度，以及调用方提供的执行质量区间。每个单元保存充分统计量、近期有效性的指数平均和最近可见时间。因此，增量更新无需在战绩中保存原始日线。

v2 路由器选择达到八个成熟样本的最窄证据层：精确环境，其次是市场状态加情绪周期，最后是同一市场状态。它绝不跨市场状态借用证据。合并后的收益、风险和执行指标依据充分统计量重新计算；近期有效性按各单元样本数加权。证据层越宽，环境对齐得分越低。主动战法仍然需要为正的 95% 期望下界、为正的翻倍成本期望、不低于 50% 的成交率，以及为正的最终得分。研究战法可以进入研究名单，但模拟仓位上限仍为零。

统帅校验根据所选名单候选派生范围与仓位上限，不接受模型自行声明的权限。即使三项主动战法占满名单，仍然可以通过名单回退选择 `defensive_no_trade`。否决会把最终选择替换为防守，不能被表示为已经批准的主动行动。

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

通过向模型呈现有界名单并持久化校验结果的 P2 消费方间接影响模型。本库不注册提示词或工具，也从不调用模型。

#### KV Cache 作用

无。未来消费方负责把选定名单文本加入模型上下文。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **不强制参与**——证据阶梯用于修复精确单元稀疏，但同状态证据仍然缺失或为负时，不会虚构主动名单。
- **不跨状态迁移**——牛市状态学到的证据不能让战法在收缩、修复、轮动或高波分歧状态中取得资格。
- **结果事实由执行或回放提供**——本库校验并归因已经结束的结果，但不会根据战略特征虚构收益。
- **历史模型覆盖由外部提供**——本库校验传入的建议与否决，但不生成历史模型决策；回放会报告缺失覆盖，不进行插补。
- **没有实盘订单权限**——已晋级名单仍然只是模拟风险上限，不是券商指令。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
