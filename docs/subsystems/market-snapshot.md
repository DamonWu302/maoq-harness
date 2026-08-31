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

## Production daily acquisition

The opt-in MySQL adapter consumes the existing quality-gated `long_short_stock` pipeline. It issues parameterized, session-read-only queries and verifies exact source versions before and after acquisition. A build fails when the dated quality row is unusable, below either row threshold, missing a required reference dataset, later than the cutoff, changed during acquisition, or inconsistent with the joined stock count.

Raw OHLC is multiplied by the same-day adjustment factor for HFQ; volume and amount stay unchanged; turnover percent is divided by 100. Sector facts use the latest effective SW L1 membership for each symbol and a deterministic equal-weight `raw price / pre-close` index. Breadth and emotion fields are observations derived from close, high, previous close, and price-limit rows. No strategy label, principal-contradiction judgment, sector rank, or stock rank enters P1 acquisition.

## Web policy and news evidence

`dsh-market-news-web` executes versioned questions through the existing `ctx.web` seam before the decision cutoff. Acquisition must both start and finish by that cutoff, and every accepted result must carry a URL, title, and provider-supplied publication timestamp no later than the cutoff. It freezes the batch under a canonical content hash; replay reads only that hash and performs no network call.

The MySQL adapter merges a batch only when `sourceVersions` contains its exact `news:<sha256>` token and the batch trading date and cutoff equal the requested identity. Search results do not overwrite price or sector facts. Query-owned sector mappings and confidence remain versioned acquisition policy; later models may interpret the evidence but cannot alter its source, publication time, retrieval time, or cutoff eligibility.
