---
description: "提供有界统帅决策和独立风险否决的 MAOQ 浏览器 Profile 层。"
kind: "package-bundle"
---

# `@deepseek-ai/dsh-maoq-app`

[English](README.md) | 中文

## 概述

MAOQ 应用层组合在 `dsh-base` 和 `dsh-web-app` 之上，提供统帅人格，并挂载 [`dsh-tool-maoq-decision`](../../workflow/tool-maoq-decision/README.zh.md)、不可变事实存储 [`dsh-market-snapshot`](../../market/market-snapshot/README.zh.md)、有界取得工具 [`dsh-tool-maoq-snapshot`](../../market/tool-maoq-snapshot/README.zh.md)和截止点前证据冻结器 [`dsh-market-news-web`](../../market/market-news-web/README.zh.md)。因此，随附的 `maoq` Profile 保留普通浏览器、数据、联网搜索和子 Agent 能力，同时增加一个有界决策议事组。它不授予实盘交易权限。

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

通过 `dsh --profile maoq` 启动。随附模板依次组合 `dsh-base`、`dsh-web-app` 和本策略层，并允许 Profile 补丁热重载。市场快照服务把不可变产物保存在 `.maoq/snapshots`，从 `.maoq/imports` 读取审计过的供应商无关导入，并把截止点前联网证据冻结到 `.maoq/news`；它们都相对于启动目录。在受支持的 macOS 与 Node 组合上，如果没有显式代理环境变量，Profile 启动会自动继承已启用的系统 HTTP 和 HTTPS 代理。决策议事组通过 Codex app-server 复用本机 Codex/ChatGPT 登录，默认使用低推理强度的 `gpt-5.6-luna`，并通过 HTTPS Responses 路径避免 WebSocket 重试延迟。MAOQ 设置页可以修改下一次子 Agent 运行使用的议事组模型与推理强度。战略研判默认使用只含统帅综合与独立风控的快速模式；深度模式会额外运行最多四位所选专家。渲染结果上限为 32768 个字符。每次调用的 token 用量都会单列，并在结果中汇总输入、缓存、输出、推理与总 token；若 Codex 未返回用量，该调用会计入 `unavailableCalls`，不会伪造估算值。

Profile 还会挂载延迟连接的 `long-short-stock-mysql` 适配器。如果默认值与既有日线数据库不一致，可配置 `MAOQ_MYSQL_HOST`、`MAOQ_MYSQL_PORT`、`MAOQ_MYSQL_SOCKET`、`MAOQ_MYSQL_USER` 和 `MAOQ_MYSQL_DATABASE`。`MAOQ_MYSQL_PASSWORD_CREDENTIAL` 应指向保存密码的凭据存储键；密码本身不会进入补丁或工具参数。统帅每次前台调用最多生成十个交易日。

进行市场任务时，在新任务发送第一条消息前，通过模式开关选择 **MAOQ 市场模式**。任务一旦开始，预设即固定。该模式保留 MAOQ 快照、决策、联网研究和用户问询能力，同时不装载 Shell、文件搜索／编辑、任务清单、目标及通用子 Agent 控制，因此快照问题会直接查询快照目录，不再绕行工作区搜索。仓库开发仍可选择**标准模式**。

MAOQ Profile 还会挂载专属浏览器工具行，用“查看快照目录”“生成交易日快照”“MAOQ 战略研判”等业务名称替代通用的技术工具调用回退。

<a id="operate-and-recover"></a>
## 运行与恢复

[MAOQ 运行手册](../../../docs/maoq-operations.zh.md)覆盖前台进程生命周期、服务健康检查、本机 Codex 与外部 API canary、token 检查、P0 证据矩阵，以及提供方目录、认证、模型、传输、结构化输出和风险否决故障的恢复方式。

<a id="choose-commander-model"></a>
## 选择统帅模型

打开**设置 → 模型 → 统帅模型**，可以在**本机 Codex 登录**和**外部模型 API**之间切换，再选择或输入具体模型。本机路径复用当前 Codex/ChatGPT 登录，不需要第二份 API Key；该能力仅在 Profile 明确开启时生效，并且只读取 `openai-codex` 所需凭证。外部路径完整保留现有 DeepSeek 及其他 API Key 提供方。保存后的选择从新建任务开始生效，已经运行的任务继续使用原模型。这个开关只改变外层统帅。打开**设置 → MAOQ**可配置有界议事组的模型、推理强度以及快速或深度研判模式；议事组调用继续独立统计 token 用量。

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

- **日线数据库由部署配置**——适配器采用延迟连接，但在配置的 MySQL 端点和密码凭据可用前，生成会失败。
- **没有组合执行器** — 决策止于研究和模拟交易输出。
- **目前只有通用风险审查** — 敞口、流动性和回撤的数值引擎仍是未来的独立服务。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

P1 先建立不可变市场事实，P2 再增加战略解释或战术广度。

</details>
