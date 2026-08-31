---
description: "确定性的 MAOQ 市场状态、情绪周期、板块战场特征与证据约束的毛选方法依据。"
kind: "package-library"
---

# @deepseek-ai/dsh-market-strategic-state

[English](README.md) | 中文

## 概述

`dsh-market-strategic-state` 让调用者从不可变快照计算可回放的市场状态、情绪周期和板块战场特征。每个状态都引用精确快照字段，并在所需观察不可用时独立失败。独立校验器把模型解释约束到这些证据引用，并通过宿主拥有的归因目录补全获准毛选方法 ID。本库只排序板块；它既不排序股票，也不授权订单。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

### 何时使用

在 `dsh-market-snapshot` 已冻结当前决策截止点，且至少有两个历史快照可计算板块持续性时使用本库。还需要模型解释、专家聚合或风险审查时，使用 `dsh-tool-maoq-decision` 等面向模型的消费者。

### 入口

确定性入口接收不可变当前快照和显式历史。解释入口接收所得特征记录、结构化草稿、显式决策时间和最大时效；它拒绝未知证据引用，并强制过期或残缺输入采用 `no_trade`。

```text
const features = computeStrategicFeatures(current, history)
const state = buildStrategicStateRecord(features, interpretation, decisionTime, maximumAgeHours)
```

成功会返回深度冻结的确定性层和解释层。校验失败会抛出 `StrategicInterpretationValidationError`；不可用的确定性组件保持为带类型结果，而不会变成虚构默认值。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

特征引擎从当前市场宽度与情绪观察计算市场和情绪标签。板块比较加入显式历史快照，检查分类兼容性，并计算强度、持续性、容量、催化支持、内部宽度、龙头质量、拥挤度和阻力。每个观察在解释前都获得稳定的 `snapshot:<hash>#<path>` 地址。

面向模型的草稿不能提供来源篇名或引文。它选择方法 ID，并说明本次应用、证据引用和适用边界；宿主把 ID 解析为固定篇名、来源 URL 和释义原则。因此归因与市场证据都不受模型控制。

| 文件 | 职责 |
|---|---|
| [`src/features.ts`](src/features.ts) | 确定性标签、板块维度和证据目录 |
| [`src/interpretation.ts`](src/interpretation.ts) | 证据、时效、姿态和置信度校验 |
| [`src/mao-methods.ts`](src/mao-methods.ts) | 允许使用的篇名与释义原则 |
| [`src/types.ts`](src/types.ts) | 带版本特征与解释契约 |

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [战略状态子系统](../../../docs/subsystems/market-strategic-state.zh.md)——标签、证据引用和失败语义。
- [市场快照](../market-snapshot/README.zh.md)——本库消费的不可变观察。
- [MAOQ 决策工具](../../workflow/tool-maoq-decision/README.zh.md)——模型解释与独立风险审查。
- [MAOQ 路线图](../../../docs/maoq-roadmap.zh.md)——P2 范围与验收标准。

-----

<a id="model-experience"></a>
## 模型体验

间接影响模型：面向模型的消费者呈现所选特征记录，并拥有全部提示词或工具结构。

#### KV Cache 影响

本库自身没有影响。它不注册提示词或工具；每个消费者拥有呈现特征记录带来的缓存影响。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制保持确定性观察与解释、执行相分离。

- **仅日级特征** — 盘中切换需要独立的时点输入契约。
- **板块持续性需要两个历史快照** — 历史更短时只有板块组件不可用，并阻止产生可行动姿态。
- **带版本阈值属于策略** — 阈值变化需要新的引擎版本和更新后的金标夹具。
- **归因均为释义** — 目录提供来源篇目和方法摘要，不声称给出特定版本的逐字引文。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
