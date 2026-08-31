---
description: "Bounded MAOQ tools for acquiring and recovering exact immutable market snapshots."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-maoq-snapshot

English | [中文](README.zh.md)

## Summary

`dsh-tool-maoq-snapshot` lets the MAOQ commander discover an approved market-data source, generate a small serial window of immutable daily snapshots, list stored hashes, and inspect one exact snapshot. It does not analyze the market, rank stocks, modify source data, delete snapshots, or place orders.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the boundaries](#understand-the-boundaries)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount it after `dsh-market-snapshot` and at least one adapter with recent-session discovery. The MAOQ profile allows `long-short-stock-mysql` and caps one generation call at ten sessions. `maoq_snapshot_generate` requires an explicit source, newest allowed trading date, evidence cutoff, and count. It returns exact hashes in ascending session order, with the newest hash separated from its history hashes for `maoq_analyze_strategy`.

| Field | Default | Meaning |
|---|---|---|
| `allowedAdapters` | `long-short-stock-mysql` | Sources the model may invoke for acquisition. |
| `maxGenerateCount` | `10` | Maximum serial snapshots in one call. |
| `maxListCount` | `20` | Maximum summaries returned by one list call. |
| `maxScanFiles` | `500` | Maximum immutable files verified by one list call. |
| `generateTimeoutMs` | `600000` | Foreground generation timeout. |

<a id="understand-the-boundaries"></a>
## Understand the boundaries

Source credentials remain in adapter or deployment configuration and never appear in tool arguments. The source allowlist and size limits are host configuration, so the model cannot enlarge them. Generation is serial and append-only; every stored artifact is validated and addressed by SHA-256. Listing verifies stored bytes under a scan bound, and inspection requires an exact lowercase hash. There is no implicit “latest” selection in the snapshot service.

-----

<a id="further-exploration"></a>
## Further Exploration

- [Market snapshot](../market-snapshot/README.md) — canonical facts and append-only storage.
- [MySQL adapter](../market-snapshot-mysql/README.md) — quality-gated daily-data acquisition.
- [MAOQ decision tool](../../workflow/tool-maoq-decision/README.md) — consumes exact current and history hashes.

<a id="model-experience"></a>
## Model Experience

### System prompt and tool schemas

#### What the model sees

The commander sees the four generated [tool schemas](../../../docs/tool-catalog.md#deepseek-aidsh-tool-maoq-snapshot) and the following stable workflow guidance.

##### MAOQ snapshot guidance

```markdown
Use maoq_snapshot_sources before acquisition when the source is unknown. Generate snapshots only when the user requests fresh immutable facts or a strategic question lacks exact hashes. Preserve the requested cutoff, use the smallest sufficient window, and never treat generation as analysis. Use maoq_snapshot_list and maoq_snapshot_inspect to recover exact hashes; then pass explicit current and history hashes to maoq_analyze_strategy. Snapshot tools cannot delete facts, change source data, rank stocks, or place orders.
```

#### Token effect

One short stable guidance section and four bounded schemas add parent-prefix cost. Tool results return summaries rather than all stock rows.

#### KV Cache effect

The prefix remains stable while plugin visibility and deployment limits do not change. Generated hashes and summaries are turn data and do not alter the fixed prompt.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Foreground only** — acquisition is bounded but does not yet run as a durable background job.
- **Bounded linear catalog scan** — listing verifies files directly; a large archive needs a separate immutable index.
- **Discovery required** — model-triggered generation rejects adapters that can load only an already known identity.
- **Daily facts only** — this package does not build intraday snapshots.
- **No mutation tools** — deletion, overwrite, source repair, broker, and portfolio actions are intentionally absent.

### Dev Note

<a id="dev-note"></a>

<details>
<summary>Working context for maintainers — click to expand</summary>

Keep fact acquisition separate from strategic interpretation. New capabilities should be separate least-authority tools rather than broadening generation.

</details>
