---
description: "用于动态选择专家、结构化综合与独立风险否决的有界 MAOQ 决策议事组。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-maoq-decision

[English](README.md) | 中文

## 概述

`dsh-tool-maoq-decision` 向统帅提供证据约束的 `maoq_analyze_strategy` 工具和较底层的 `maoq_decide` 议事组诊断。战略工具先从不可变快照计算确定性市场状态、情绪周期和板块战场特征，再运行所选专家。新的子 Agent 综合主要矛盾，另一个独立风险子 Agent 可以否决，宿主会拒绝未知证据或虚构的毛选方法归因。本包在 P2 不排序股票，也不能发出实盘订单。

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

调用 `maoq_analyze_strategy` 时传入当前快照哈希、至少两个历史快照哈希、显式决策时间、最大特征时效、具体目标和最小充分的有序专家子集。P2 角色为 `market_regime`、`emotion_cycle`、`policy_macro`、`sector_battlefield` 和 `tactic_selection`。部署默认最多允许四位专家。

战略结果分开保存确定性特征与解释。报告与综合必须引用精确快照证据，包含反证和可证伪切换条件，并说明每个所选毛选方法的本次应用与适用边界。宿主通过允许目录提供篇名和释义原则。过期或残缺特征只能产生 `no_trade`，独立风险结论决定最终是否可行动。

| 字段 | 默认值 | 含义 |
|---|---|---|
| `subagentProvider` | `spawn` | 每个子 Agent 使用的新鲜结构化输出提供者。 |
| `maxSpecialists` | `4` | 所选专家数量的部署上限。 |
| `maxResultChars` | `32768` | 返回父 Agent 的渲染文本上限。 |

<a id="understand-the-implementation"></a>
## 理解实现

编排脚本、结构定义、提供者路由和子 Agent 上限均由部署拥有。战略路径在任何子 Agent 运行前按精确哈希加载快照并计算带版本特征。所选专家通过 `Promise.all` 并行运行，综合与风险审查随后由相互独立的新 Agent 完成。每个子 schema 都会枚举该份特征记录中可用的精确证据引用；宿主仍会拒绝角色漂移、改写确定性标签、未知证据引用、未识别方法 ID、矛盾风险字段，以及任何让过期或残缺输入变得可行动的尝试。

Loader 组合夹具证明两个工具会随 Profile 服务加载。聚焦工作流夹具证明所选角色保持有界，证据引用闭合于确定性目录，解析后的回答会写明毛选来源篇目，并且独立否决保持最终效力。

-----

<a id="further-exploration"></a>
## 延伸阅读

- [战略状态库](../../market/market-strategic-state/README.zh.md)——确定性标签、证据地址和归因目录。
- [市场快照](../../market/market-snapshot/README.zh.md)——按哈希加载的不可变输入。
- [MAOQ 路线图](../../../docs/maoq-roadmap.zh.md)——P2 范围与验收标准。

<a id="model-experience"></a>
## 模型体验

### 系统提示与工具结构

#### 模型看到的内容

父 Agent 会看到简短指引：对快照约束的决策使用 `maoq_analyze_strategy`，保留确定性特征与毛选方法归因，并把风险否决视为最终结论；同时看到生成的[工具结构](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-maoq-decision)。固定脚本和子 Agent 结构不能由模型选择。

##### MAOQ 决策指引

```markdown
For a strategic market decision grounded in an immutable snapshot, call maoq_analyze_strategy with the smallest sufficient specialist set. Its deterministic market regime, emotion cycle, sector battlefield features, evidence references, Mao method attributions, and independent risk veto are binding. Use maoq_decide only for council-runtime diagnostics. Neither tool can place a live order or rank stocks in the P2 strategic-state phase.
```

#### Token 影响

父请求承担少量固定指引和两个结构的前缀成本。每次战略调用还会呈现所选确定性特征记录；子 Agent 成本随证据规模、所选专家数增长，并固定增加综合与风控两个子 Agent。

#### KV Cache 影响

只要插件可见性不变，父请求前缀保持稳定。议事组中的每个子 Agent 都是新上下文，缓存彼此独立。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- **仅研究与模拟决策** — 不具备券商、组合变更或实盘订单权限。
- **仅日级状态** — 盘中切换需要独立的时点特征契约。
- **板块持续性需要历史** — 少于两个兼容历史快照会强制 `no_trade`。
- **P2 不排序股票** — `maoq_analyze_strategy` 止于板块战场和战略姿态；候选选择属于 P3。
- **风险审查仍由模型给出** — 宿主保证否决一致性，但确定性的组合数值约束需要未来的风险引擎。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
