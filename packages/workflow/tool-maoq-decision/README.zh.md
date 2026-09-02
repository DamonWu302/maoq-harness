---
description: "构建证据约束的 MAOQ 战略状态与受名单约束的战法决策，并执行独立风险否决。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-maoq-decision

[English](README.md) | 中文

## 概述

`dsh-tool-maoq-decision` 向统帅提供规范化每日战略状态工具与 `maoq_select_tactics`；后者把最新已批准状态和一份有界条件战绩转化为受名单约束的战法决策。战略快速研判使用一个综合子 Agent 和一个独立风控子 Agent；深度研判会先运行所选专家。只有主动战法合格时，战法选择才恰好启动两个全新子 Agent；只有防守的名单不会启动 Agent。宿主拒绝陈旧状态、未知证据、扩大名单、虚构晋级、矛盾否决和研究战法的模拟敞口。本包不排序股票，也不能发出实盘订单。

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

常规市场状态应无参数调用 `maoq_state_refresh_daily`。它为最近三个不同交易日各选择最新快照，采用稳定的每日目标，固定使用 `market_regime`、`emotion_cycle` 和 `sector_battlefield` 三种视角，从当前快照截止点派生决策时间，并采用部署拥有的时效上限。最新快照发生修订时会生成新身份并让旧镜像失效；用户换一种问法不会改变每日身份。

启用 `autoDailyRefresh` 后，第一个未来创建的实时根 Agent 会持有一个可释放的上海市场计时器。工作日到达 `dailyRefreshTime` 后，它只在配置窗口内低成本检查当日快照，并且只对未处理过的内容哈希启动战略工作流。同日快照修订会产生一份新的规范化决策；哈希不变不会启动子 Agent。进程在窗口结束后启动时只补做一次检查。休市日的最新快照日期与上海日历日期不一致，因此不会产生模型工作。

战略结果分开保存确定性特征与解释。报告与综合必须引用精确快照证据，包含反证和可证伪切换条件，并说明每个所选毛选方法的本次应用与适用边界。宿主通过允许目录提供篇名和释义原则。过期或残缺特征只能产生 `no_trade`，独立风险结论决定最终是否可行动。读取当前状态时还会返回 `freshness`；只要 `currentUseAllowed` 为 false，调用方就必须把这份不可变决策当作历史记录。

存在已批准且可行动的状态后，无参数调用 `maoq_select_tactics`。宿主重新检查时效，派生硬资格，只加载状态截止点可见的最新战绩，并构建确定性前三名单。统帅可以从名单选择一个主战法和一个可选辅助战法；`defensive_no_trade` 始终作为回退可用。独立审查者拥有最终否决权。名单与经过校验的决策持久化到 `tacticStateRoot`；无论模型如何表述，研究战法的模拟敞口都保持为零。

| 字段 | 默认值 | 含义 |
|---|---|---|
| `subagentProvider` | `spawn` | 每个子 Agent 使用的新鲜结构化输出提供者。 |
| `maxSpecialists` | `4` | 所选专家数量的部署上限。 |
| `maxResultChars` | `32768` | 返回父 Agent 的渲染文本上限。 |
| `analysisMode` | `quick` | `quick` 运行综合与独立风控；`deep` 额外生成所选专家报告。 |
| `stateRoot` | `.maoq/decisions` | 保存不可变战略决策镜像的目录。 |
| `tacticStateRoot` | `.maoq/tactics` | 保存不可变战绩、名单与统帅决策的目录。 |
| `maxStateFiles` | `500` | 最新和历史查询允许扫描的最大文件数。 |
| `maxTacticStateFiles` | `500` | 为解析截止点可见最新代际而检查的最大战绩文件数。 |
| `maxSnapshotFiles` | `500` | 为核验最新可用市场输入而扫描的不可变快照上限。 |
| `dailyStateMaximumAgeHours` | `24` | 宿主拥有的每日标准状态最大时效。 |
| `autoDailyRefresh` | `false` | 让未来创建的实时根 Agent 在收盘后维护规范化状态。 |
| `dailyRefreshTime` | `19:15` | 上游 19:00 日线更新后，在固定 `Asia/Shanghai` 市场时区中的首次自动检查时间。 |
| `dailyRefreshRetryMinutes` | `15` | 刷新窗口内低成本快照检查的间隔。 |
| `dailyRefreshWindowMinutes` | `120` | 接受延迟或同日修订快照的时间窗口。 |

<a id="understand-the-implementation"></a>
## 理解实现

编排脚本、结构定义、提供者路由和子 Agent 上限均由部署拥有。每日路径先把可变的会话意图规范化为一个固定请求。它的计时器会等待一个确切根 Agent 空闲，把维护任务的取消信号传入与手动工具相同的战略函数，并在插件卸载完成前取消仍在运行的分析。共享战略路径再根据目标、快照哈希、决策时间、时效上限、专家集合、分析模式、特征／工作流版本、提供方路由，以及可用的 Codex 提供方设置指纹派生 SHA-256 决策 ID。若存在匹配的持久化记录，则立即以 `cacheHit: true` 和 `agentsStarted: 0` 返回。未命中时才按精确哈希加载快照、计算带版本特征、运行所选工作流，并在该 ID 下原子发布已完成结果；失败工作流不会缓存。快速模式把所选角色作为综合分析视角，只启动综合与独立风控两个子 Agent。深度模式先通过 `Promise.all` 并行运行所选专家，再运行同样的两个新 Agent。每个子 schema 都会枚举该份特征记录中可用的精确证据引用；宿主仍会拒绝角色漂移、改写确定性标签、未知证据引用、未识别方法 ID、矛盾风险字段，以及任何让过期或残缺输入变得可行动的尝试。可选设置提供方会公开 `maoq-decision`；修改设置会取消正在进行的自动尝试、清除进程内完成标记，并在无需重启的情况下作用于下一次调用。

最新与按 ID 查询工具会在不修改镜像的前提下判断当前可用性。它们从宿主目录自动解析在截止时间前最新的快照，不信任模型传入的哈希。超过最大时效、快照无法核验或已经改变、特征／工作流版本漂移、分析模式改变、提供方路由或提供方设置改变，都会返回 `freshness.status: stale`、`currentUseAllowed: false` 和明确原因。记录仍可用于回放，但不能悄悄变成当前建议。

战法选择会在调用工作流前发布确定性名单。只有防守的名单直接创建并持久化宿主决策。主动名单只把候选、防守回退、分数、证据引用、范围与风险上限交给固定的双 Agent 工作流。由于 worker schema 子集使用可选字符串而非可空类型联合，可选辅助字段会在结构化输出后规范化为 `null`。路由库随后派生最终范围、现金下限和最大模拟仓位，并且只在宿主校验后发布决策。

Loader 组合证明战略工具与战法选择器会随 Profile 服务加载。战法组合会创建一份新鲜战略镜像，路由合格主动研究战法，恰好启动两个子 Agent，并持久化研究范围决策。聚焦夹具证明证据闭合、陈旧状态拒绝、防守回退、宿主派生范围、token 统计和最终否决。较底层的 `maoq_decide` 诊断继续把共享战法目录用作结构化枚举。

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

父 Agent 会看到简短指引：先读取持久化状态工具，仅在不存在匹配状态时使用 `maoq_analyze_strategy`，只在状态已批准且可行动后调用 `maoq_select_tactics`，保留确定性证据，并把风险否决视为最终结论；同时看到生成的[工具结构](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-maoq-decision)。固定脚本和子 Agent 结构不能由模型选择。

##### MAOQ 决策指引

```markdown
For current-state questions, call maoq_state_latest first. A persisted mirror is current only when freshness.currentUseAllowed is true. If it is missing or stale and at least three trading-day snapshots exist, call maoq_state_refresh_daily; the host fixes its objective, snapshot window, specialist lenses, decision time, and age policy, and exact repeats start no agents. Use maoq_state_history for multi-day review and maoq_state_get for one exact mirror. Call maoq_analyze_strategy only for an explicitly ad-hoc question that the canonical daily state does not answer, using the smallest sufficient specialist set. After an approved actionable daily state, call maoq_select_tactics to consume only the host-built deterministic top-three route; its promotion scope, evidence allowlist, risk ceilings, and independent risk veto are binding. Use maoq_decide only for council-runtime diagnostics. None of these tools can place a live order.
```

#### Token 影响

父请求承担少量固定指引和六个结构的前缀成本。战略缓存未命中时，工作流会看到所选确定性特征记录。精确缓存命中和三个状态查询都不会启动子 Agent。战略快速模式未命中时承担两个子上下文；深度模式会为每位所选专家增加一个上下文。主动战法选择再承担两个全新上下文，确定性防守则不启动 Agent。提供方未返回用量时会增加 `unavailableCalls`，不会估算。

#### KV Cache 影响

只要插件可见性不变，父请求前缀保持稳定。议事组中的每个子 Agent 都是新上下文，缓存彼此独立。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- **仅研究与模拟决策** — 不具备券商、组合变更或实盘订单权限。
- **仅日级状态** — 盘中切换需要独立的时点特征契约。
- **板块持续性需要历史** — 少于两个兼容历史快照会强制 `no_trade`。
- **P2 不排序股票** — `maoq_analyze_strategy` 止于板块战场和战略姿态；候选选择属于 P3。
- **风险审查仍由模型给出** — 宿主保证否决一致性，但确定性的组合数值约束需要未来的风险引擎。
- **不插补历史模型价值** — 确定性名单无需模型调用即可回放；统帅与否决表现需要匹配的已记录决策，否则保持为空仓。
- **没有交易所休市日历或快照推送事件** — 工作日计时器依赖快照交易日避免休市日模型工作，并在下一次配置检查时发现修订，而不是由事件立即推送。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
