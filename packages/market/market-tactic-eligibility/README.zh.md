---
description: "MAOQ P3 的确定性战法定义、晋级状态与失败关闭战略资格门禁。"
kind: "package-library"
---

# @deepseek-ai/dsh-market-tactic-eligibility

[English](README.md) | 中文

## 概述

`dsh-market-tactic-eligibility` 把一份可稳定回放的 P2 战略特征记录转化为带版本的 P3 战法资格记录。每条战法定义、晋级状态、门禁和执行要求均由宿主拥有。研究候选可以适合当前状态，但不能因此获得资格；在主动战法通过已声明评估协议前，`defensive_no_trade` 始终是唯一生产安全回退。

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

请在 `dsh-market-strategic-state` 产出完整确定性特征记录后、任何 P4 个股排序前调用 `evaluateTacticEligibility(features)`。该函数返回深度冻结的门禁结果、合格板块 ID、稳定原因码、研究候选，以及准确的合格战法集合。

```text
const eligibility = evaluateTacticEligibility(features)
```

初始注册表包含状态签名突破回踩、可成交情绪龙头、行业相对超跌修复和防守／空仓。前三者有意保持 `research`；即使状态匹配，也只能产生 `research_only`，绝不会产生 `eligible`。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

每个主动战法首先要求市场状态、情绪周期和板块战场组件均已就绪。随后，战法专属标签门禁约束适用环境；只有排名第一的板块得分为正，结果才会暴露板块 ID。结果将状态适配与晋级状态分开，因此模型叙事不能让研究项目晋级。证据缺失会让主动战法失败关闭，同时继续保留防守选项。

上游日线流水线在 `Asia/Shanghai` 19:00 自动更新；MAOQ 运行时会在 19:15 首次检查完整的当日不可变快照。本包只读取已经冻结的特征记录，既不负责调度数据取得，也不会把定时器触发等同于数据就绪。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [市场战法资格子系统](../../../docs/subsystems/market-tactic-eligibility.zh.md)——约定与失败语义。
- [P3 战法研究](../../../docs/maoq-p3-tactic-research.zh.md)——证据、候选选择与晋级协议。
- [市场战略状态](../market-strategic-state/README.zh.md)——确定性 P2 输入。
- [MAOQ 路线图](../../../docs/maoq-roadmap.zh.md)——P3 与 P4 边界。

-----

<a id="model-experience"></a>
## 模型体验

间接影响模型：面向模型的消费方负责呈现选定门禁结果，并拥有全部提示词或工具 schema。

#### KV Cache 影响

本包本身没有影响。它不注册提示词或工具；消费方负责呈现资格记录所产生的缓存影响。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **研究状态是有意设计**——主动战法必须通过自身符合 A 股真实约束的 walk-forward 评估，才可能获得资格。
- **只有 P2 状态**——个股级形态、流动性、可交易性和执行门禁属于 P4，本包尚未实现。
- **只有日频**——盘中情绪转换和排队位置需要独立的时点正确约定。
- **休市识别在上游**——没有当日快照时，自动运行时不会启动模型工作；本纯函数库不拥有交易日历。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作背景——点击展开</summary>

晋级属于受源码控制的策略变更。禁止根据模型置信度、单一回测标题数字或匹配的市场标签推导晋级。

</details>
