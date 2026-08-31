---
description: "按精确带版本身份把审计过的供应商无关 JSON 草稿导入不可变 MAOQ 市场快照。"
kind: "package-reference"
---

# `@deepseek-ai/dsh-market-snapshot-json`

[English](README.md) | 中文

## 概述

本包允许操作者回放在 Harness 外部取得的市场事实，同时不削弱快照校验。它按完整请求身份的哈希选择一份 JSON 草稿，再把时间、质量、冲突、规范哈希和持久化检查交给 `dsh-market-snapshot`。它适合审计导入和离线复现，不适合直接采集供应商数据。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

先把供应商无关的 `MarketSnapshotDraft` 写入 `<root>/<identity-sha256>.json`，再通过已注册的适配器名称请求同一个完整身份。

### 何时选择

当独立采集任务或人工审阅导出已经负责供应商访问，而 Harness 必须精确复现其观察结果时，选择本包。当运行中的 Profile 必须直接调用某个来源时，选择该来源专用适配器。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-market-snapshot-json'
  config:
    root: .maoq/imports
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `root` | 必填 | 保存按身份寻址 JSON 草稿文件的目录。 |
| `adapterName` | `json-file` | 快照构建请求使用的唯一小写连字符名称。 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-market-snapshot-json)是所有可接受字段的完整来源。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

适配器计算请求身份的哈希，并且只读取对应 JSON 文件。快照服务拒绝改变该身份、包含无效或截止点后事实、与现有身份引用冲突，或无法生成规范内容的草稿。插件把适配器注册为 Cordis effect，因此卸载插件会从注册表删除该名称。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [市场快照服务](../market-snapshot/README.zh.md)——规范校验、持久化和查询。
- [市场快照子系统](../../../docs/subsystems/market-snapshot.zh.md)——身份、时间、来源和适配器语义。
- [MAOQ 路线图](../../../docs/maoq-roadmap.zh.md)——P1 范围和验收标准。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本包不增加模型可见上下文或工具。

#### KV Cache 影响

无。导入事实保持在宿主侧，直到后续消费者明确记录并呈现选定事实。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

本包只信任文件选择机制；快照服务仍然负责语义接纳。

- **不负责采集**——另一个进程必须取得、规范化并写入每份草稿。
- **每个身份一个文件**——适配器不发现日期、不选择最新文件，也不合并局部导出。
- **受信任的本地 JSON 解析器**——畸形 JSON 会使构建失败；本包不增加流式解析器或文件大小限制。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
