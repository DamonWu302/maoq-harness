---
description: "把 long_short_stock 中经过质量门控的 A 股日线事实读入不可变 MAOQ 快照。"
kind: "package-reference"
---

# `@deepseek-ai/dsh-market-snapshot-mysql`

[English](README.md) | 中文

## 概述

本适配器读取既有 `long_short_stock` MySQL 质量管线，而不重复调用 Tushare。它把原始日线与复权、换手、涨跌停、生命周期、指数和时点有效的申万一级行业证据连接起来，只推导确定性的市场宽度、板块和情绪事实，并拒绝陈旧、不完整、晚于截点或版本漂移的请求。

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

只在能访问审计数据库的环境使用。MAOQ Profile 会把它与无需凭据的 JSON 适配器一起延迟挂载，因此数据库配置完成前仍可正常启动。

```yaml
- name: '@deepseek-ai/dsh-market-snapshot-mysql'
  config:
    socketPath: /tmp/mysql.sock
    user: root
    database: long_short_stock
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `adapterName` | `long-short-stock-mysql` | 快照适配器注册名。 |
| `host` / `port` | `127.0.0.1` / `3306` | 未选择 socket 时的 TCP 端点。 |
| `socketPath` | 未设置 | 可选 Unix-domain socket。 |
| `user` | 必填 | 只读数据库用户。 |
| `database` | `long_short_stock` | 既有生产事实数据库。 |
| `passwordEnv` | 未设置 | 每次操作解析的凭据引用；绝不接受明文密码。 |
| `minimumStocks` | `3000` | 在会话质量阈值之外的本地底线。 |
| `historySessions` | `20` | 推导连续板事实使用的可用交易日数。 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-market-snapshot-mysql)是穷尽式配置来源。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

`discoverRecent()` 选择一个经过质量批准的精确有界交易日窗口，并按日期升序解析每个身份。

`discoverIdentity()` 读取指定日期的质量结论与精确最大抓取版本，同时把适配器映射版本绑定到身份中，使字段语义修正生成新的不可变身份，而不会与旧产物冲突。`load()` 再次检查版本，只执行参数化 SELECT，要求连接后的价格行数等于质量行数，把换手百分数转成比率，并把指数相对昨收的涨跌存为小数比率（`0.01` 表示 1%），同时只对股票价格做后复权。涨跌停表的 `pre_close` 缺失时，身份会绑定上一日价格版本，适配器使用该股票上一有效交易日的原始收盘价。没有历史行情的新股仍会保留并标记 `pre-close-unavailable-no-history`，但会从收益率派生事实中排除。板块日线是在最新有效申万一级归属上计算的等权 `原价 / 昨收` 指数。情绪事实要求达到配置数量、同时具备完整价格和涨跌停覆盖的历史交易日；本包不加入模型标签，也不排序选股。

`LongShortStockTacticHistoryAdapter` 按调用方限定的块大小读取质量批准的闭区间日期。每一条来源价格行都必须保留在复权、换手和涨跌停必需连接结果中。每个块把后复权特征交易时段与包含精确涨跌停价的独立原始行情配对，应用时点正确的申万一级成员关系，绑定来源与映射版本，并生成稳定内容哈希。适配器只读并采用流式分块；它既不排序股票，也不把完整日期范围保存在内存中。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [市场快照服务](../market-snapshot/README.zh.md)——校验和不可变存储。
- [市场快照子系统](../../../docs/subsystems/market-snapshot.zh.md)——时间语义和来源规则。
- [市场战法实验室子系统](../../../docs/subsystems/market-tactic-lab.zh.md)——历史分块、特征和执行语义。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本包不增加模型可见上下文或工具。

#### KV Cache 影响

无。它为后续受约束消费者生成宿主侧证据。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **有价格的股票范围**——股票列表是通过质量门控的每日价格总体。停牌参考数据具备按日质量门控前，本适配器不会声称覆盖完整上市证券总体。
- **仅后复权**——价格固定为原价乘当日因子。前复权模式需要在身份中明确基准日因子。
- **生命周期延迟**——有价格但 `security_lifecycle` 暂缺的新股会保留并标记 `lifecycle-inferred-from-observed-bar`，绝不静默丢弃。
- **明确新闻批次**——只有身份指定 `dsh-market-news-web` 冻结的 `news:<sha256>` 批次时才合并新闻。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

适配器有意为每次查询建立新的只读连接，使轮换后的凭据立即生效。它会在读取全部事实前后检查来源版本，拒绝与采集重叠的更新。只有在仍能保持逐操作解析凭据和相同版本检查时，才可把查询合并成一次 repeatable-read 事务。

</details>
