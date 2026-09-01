# 市场快照子系统

[English](market-snapshot.md) | 中文

市场快照子系统负责 MAOQ 在一个日级决策截止点可以使用的不可变事实。它落实 [MAOQ 路线图](../maoq-roadmap.zh.md)中的证据纪律：取得的事实与后续模型解释保持分离，每条持久化记录都携带来源谱系。

## 快照身份

`MarketSnapshotIdentityInput` 把交易日和精确截止点与交易日历、复权、板块分类及数据源版本组合起来。构建器先排序 `sourceVersions`，再对完整规范正文计算哈希。持久化的 `contentHash` 是小写 SHA-256 值；它寻址不可变字节，但不替代带版本身份。

身份引用只能写入一次。同一身份的第二次构建可以复用相同内容哈希，但不同内容会抛出 `MarketSnapshotConflictError`。

## 持久化事实

`MarketSnapshot` 包含复权股票 OHLCV、换手率、复权因子、交易状态、涨跌停状态、上市时长、板块日线及时点成员关系、全市场计数、可观察情绪事实和截止点合格新闻。`MarketProvenance` 为每条取得的记录附加适配器、数据集、版本、取得时间、来源记录标识和具名确定性转换。

`StockDailyBar.tradingStatus` 区分交易、停牌和退市路径记录。`limitStatus` 记录无涨跌停、涨停或跌停，不推断可执行性。`listingDays` 与 `qualityFlags` 保存次新语义，供后续过滤器使用。

## 时间与质量规则

所有股票和板块日期都等于快照交易日。板块成员必须在该日有效。每个来源取得时间必须不晚于截止点。新闻只有在发布时间和抓取时间都不晚于截止点时才合格；更晚的新闻会被排除，不会被重新标注。

构建器拒绝空股票集或板块集、重复来源版本、重复证券、重复板块、重复成员、重复新闻、不一致 OHLC、无效比例，以及成交量或成交额非零的停牌记录。它不合成缺失的关键事实。所有无序集合在哈希前接受确定性排序。

## 适配器与查询规则

`MarketSnapshotAdapter.load()` 返回供应商无关的 `MarketSnapshotDraft`；供应商响应字段名不会进入持久化类型。适配器在 Cordis effect 生命周期内以唯一小写连字符名称注册。`MarketSnapshotService.build()` 解析一个名称，拒绝改变请求身份的草稿，再校验并持久化它。审计 JSON 适配器按完整身份哈希寻址一个草稿文件。`getByHash()` 和 `getByIdentity()` 验证存储的内容哈希，并返回深度冻结值。

服务不公开“最新快照”查询。消费者必须指定精确身份或哈希，因此回放不能悄悄移动证据截止点。

## 生产日线采集

可选的 MySQL 适配器消费既有、经过质量门控的 `long_short_stock` 管线。它执行参数化、会话只读查询，并在采集前后复核精确来源版本。如果指定日期的质量行不可用、低于任一行数阈值、缺少必要参考数据集、晚于截止点、在采集中发生变化，或与连接后的股票行数不一致，构建就会失败。

原始 OHLC 乘当日复权因子得到后复权价格；成交量和成交额保持不变；换手百分数除以 100。板块事实为每只股票选择最新有效的申万一级归属，并计算确定性的等权 `原价 / 昨收` 指数。市场宽度与情绪字段由收盘、最高、昨收和涨跌停行推导。P1 采集不加入策略标签、主要矛盾判断、板块排名或股票排名。

## 联网政策与新闻证据

`dsh-market-news-web` 在决策截止点前通过既有 `ctx.web` seam 执行带版本问题。采集必须在该截止点前开始并结束，每条接纳结果都必须携带 URL、标题和提供方给出的、不晚于截止点的发布时间。它把批次冻结到规范内容哈希下；回放只读取该哈希，不发起网络调用。

只有当 `sourceVersions` 包含精确 `news:<sha256>` 标记，且批次交易日和截止点等于请求身份时，MySQL 适配器才合并该批次。搜索结果不能覆盖价格或板块事实。查询拥有的板块映射和置信度保持为带版本采集策略；后续模型可以解释证据，但不能改变其来源、发布时间、抓取时间或截止点资格。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxmarketnews--marketnewswebservice"></a>

### `ctx.marketNews` — `MarketNewsWebService`

Acquires before cutoff, freezes once, and replays only by content hash.

```ts cordis-catalog
/**
 * Search all versioned questions and persist one immutable evidence batch.
 * @param input - Trading date, cutoff, versioned query policies, and result bound.
 * @param signal - Optional cancellation signal forwarded to every web search.
 * @returns The verified content-addressed batch.
 */
async acquire(input: MarketNewsAcquireInput, signal?: AbortSignal): Promise<MarketNewsBatch>

/**
 * Read and verify one exact frozen batch without performing network access.
 * @param hash - Lowercase SHA-256 content address.
 * @returns The deeply frozen verified batch.
 */
get(hash: string): Promise<MarketNewsBatch>
```

Source: [`packages/market/market-news-web/src/index.ts`](../../packages/market/market-news-web/src/index.ts)

<a id="ctxmarketsnapshots--marketsnapshotservice"></a>

### `ctx.marketSnapshots` — `MarketSnapshotService`

Builds, persists and queries one authoritative set of daily market facts.

```ts cordis-catalog
/**
 * Register one provider-neutral adapter until its contributor disposes the returned effect.
 * @param adapter - Adapter with a unique lowercase-hyphenated registry name.
 * @returns A disposer that removes this exact adapter registration.
 */
register(adapter: MarketSnapshotAdapter): () => void

/**
 * Return registered adapter names in deterministic order.
 * @returns A sorted snapshot of the current registry names.
 */
listAdapters(): readonly string[]

/**
 * Return registered sources and whether each can discover recent audited sessions.
 * @returns Deterministically sorted source capabilities.
 */
describeAdapters(): readonly { readonly name: string; readonly supportsRecentDiscovery: boolean }[]

/**
 * Ask one named source for exact recent identities without loading market rows.
 * @param adapterName - Registered source name.
 * @param request - Explicit date ceiling, evidence cutoff, and bounded count.
 * @returns Exact identities in ascending trading-date order.
 */
async discoverRecent( adapterName: string, request: MarketSnapshotDiscoveryRequest, ): Promise<readonly MarketSnapshotIdentityInput[]>

/**
 * Load normalized facts from a named adapter, validate them, and persist canonical bytes.
 * @param adapterName - Exact registered adapter name.
 * @param identity - Complete requested identity that the adapter must preserve.
 * @returns The validated immutable snapshot written to the content-addressed store.
 */
async build(adapterName: string, identity: MarketSnapshotIdentityInput): Promise<MarketSnapshot>

/**
 * Read one immutable snapshot by content hash.
 * @param hash - Lowercase hexadecimal SHA-256 content address.
 * @returns A deeply frozen snapshot, or `undefined` when the address is absent.
 */
getByHash(hash: string): Promise<MarketSnapshot | undefined>

/**
 * Read the snapshot for one exact versioned cutoff identity.
 * @param identity - Complete versioned identity without a content hash.
 * @returns A deeply frozen snapshot, or `undefined` when the identity is absent.
 */
getByIdentity(identity: MarketSnapshotIdentityInput): Promise<MarketSnapshot | undefined>

/**
 * Verify and list stored content references under an explicit filesystem scan bound.
 * @param maxFiles - Maximum number of stored content files to inspect.
 * @returns Newest exact summaries first.
 */
listSummaries(maxFiles: number): Promise<readonly MarketSnapshotSummary[]>
```

Source: [`packages/market/market-snapshot/src/index.ts`](../../packages/market/market-snapshot/src/index.ts)
<!-- END GENERATED cordis-surface -->
