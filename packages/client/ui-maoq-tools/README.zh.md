---
description: "为 MAOQ 快照和决策工具提供业务语义明确的浏览器行。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-maoq-tools

[English](README.md) | 中文

## 概述

这个纯浏览器插件把六个 MAOQ 快照与决策工具的通用回退行替换为明确的业务名称、精简参数摘要和可展开的结构化结果，并提供用于分析深度、议事组模型和推理强度的 MAOQ 设置页。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在 `dsh-client-ui-tool` 与 `dsh-client-ui-settings` 之后挂载；MAOQ Profile 已自动完成。带 key 的专属行覆盖快照数据源、快照生成、目录查看、精确哈希核验、战略研判和独立风控决策会。MAOQ 设置页绑定 `maoq-decision` 与 `subagent-codex-codex`：模式切换会作用于下一次战略调用，保存后的议事组模型与推理强度会作用于下一次子 Agent 运行。

<a id="model-experience"></a>
## 模型体验

### 浏览器工具展示

#### 模型看到的内容

无。本包只在浏览器读取已持久化的 `tool/call` 与 `tool/result` 切片，不贡献提示词或工具 schema。

#### Token 影响

无 token 变化；渲染发生在模型响应持久化之后。

#### KV Cache 影响

无缓存变化；本包从不参与提示词组装。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 结构化结果目前以有界预格式文本展示；更丰富的市场图表应由后续领域卡片承担。

<a id="dev-note"></a>
### 开发备注

带 key 的专属行必须只从持久调用／结果切片回放，不得查询实时市场状态。
