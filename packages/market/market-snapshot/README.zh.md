---
description: "构建并查询确定性的 A 股 MarketSnapshot v1 产物，强制执行截止点、来源谱系、规范哈希和不可变本地持久化。"
kind: "package-reference"
---

# `@deepseek-ai/dsh-market-snapshot`

[English](README.md) | 中文

## 概述

本包把一个 A 股交易日的日线、时点正确板块、市场宽度、情绪事实和合格新闻冻结为规范产物。每条取得的记录都注明来源和转换。构建器拒绝缺失、冲突或时间不合格的事实；存储拒绝把同一精确身份绑定到不同内容。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与暂缓工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

挂载一个存储，注册一个或多个供应商无关适配器，然后向 `ctx.marketSnapshots.build()` 传入适配器名称和完整带版本身份。适配器可以实现 `discoverRecent()`；服务会要求返回指定数量的精确身份、保持截止点不变，并强制交易日严格升序。`listSummaries()` 会在显式扫描上限内校验已存产物，并按从新到旧返回带精确内容哈希的摘要。

### 何时选择

当市场分析必须在固定截止点可复现时选择本包。不要让实时行情对象或搜索结果直接进入战略或选股代码；应先把它们适配为 `MarketSnapshotDraft`。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-market-snapshot'
  config:
    root: .maoq/snapshots
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `root` | 必填 | 存放内容寻址快照和不可变身份引用的目录。 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-market-snapshot)是全部可接受字段的权威来源。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

适配器在返回草稿前移除供应商字段名。服务以唯一的小写连字符名称注册每个适配器，并拒绝改变请求身份的草稿。构建器检查交易日、来源取得时间、时点成员关系、数据冲突和交易状态语义，排序所有无序集合，排除截止点后发布或抓取的新闻，并对规范 JSON 计算哈希。只追加存储按内容哈希写入产物，并按精确带版本身份写入引用；读取时验证哈希并深度冻结返回对象。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [市场快照子系统](../../../docs/subsystems/market-snapshot.zh.md)——类型和时间语义。
- [MAOQ 路线图](../../../docs/maoq-roadmap.zh.md)——里程碑边界。
- [MAOQ 运行手册](../../../docs/maoq-operations.zh.md)——Profile 启动和恢复。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本包不增加模型可见上下文或工具。

#### KV Cache 影响

无。快照读取保留在宿主侧，直到后续消费者明确记录并展示选定事实。

## 已知限制与暂缓工作

<a id="known-limitations-and-deferred-work"></a>

本包负责规范事实与发现契约，不负责取得凭据或提供方的交易日历数据。

- **适配器部署**——生产日线、板块和新闻提供方必须把字段映射为 `MarketSnapshotDraft`；[JSON 适配器](../market-snapshot-json/README.zh.md)支持审计导入，但不采集供应商数据。
- **单进程写入者**——只追加文件能检测身份冲突，但多进程协调发布需要事务型后端。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
