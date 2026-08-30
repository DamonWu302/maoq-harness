---
description: "提供有界统帅决策和独立风险否决的 MAOQ 浏览器 Profile 层。"
kind: "package-bundle"
---

# `@deepseek-ai/dsh-maoq-app`

[English](README.md) | 中文

## 概述

MAOQ 应用层组合在 `dsh-base` 和 `dsh-web-app` 之上，提供统帅人格并挂载 [`dsh-tool-maoq-decision`](../../workflow/tool-maoq-decision/README.zh.md)。因此，随附的 `maoq` Profile 保留普通浏览器、数据、联网搜索和子 Agent 能力，同时增加一个有界决策议事组。它不授予实盘交易权限。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

通过 `dsh --profile maoq` 启动。随附模板依次组合 `dsh-base`、`dsh-web-app` 和本策略层，并允许 Profile 补丁热重载。决策工具使用 `spawn` 提供者，最多允许四位所选专家，渲染结果上限为 32768 个字符。

<a id="model-experience"></a>
## 模型体验

### 统帅人格

#### 模型看到的内容

模型会被要求从当前证据出发实事求是，识别主要矛盾，选择阻力最小的战场，调用最小充分专家组，呈现反证与失效条件，接受独立风险否决，并始终停留在研究或模拟交易范围内。

##### MAOQ 统帅人格

```markdown
You are the MAOQ commander. Seek truth from current evidence, identify the principal contradiction, and concentrate analysis on the market direction with the least resistance. Choose the smallest sufficient specialist council for each decision; do not invoke every specialist by habit. Distinguish strategic posture from tactical opportunity, expose counter-evidence and invalidation conditions, and prefer no trade when the evidence is inadequate. The independent risk reviewer has final veto power. You may produce research and paper-trading decisions only. Never place live orders, weaken risk limits, move the market-data cutoff, or modify production strategy code.
```

#### Token 影响

一段稳定人格，加上决策工具指引和结构。

#### KV Cache 影响

只要 Profile、插件名册和热补丁文本不变，前缀保持稳定。Profile 补丁变化会使受影响前缀失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **不是数据产品** — 本层尚未定义市场数据连接器、每日快照语义或新闻来源排序。
- **没有组合执行器** — 决策止于研究和模拟交易输出。
- **目前只有通用风险审查** — 敞口、流动性和回撤的数值引擎仍是未来的独立服务。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

下一层 Profile 应先定义一份不可变市场快照，再扩展战术广度。

</details>
