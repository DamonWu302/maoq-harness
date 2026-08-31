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
- [运行与恢复](#operate-and-recover)
- [选择统帅模型](#choose-commander-model)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

通过 `dsh --profile maoq` 启动。随附模板依次组合 `dsh-base`、`dsh-web-app` 和本策略层，并允许 Profile 补丁热重载。在受支持的 macOS 与 Node 组合上，如果没有显式代理环境变量，Profile 启动会自动继承已启用的系统 HTTP 和 HTTPS 代理。决策议事组通过 Codex app-server 复用本机 Codex/ChatGPT 登录，固定使用 `gpt-5.6-sol`，最多允许四位所选专家，渲染结果上限为 32768 个字符。每位专家、统帅综合和独立风控的 token 用量都会单列，并在结果中汇总输入、缓存、输出、推理与总 token；若 Codex 未返回用量，该调用会计入 `unavailableCalls`，不会伪造估算值。

<a id="operate-and-recover"></a>
## 运行与恢复

[MAOQ 运行手册](../../../docs/maoq-operations.zh.md)覆盖前台进程生命周期、服务健康检查、本机 Codex 与外部 API canary、token 检查、P0 证据矩阵，以及提供方目录、认证、模型、传输、结构化输出和风险否决故障的恢复方式。

<a id="choose-commander-model"></a>
## 选择统帅模型

打开**设置 → 模型 → 统帅模型**，可以在**本机 Codex 登录**和**外部模型 API**之间切换，再选择或输入具体模型。本机路径复用当前 Codex/ChatGPT 登录，不需要第二份 API Key；该能力仅在 Profile 明确开启时生效，并且只读取 `openai-codex` 所需凭证。外部路径完整保留现有 DeepSeek 及其他 API Key 提供方。保存后的选择从新建任务开始生效，已经运行的任务继续使用原模型。这个开关只改变外层统帅：有界决策议事组仍使用固定的 Codex app-server 模型，并继续独立统计 token 用量。

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

P0 已收口。下一层 Profile 应先定义一份不可变市场快照，再扩展战术广度。

</details>
