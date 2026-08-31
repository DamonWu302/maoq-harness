# Agent Note: MAOQ immutable market snapshot

Status: implemented

English | [中文](2026-08-31-maoq-market-snapshot.zh.md)

## Problem

MAOQ cannot identify a principal market contradiction from mutable live responses without introducing future data, supplier coupling, and irreproducible evidence. Later strategic interpretation and stock selection need one exact set of daily facts whose source, cutoff, and transformation remain inspectable.

## Decision

`@deepseek-ai/dsh-market-snapshot` owns `MarketSnapshot` version 1, its provider-neutral adapter input, deterministic builder, append-only local persistence, and read-only query service. The shipped `maoq` bundle mounts the service at `.maoq/snapshots`.

The identity combines trading date, cutoff, trading-calendar version, adjustment version, sector-classification version, and source versions. The builder validates record dates and source retrieval times, filters news by both publication and fetch time, checks point-in-time sector membership, rejects conflicting or missing critical facts, sorts unordered collections, and hashes canonical JSON. Every acquired record carries source lineage and named deterministic transforms.

The local store addresses artifacts by SHA-256 and writes a separate reference for the exact versioned identity. It permits an idempotent rewrite of identical bytes and refuses a different content hash for an existing identity. Reads verify the declared hash and return a deeply frozen value. There is deliberately no latest-snapshot query.

## Maoist method mapping

“Seek truth from facts” becomes a separation between acquired facts and later interpretation. “No investigation, no right to speak” becomes fail-closed validation for missing critical market evidence. “Concrete analysis of concrete conditions” becomes explicit trading-date, cutoff, adjustment, sector-classification, and source versions. The distinction between principal and secondary contradictions remains a P2 interpretation over this evidence; the P1 builder does not predict, rank sectors, or select stocks.

## Alternatives considered

**Pass live provider responses directly to the commander.** This loses reproducibility, admits post-cutoff evidence, and lets provider vocabulary influence strategy prompts.

**Persist one mutable snapshot per trading date.** A date alone cannot distinguish cutoff, adjustment, calendar, classification, or source revisions, and an overwrite destroys the evidence used by an earlier decision.

**Let the model repair missing or conflicting data.** A plausible repair is not an observed fact and makes later evaluation unable to separate data failure from reasoning failure.

## Consequences

P2 and later stages receive a stable, inspectable fact set and must request it by exact identity or content hash. Adding a production supplier requires an adapter that returns `MarketSnapshotDraft`; supplier fields cannot enter persisted types. The current local store assumes one coordinated writer, while conflict detection keeps accidental identity rebinding visible. Offline tests cover deterministic replay, trading-state cases, point-in-time membership, missing and conflicting data, news cutoffs, immutable reads, and identity conflicts.
