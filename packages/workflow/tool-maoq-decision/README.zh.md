---
description: "用于动态选择专家、结构化综合与独立风险否决的有界 MAOQ 决策议事组。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-maoq-decision

[English](README.md) | 中文

## 概述

`dsh-tool-maoq-decision` 向统帅提供一个 `maoq_decide` 工具。调用者从六种市场角色中选择最小且充分的有序子集；被选专家并行研究，新的子 Agent 综合为结构化模拟决策，另一个独立的新风险 Agent 可以否决。宿主的确定性校验会保留该否决。本包不能发出实盘订单。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

调用 `maoq_decide` 时传入具体 `objective` 和有序 `specialists` 子集。可选角色为 `market_regime`、`emotion_cycle`、`policy_macro`、`sector_battlefield`、`tactic_selection`、`stock_research`。部署默认最多允许四位专家，迫使统帅按问题选择，而不是惯性全员出动。

结果包含所选角色、规范化专家报告、一份决策、一份风险审查以及 `approved` 或 `vetoed` 状态。专家报告必须给出证据、反证、置信度和失效条件；决策必须给出市场状态、主要矛盾、战场、战术、动作、候选和失效条件。

| 字段 | 默认值 | 含义 |
|---|---|---|
| `subagentProvider` | `spawn` | 每个子 Agent 使用的新鲜结构化输出提供者。 |
| `maxSpecialists` | `4` | 所选专家数量的部署上限。 |
| `maxResultChars` | `32768` | 返回父 Agent 的渲染文本上限。 |

<a id="understand-the-implementation"></a>
## 理解实现

编排脚本、结构定义、提供者路由和子 Agent 上限均由部署拥有；模型只能提供目标和角色子集。所选专家通过 `Promise.all` 并行运行，综合与风险审查随后由相互独立的新 Agent 完成。宿主会解码返回对象，并拒绝角色漂移、畸形决策、矛盾的风险字段，以及任何把否决包装成批准的尝试。

真实 Loader 的无密钥夹具记录了完整 Agent 循环：选择两种角色时，只启动这两位专家以及综合和风控，并最终返回独立否决。

<a id="model-experience"></a>
## 模型体验

### 系统提示与工具结构

#### 模型看到的内容

父 Agent 会看到简短指引：选择最小充分议事组，并把风险否决视为本轮最终结论；同时看到生成的 [`maoq_decide` 结构](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-maoq-decision)。固定脚本和子 Agent 结构不能由模型选择。

##### MAOQ 决策指引

```markdown
For a market decision, identify the current question and call maoq_decide with the smallest sufficient specialist set. Do not invoke every specialist by default. Treat its independent risk veto as final for that run. The result is analysis or a paper decision only; it cannot place a live order.
```

#### Token 影响

父请求承担少量固定指引和结构成本；子 Agent 成本随所选专家数增长，并固定增加综合与风控两个子 Agent。

#### KV Cache 影响

只要插件可见性不变，父请求前缀保持稳定。议事组中的每个子 Agent 都是新上下文，缓存彼此独立。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- **仅研究与模拟决策** — 不具备券商、组合变更或实盘订单权限。
- **证据质量取决于上游** — 议事组能规范推理，但不能让过期或残缺的市场输入变得可信。
- **每次调用一轮议事** — 长期记忆、状态切换跟踪与定时重评留给后续 Profile 层。
- **风险审查仍由模型给出** — 宿主保证否决一致性，但确定性的组合数值约束需要未来的风险引擎。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

后续层可以加入不可变每日快照和确定性组合风控服务，而不改变本工具的权限边界。

</details>
