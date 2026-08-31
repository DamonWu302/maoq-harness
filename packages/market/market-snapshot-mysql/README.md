---
description: "Read quality-gated A-share daily facts from long_short_stock into immutable MAOQ snapshots."
kind: "package-reference"
---

# `@deepseek-ai/dsh-market-snapshot-mysql`

English | [中文](README.zh.md)

## Summary

This adapter reads the existing `long_short_stock` MySQL quality pipeline instead of duplicating Tushare calls. It joins raw daily bars with adjustment, turnover, price-limit, lifecycle, index, and point-in-time SW L1 evidence; derives only deterministic breadth, sector, and emotion facts; and rejects stale, incomplete, post-cutoff, or version-drifted requests.

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

Mount it only where the audited database is reachable. The MAOQ default bundle deliberately keeps the credential-free JSON adapter as its default.

```yaml
- name: '@deepseek-ai/dsh-market-snapshot-mysql'
  config:
    socketPath: /tmp/mysql.sock
    user: root
    database: long_short_stock
```

| Field | Default | Meaning |
|---|---|---|
| `adapterName` | `long-short-stock-mysql` | Snapshot adapter registry name. |
| `host` / `port` | `127.0.0.1` / `3306` | TCP endpoint when no socket is selected. |
| `socketPath` | unset | Optional Unix-domain socket. |
| `user` | required | Read-only database user. |
| `database` | `long_short_stock` | Existing production facts database. |
| `passwordEnv` | unset | Credential reference resolved per operation; never a literal password. |
| `minimumStocks` | `3000` | Local floor in addition to the session quality threshold. |
| `historySessions` | `20` | Usable sessions used for consecutive-board facts. |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-market-snapshot-mysql) is exhaustive.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`discoverIdentity()` reads the dated quality decision and exact maximum fetch versions. `load()` repeats the version check, uses parameterized SELECT-only SQL, requires the joined price count to equal the quality count, and converts turnover percent to a ratio while applying HFQ only to prices. Sector bars are equal-weight `raw price / pre-close` indices over the latest effective SW L1 membership. Emotion facts require the configured number of prior sessions with complete price and price-limit coverage; no model labels or stock ranking enter this package.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Market snapshot service](../market-snapshot/README.md) — validation and immutable storage.
- [Market snapshot subsystem](../../../docs/subsystems/market-snapshot.md) — temporal semantics and source rules.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package does not add model-visible context or tools.

#### KV Cache effect

None. It produces host-side evidence for later bounded consumers.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Priced universe** — the stock list is the quality-approved daily-price population. Suspension reference coverage must become dated and quality-gated before this adapter may claim a complete listed-security universe.
- **HFQ only** — price adjustment is fixed to raw price multiplied by the same-day factor. A QFQ mode needs an explicit base-date factor in the identity.
- **Lifecycle lag** — a priced new listing missing from `security_lifecycle` stays visible with `lifecycle-inferred-from-observed-bar`; it is never silently dropped.
- **Explicit news batch** — news is merged only when the identity names a frozen `news:<sha256>` batch from `dsh-market-news-web`.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The adapter intentionally opens a fresh read-only connection per query so a rotated credential applies immediately. It checks source versions before and after reading all facts and rejects an update that overlaps acquisition. Consolidate queries into one repeatable-read transaction only if it preserves per-operation credential resolution and the same checks.

</details>
