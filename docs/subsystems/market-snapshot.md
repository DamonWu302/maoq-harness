# Market Snapshot Subsystem

English | [中文](market-snapshot.zh.md)

The market snapshot subsystem owns the immutable facts that MAOQ may use for one daily decision cutoff. It implements the evidence discipline in the [MAOQ roadmap](../maoq-roadmap.md): acquired facts remain separate from later model interpretation, and every persisted record carries source lineage.

## Snapshot identity

`MarketSnapshotIdentityInput` combines the trading date and exact cutoff with the trading-calendar, adjustment, sector-classification, and source versions. The builder sorts `sourceVersions`, then hashes the complete canonical body. The persisted `contentHash` is a lowercase SHA-256 value; it addresses immutable bytes but does not replace the versioned identity.

An identity reference is write-once. A second build for the same identity may reuse the same content hash, but different content raises `MarketSnapshotConflictError`.

## Persisted facts

`MarketSnapshot` contains adjusted stock OHLCV, turnover, adjustment factor, trading status, price-limit status, listing age, sector daily bars and point-in-time membership, broad-market counts, observable emotion facts, and cutoff-eligible news. `MarketProvenance` attaches an adapter, dataset, version, retrieval time, source record identifier, and named deterministic transforms to every acquired record.

`StockDailyBar.tradingStatus` distinguishes trading, suspended, and delisting-path records. `limitStatus` records no limit, limit-up, or limit-down without inferring executability. `listingDays` and `qualityFlags` preserve new-listing semantics for later filters.

## Time and quality rules

All stock and sector dates equal the snapshot trading date. Sector members must be effective on that date. Every source retrieval time must be at or before the cutoff. News is eligible only when both publication and fetch times are at or before the cutoff; later news is excluded rather than relabeled.

The builder rejects empty stock or sector sets, duplicate source versions, duplicate securities, duplicate sectors, duplicate members, duplicate news, inconsistent OHLC values, invalid ratios, and suspended records with nonzero volume or amount. It does not synthesize missing critical facts. All unordered collections receive deterministic sorting before hashing.

## Adapter and query rules

`MarketSnapshotAdapter.load()` returns the provider-neutral `MarketSnapshotDraft`; supplier response names never enter the persisted types. Adapters register under unique lowercase-hyphenated names for their Cordis effect lifetime. `MarketSnapshotService.build()` resolves one name, rejects a draft that changes the requested identity, then validates and persists it. The audited JSON adapter addresses one draft file by the complete identity hash. `getByHash()` and `getByIdentity()` verify the stored content hash and return a deeply frozen value.

The service does not expose a latest-snapshot query. Consumers must name the exact identity or hash so a replay cannot silently move its evidence cutoff.
