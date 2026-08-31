---
description: "Freeze pre-cutoff web policy and news searches into immutable evidence batches for MAOQ."
kind: "package-reference"
---

# `@deepseek-ai/dsh-market-news-web`

English | [中文](README.zh.md)

## Summary

This package turns the existing `ctx.web` search seam into reproducible policy, macro, and news evidence. Acquisition must start and finish no later than the decision cutoff. The result is written once under a canonical SHA-256; later snapshot builds read that exact batch and never repeat the search.

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

Mount the service after `dsh-web` and a configured search provider. The MAOQ profile stores batches under `.maoq/news`.

```yaml
- name: '@deepseek-ai/dsh-market-news-web'
  config:
    root: .maoq/news
```

Call `ctx.marketNews.acquire()` before the cutoff with versioned queries. Each query supplies an explicit affected-sector mapping and confidence policy; those are acquisition metadata, not a model conclusion. Add `news:<batch-content-hash>` to the market snapshot identity and request the MySQL adapter with that exact identity.

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-market-news-web) is exhaustive.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The service records one completion time for the batch. Every source must provide a URL, title, and valid publication timestamp no later than the cutoff. A duplicate URL with consistent publication metadata merges affected sectors and keeps the lower confidence. Publisher is the URL hostname and event time conservatively equals publication time; both transformations remain visible in provenance. Missing temporal evidence, conflicting metadata, late acquisition, late publication, or corrupted persisted bytes fails closed.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Market snapshot MySQL adapter](../market-snapshot-mysql/README.md) — exact batch merge into daily facts.
- [Market snapshot subsystem](../../../docs/subsystems/market-snapshot.md) — identity and cutoff rules.
- [MAOQ roadmap](../../../docs/maoq-roadmap.md) — P1 acceptance and later interpretation boundaries.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package does not add model-visible context or tools.

#### KV Cache effect

None. Evidence remains host-side until a later bounded consumer presents selected records.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Pre-cutoff schedule required** — a search first executed after the cutoff cannot enter that cutoff's snapshot.
- **Provider timestamp required** — URL-only or undated search results are rejected, not guessed.
- **Versioned query policy required** — sector mappings and confidence are caller-owned policy inputs; changing them requires a new `queryVersion`.
- **Publication-time event fallback** — a separate event time requires a future structured extractor with its own version and evidence tests.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Do not add a “latest batch” lookup. The content hash is the only replay address, and the market snapshot identity must name it explicitly.

</details>
