# Agent Note: MAOQ immutable market snapshot

Status: implemented

English | [中文](2026-08-31-maoq-market-snapshot.zh.md)

## Problem

MAOQ cannot identify a principal market contradiction from mutable live responses without introducing future data, supplier coupling, and irreproducible evidence. Later strategic interpretation and stock selection need one exact set of daily facts whose source, cutoff, and transformation remain inspectable.

## Decision

`@deepseek-ai/dsh-market-snapshot` owns `MarketSnapshot` version 1, its named provider-neutral adapter registry, deterministic builder, append-only local persistence, and read-only query service. The shipped `maoq` bundle mounts the service at `.maoq/snapshots` and the audited JSON import adapter at `.maoq/imports`.

The identity combines trading date, cutoff, trading-calendar version, adjustment version, sector-classification version, and source versions. The builder validates record dates and source retrieval times, filters news by both publication and fetch time, checks point-in-time sector membership, rejects conflicting or missing critical facts, sorts unordered collections, and hashes canonical JSON. Every acquired record carries source lineage and named deterministic transforms.

The local store addresses artifacts by SHA-256 and writes a separate reference for the exact versioned identity. It permits an idempotent rewrite of identical bytes and refuses a different content hash for an existing identity. Reads verify the declared hash and return a deeply frozen value. There is deliberately no latest-snapshot query. Every adapter registers by a unique lowercase-hyphenated name, and the service rejects any returned draft whose identity differs from the request.

`@deepseek-ai/dsh-market-snapshot-mysql` is the first production acquisition adapter. It reuses the quality-gated `long_short_stock` database through parameterized, session-read-only queries instead of duplicating upstream Tushare requests. It discovers the exact quality, current and previous price, adjustment, basic, price-limit, index, and SW L1 versions; verifies them before and after acquisition; requires the joined daily population to equal the quality decision; and derives only deterministic sector, breadth, and emotion facts. A missing price-limit `pre_close` uses the exact previous-session raw close when one exists and records that transformation. A new listing without price history remains in the snapshot but does not enter return-derived facts. The adapter remains opt-in because database location and credentials are deployment facts.

`@deepseek-ai/dsh-market-news-web` owns a separate pre-cutoff acquisition boundary over `ctx.web`. A search batch must start and finish by the cutoff, every accepted source must have a URL, title, and provider-supplied publication time no later than the cutoff, and the resulting canonical batch is persisted by content hash. A snapshot merges news only when its identity names that exact `news:<sha256>` batch. Replay never searches the web again, and search evidence cannot overwrite database facts.

`@deepseek-ai/dsh-tool-maoq-snapshot` is the least-authority model boundary over acquisition and recovery. It exposes source discovery, bounded serial generation, bounded verified listing, and exact-hash inspection as separate tools. Deployment owns the adapter allowlist, generation count, scan count, and timeout. Credentials remain adapter configuration and never enter model arguments. The tool package deliberately has no delete, overwrite, source-write, ranking, portfolio, or order capability; interpretation stays in `@deepseek-ai/dsh-tool-maoq-decision`.

## Maoist method mapping

“Seek truth from facts” becomes a separation between acquired facts and later interpretation. “No investigation, no right to speak” becomes fail-closed validation for missing critical market evidence. “Concrete analysis of concrete conditions” becomes explicit trading-date, cutoff, adjustment, sector-classification, and source versions. The distinction between principal and secondary contradictions remains a P2 interpretation over this evidence; the P1 builder does not predict, rank sectors, or select stocks.

## Alternatives considered

**Pass live provider responses directly to the commander.** This loses reproducibility, admits post-cutoff evidence, and lets provider vocabulary influence strategy prompts.

**Persist one mutable snapshot per trading date.** A date alone cannot distinguish cutoff, adjustment, calendar, classification, or source revisions, and an overwrite destroys the evidence used by an earlier decision.

**Let the model repair missing or conflicting data.** A plausible repair is not an observed fact and makes later evaluation unable to separate data failure from reasoning failure.

**Give the commander a general shell or database tool for acquisition.** This would mix credentials, schema knowledge, mutation authority, and fact semantics in model context. A small snapshot plugin preserves freedom to choose when facts are needed without granting unrelated authority.

## Consequences

P2 and later stages receive a stable, inspectable fact set and must request it by exact identity or content hash. Adding a production supplier requires an adapter that returns `MarketSnapshotDraft`; supplier fields cannot enter persisted types. The JSON adapter gives externally acquired evidence a deterministic no-credential import path without claiming that imported facts are complete or valid. The MySQL adapter preserves raw volume and amount, converts turnover percent to a ratio, applies HFQ only to price, resolves overlapping industry periods by the latest effective record, and marks rather than drops priced new listings whose lifecycle reference lags. Its stock population is the quality-approved priced universe; a complete suspension universe remains deferred until that upstream table has dated quality coverage. Web evidence requires a pre-cutoff scheduler; a first search after the cutoff is ineligible even when the article itself was published earlier. The current local stores assume one coordinated writer, while conflict detection keeps accidental identity rebinding visible.
