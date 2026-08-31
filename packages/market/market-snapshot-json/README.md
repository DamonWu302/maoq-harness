---
description: "Import audited provider-neutral JSON drafts into immutable MAOQ market snapshots by exact versioned identity."
kind: "package-reference"
---

# `@deepseek-ai/dsh-market-snapshot-json`

English | [中文](README.zh.md)

## Summary

This package lets an operator replay market facts acquired outside the Harness without weakening snapshot validation. It selects one JSON draft by the hash of the complete requested identity, then delegates temporal, quality, conflict, canonical-hash, and persistence checks to `dsh-market-snapshot`. Choose it for audited imports and offline reproduction, not for direct vendor acquisition.

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

Write a provider-neutral `MarketSnapshotDraft` to `<root>/<identity-sha256>.json`, then request the same complete identity through the registered adapter name.

### When to choose it

Choose this package when a separate acquisition job or human-reviewed export already owns vendor access and the Harness must reproduce exactly what it observed. Choose a source-specific adapter when the running profile must call that source directly.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-market-snapshot-json'
  config:
    root: .maoq/imports
```

| Field | Default | Meaning |
|---|---|---|
| `root` | required | Directory containing identity-addressed JSON draft files. |
| `adapterName` | `json-file` | Unique lowercase-hyphenated name used by snapshot build requests. |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-market-snapshot-json) is the exhaustive source for accepted fields.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The adapter hashes the requested identity and reads only the corresponding JSON file. The snapshot service rejects a draft that changes that identity, contains invalid or post-cutoff facts, conflicts with an existing identity reference, or cannot produce canonical content. The plugin registers the adapter as a Cordis effect, so unloading it removes the name from the registry.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Market snapshot service](../market-snapshot/README.md) — canonical validation, persistence, and queries.
- [Market snapshot subsystem](../../../docs/subsystems/market-snapshot.md) — identity, time, provenance, and adapter semantics.
- [MAOQ roadmap](../../../docs/maoq-roadmap.md) — P1 scope and acceptance criteria.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package does not add model-visible context or tools.

#### KV Cache effect

None. Imported facts remain host-side until a later consumer explicitly logs and presents selected facts.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

The package trusts only the file selection mechanism; the snapshot service still owns semantic acceptance.

- **No acquisition** — another process must acquire, normalize, and write each draft.
- **One file per identity** — the adapter does not discover dates, choose the newest file, or merge partial exports.
- **Trusted local JSON parser** — malformed JSON fails the build; this package does not add a streaming parser or file-size limit.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
