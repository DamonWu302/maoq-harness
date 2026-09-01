---
description: "Deterministic MAOQ market regime, emotion cycle, sector battlefield features, and evidence-bound Mao method attribution."
kind: "package-library"
---

# @deepseek-ai/dsh-market-strategic-state

English | [中文](README.zh.md)

## Summary

`dsh-market-strategic-state` lets a caller compute replay-stable market regime, emotion cycle, and sector battlefield features from immutable snapshots. Each state cites exact snapshot fields and fails independently when its required observations are unavailable. A separate validator binds model interpretation to those evidence references and enriches allowlisted Mao method IDs from a host-owned attribution catalog. The library ranks sectors only; it neither ranks stocks nor authorizes orders.

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

### When to use it

Use this library after `dsh-market-snapshot` has frozen the current decision cutoff and at least two prior snapshots are available for sector persistence. Use a model-facing consumer such as `dsh-tool-maoq-decision` when interpretation, specialist aggregation, or risk review is also required.

### Entry point

The deterministic entry accepts an immutable current snapshot and explicit history. The interpretation entry accepts the resulting feature record, a structured draft, an explicit decision time, and a maximum age; it rejects unknown evidence references and forces stale or incomplete inputs to `no_trade`.

```text
const features = computeStrategicFeatures(current, history)
const state = buildStrategicStateRecord(features, interpretation, decisionTime, maximumAgeHours)
```

Success returns deeply frozen deterministic and interpretation layers. Validation failures throw `StrategicInterpretationValidationError`; an unavailable deterministic component remains a typed result instead of becoming an invented default.

For the P2 rolling release check, `evaluateP2StrategicCanary()` selects the newest snapshot per trading date, reserves two dates for sector-history warm-up, and evaluates the following ten dates without model calls. Production callers can require both the source adapter and immutable mapping-version token. Run the repository check against the local store with `pnpm run maoq:p2-canary`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The feature engine computes market and emotion labels from current breadth and emotion observations. Sector comparison adds explicit prior snapshots, checks classification compatibility, and computes strength, persistence, capacity, catalyst support, internal breadth, leader quality, crowding, and resistance. Every observation receives a stable `snapshot:<hash>#<path>` address before interpretation.

The model-facing draft cannot supply source titles or quotations. It selects a method ID and explains its application, evidence references, and limitation; the host resolves the ID to a fixed work title, source URL, and paraphrased principle. This keeps attribution and market evidence outside model control.

| File | Role |
|---|---|
| [`src/features.ts`](src/features.ts) | Deterministic labels, sector dimensions, and evidence catalog |
| [`src/canary.ts`](src/canary.ts) | Rolling production provenance, replay, and eligibility gate |
| [`src/interpretation.ts`](src/interpretation.ts) | Evidence, staleness, posture, and confidence validation |
| [`src/mao-methods.ts`](src/mao-methods.ts) | Allowlisted work titles and paraphrased principles |
| [`src/types.ts`](src/types.ts) | Versioned feature and interpretation contracts |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Strategic state subsystem](../../../docs/subsystems/market-strategic-state.md) — labels, evidence references, and failure semantics.
- [Market snapshot](../market-snapshot/README.md) — immutable observations consumed by this library.
- [MAOQ decision tool](../../workflow/tool-maoq-decision/README.md) — model interpretation and independent risk review.
- [MAOQ roadmap](../../../docs/maoq-roadmap.md) — P2 scope and acceptance criteria.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through model-facing consumers that present selected feature records and own every prompt or tool schema.

#### KV Cache effect

None by itself. The library registers no prompt or tool; each consumer owns the cache effect of presenting a feature record.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits keep deterministic observations distinct from interpretation and execution.

- **Daily features only** — intraday transitions require a separate point-in-time input contract.
- **Two prior snapshots for sector persistence** — shorter history makes only the sector component unavailable and prevents an actionable posture.
- **Twelve snapshots for the ten-day canary** — two earlier trading dates are warm-up inputs; only the following ten dates count as fully evaluated evidence.
- **Versioned thresholds are policy** — threshold changes require a new engine version and refreshed gold fixtures.
- **Attributions are paraphrases** — the catalog names source works and method summaries; it does not claim edition-specific verbatim quotations.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
