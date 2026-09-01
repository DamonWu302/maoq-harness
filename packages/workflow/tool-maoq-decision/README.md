---
description: "The bounded MAOQ decision council for dynamic specialist selection, structured synthesis, and independent risk veto."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-maoq-decision

English | [中文](README.zh.md)

## Summary

`dsh-tool-maoq-decision` gives the commander an evidence-bound `maoq_analyze_strategy` tool, persisted strategic decision mirrors, and a lower-level `maoq_decide` council diagnostic. The strategic tool computes deterministic market regime, emotion cycle, and sector battlefield features from immutable snapshots. Exact repeated inputs return the persisted mirror with zero new children. `maoq_state_latest`, `maoq_state_history`, and `maoq_state_get` read those mirrors without recomputing market data. Quick analysis uses one synthesis child and one independent risk child; deep analysis first runs the selected specialists in parallel. The host rejects unknown evidence or fabricated Mao method attribution. The package cannot rank stocks in P2 or place live orders.

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

Call `maoq_analyze_strategy` with a current snapshot hash, at least two prior snapshot hashes, explicit decision time, maximum feature age, concrete objective, and the smallest sufficient ordered specialist subset. P2 roles are `market_regime`, `emotion_cycle`, `policy_macro`, `sector_battlefield`, and `tactic_selection`. The deployment default permits at most four specialists.

The strategic result stores deterministic features separately from interpretation. Reports and synthesis must cite exact snapshot evidence refs, include counter-evidence and falsifiable transition conditions, and explain each selected Mao method with its application and limitation. The host supplies the work title and paraphrased principle from an allowlist. Stale or incomplete features may produce only `no_trade`, and the independent risk verdict determines final actionability. Current-state reads additionally return `freshness`; callers must treat the immutable decision as historical whenever `currentUseAllowed` is false.

| Field | Default | Meaning |
|---|---|---|
| `subagentProvider` | `spawn` | Fresh structured-output provider for every child. |
| `maxSpecialists` | `4` | Deployment ceiling for selected specialists. |
| `maxResultChars` | `32768` | Parent-facing rendered-result ceiling. |
| `analysisMode` | `quick` | `quick` runs synthesis plus independent risk; `deep` adds selected specialist reports. |
| `stateRoot` | `.maoq/decisions` | Directory containing immutable strategic decision mirrors. |
| `maxStateFiles` | `500` | Maximum files scanned by latest and history queries. |
| `maxSnapshotFiles` | `500` | Maximum immutable snapshots scanned to verify the newest usable market input. |

<a id="understand-the-implementation"></a>
## Understand the implementation

The orchestration script, schemas, provider route, and child cap are deployment-owned. Before loading snapshots or resolving a child provider, the strategic path derives a SHA-256 decision ID from the exact objective, snapshot hashes, decision time, age bound, specialist set, analysis mode, feature/workflow versions, provider route, and available Codex-provider settings fingerprint. A matching persisted record returns immediately with `cacheHit: true` and `agentsStarted: 0`. A miss loads snapshots by exact hash, computes versioned features, runs the selected workflow, and atomically publishes the completed result under that ID. Failed workflows are never cached. Quick mode applies the selected roles as synthesis lenses and starts exactly two children: synthesis, then independent risk review. Deep mode runs selected specialists with `Promise.all`, followed by the same two fresh children. Each child schema enumerates the exact evidence refs available in that feature record, while the host still rejects role drift, rewritten deterministic labels, unknown evidence refs, unrecognized method IDs, inconsistent risk fields, and any attempt to make stale or incomplete inputs actionable. The optional settings provider exposes `maoq-decision`; changes affect the next call without a restart.

The latest and by-ID query tools evaluate current use without mutating the mirror. They resolve the newest cutoff-safe snapshot from the host catalog rather than trusting a model-supplied hash. Maximum age, an unverifiable or changed snapshot, feature/workflow version drift, analysis-mode drift, or provider-route drift produces `freshness.status: stale` and `currentUseAllowed: false`, with explicit reasons. The record remains available for replay, but cannot silently become a current recommendation.

The Loader composition fixture proves both tools load with the profile services. Focused workflow fixtures prove that selected roles remain bounded, evidence references close over the deterministic catalog, resolved answers name the Mao source work, and an independent veto remains final.

-----

<a id="further-exploration"></a>
## Further Exploration

- [Strategic state library](../../market/market-strategic-state/README.md) — deterministic labels, evidence addresses, and attribution catalog.
- [Market snapshot](../../market/market-snapshot/README.md) — immutable inputs loaded by hash.
- [MAOQ roadmap](../../../docs/maoq-roadmap.md) — P2 scope and acceptance criteria.

## Model Experience

### System prompt and tool schema

#### What the model sees

The parent sees short guidance to read persisted state tools first, use `maoq_analyze_strategy` only when no matching state exists, preserve deterministic features and Mao method attribution, and treat the risk veto as final. It also sees the generated [tool schemas](../../../docs/tool-catalog.md#deepseek-aidsh-tool-maoq-decision). Fixed scripts and child schemas are not model-selectable.

##### MAOQ decision guidance

```markdown
For current-state or multi-day review questions, read the persisted decision mirrors with maoq_state_latest, maoq_state_history, or maoq_state_get before considering a new analysis. A persisted mirror is current only when freshness.currentUseAllowed is true; otherwise use it for history only and obtain a new immutable snapshot before analysis. Call maoq_analyze_strategy with the smallest sufficient specialist set only when no matching current state exists or a new immutable snapshot requires one; exact repeated inputs return the persisted state without starting agents. Its deterministic features, evidence references, Mao method attributions, and independent risk veto are binding. Use maoq_decide only for council-runtime diagnostics. None of these tools can place a live order or rank stocks in the P2 strategic-state phase.
```

#### Token effect

Small fixed parent guidance and five schemas add prefix cost. A cache miss presents the selected deterministic feature record to the strategic workflow. An exact cache hit and all three state queries start no children and add no child-model token usage. Quick misses pay for two child contexts; deep misses add one context per selected specialist.

#### KV Cache effect

The parent prefix is stable while plugin visibility is unchanged. Every council child is fresh and has an independent request cache.

## Known Limitations and Deferred Work

- **Research and paper decisions only** — no broker, portfolio mutation, or live-order authority exists.
- **Daily state only** — intraday transitions need a separate point-in-time feature contract.
- **Sector persistence needs history** — fewer than two prior compatible snapshots forces `no_trade`.
- **No stock ranking in P2** — `maoq_analyze_strategy` ends at sector battlefield and strategic posture; candidate selection belongs to P3.
- **Risk review is model-authored** — the host enforces veto consistency, but deterministic portfolio limits need a future numeric risk engine.
- **P0 cache identity is exact-input only** — semantically equivalent objectives with different wording create different mirrors; canonical once-per-trading-day generation belongs to the next scheduling slice.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
