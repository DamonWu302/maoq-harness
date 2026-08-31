---
description: "Build and query deterministic A-share MarketSnapshot v1 artifacts with cutoff enforcement, source lineage, canonical hashing, and immutable local persistence."
kind: "package-reference"
---

# `@deepseek-ai/dsh-market-snapshot`

English | [中文](README.zh.md)

## Summary

This package freezes one A-share trading day's daily bars, point-in-time sectors, market breadth, emotion facts, and eligible news into a canonical artifact. Every acquired record names its source and transformations. The builder rejects missing, conflicting, or temporally invalid facts, and the store refuses to bind one exact identity to different content.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount one store, register one or more provider-neutral adapters, then pass an adapter name and complete versioned identity to `ctx.marketSnapshots.build()`. An adapter may implement `discoverRecent()`; the service requires the requested number of exact identities, preserves the cutoff, and enforces strictly ascending trading dates. `listSummaries()` verifies stored artifacts under an explicit scan bound and returns newest summaries first with exact content hashes.

### When to choose it

Choose this package when market analysis must be reproducible at a fixed cutoff. Do not use live quote objects or search results directly in strategic or stock-selection code; adapt them into `MarketSnapshotDraft` first.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-market-snapshot'
  config:
    root: .maoq/snapshots
```

| Field | Default | Meaning |
|---|---|---|
| `root` | required | Directory containing content-addressed snapshots and immutable identity references. |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-market-snapshot) is the exhaustive source for accepted fields.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

An adapter removes supplier field names before returning a draft. The service registers each adapter by a unique lowercase-hyphenated name and rejects a draft that changes the requested identity. The builder checks the trading date, source retrieval times, point-in-time memberships, data conflicts, and trading-state semantics; sorts every unordered collection; excludes news published or fetched after the cutoff; and hashes canonical JSON. The append-only store writes one artifact per content hash and one reference per exact versioned identity, verifies hashes on reads, and deep-freezes returned objects.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Market snapshot subsystem](../../../docs/subsystems/market-snapshot.md) — types and temporal semantics.
- [MAOQ roadmap](../../../docs/maoq-roadmap.md) — milestone boundaries.
- [MAOQ operations](../../../docs/maoq-operations.md) — profile startup and recovery.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package does not add model-visible context or tools.

#### KV Cache effect

None. Snapshot reads remain host-side until a later consumer explicitly logs and presents selected facts.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

The package owns canonical facts and the discovery contract, not acquisition credentials or the provider's trading-calendar data.

- **Adapter deployment** — production daily, sector, and news providers must map their fields into `MarketSnapshotDraft`; the [JSON adapter](../market-snapshot-json/README.md) supports audited imports but does not acquire vendor data.
- **Single-process writer** — append-only files detect identity conflicts, but coordinated multi-process publication requires a transactional backend.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
