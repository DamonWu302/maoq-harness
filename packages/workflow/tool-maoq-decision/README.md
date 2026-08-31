---
description: "The bounded MAOQ decision council for dynamic specialist selection, structured synthesis, and independent risk veto."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-maoq-decision

English | [中文](README.zh.md)

## Summary

`dsh-tool-maoq-decision` gives the commander an evidence-bound `maoq_analyze_strategy` tool and a lower-level `maoq_decide` council diagnostic. The strategic tool computes deterministic market regime, emotion cycle, and sector battlefield features from immutable snapshots before selected specialists run. A fresh child synthesizes the principal contradiction, a separate risk child may veto it, and the host rejects unknown evidence or fabricated Mao method attribution. The package cannot rank stocks in P2 or place live orders.

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

The strategic result stores deterministic features separately from interpretation. Reports and synthesis must cite exact snapshot evidence refs, include counter-evidence and falsifiable transition conditions, and explain each selected Mao method with its application and limitation. The host supplies the work title and paraphrased principle from an allowlist. Stale or incomplete features may produce only `no_trade`, and the independent risk verdict determines final actionability.

| Field | Default | Meaning |
|---|---|---|
| `subagentProvider` | `spawn` | Fresh structured-output provider for every child. |
| `maxSpecialists` | `4` | Deployment ceiling for selected specialists. |
| `maxResultChars` | `32768` | Parent-facing rendered-result ceiling. |

<a id="understand-the-implementation"></a>
## Understand the implementation

The orchestration script, schemas, provider route, and child cap are deployment-owned. The strategic path loads snapshots by exact hash and computes versioned features before any child runs. Selected specialists run with `Promise.all`; synthesis and risk review run afterward as distinct fresh children. The host rejects role drift, rewritten deterministic labels, unknown evidence refs, unrecognized method IDs, inconsistent risk fields, and any attempt to make stale or incomplete inputs actionable.

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

The parent sees short guidance to use `maoq_analyze_strategy` for snapshot-grounded decisions, preserve deterministic features and Mao method attribution, and treat the risk veto as final. It also sees the generated [tool schemas](../../../docs/tool-catalog.md#deepseek-aidsh-tool-maoq-decision). Fixed scripts and child schemas are not model-selectable.

##### MAOQ decision guidance

```markdown
For a strategic market decision grounded in an immutable snapshot, call maoq_analyze_strategy with the smallest sufficient specialist set. Its deterministic market regime, emotion cycle, sector battlefield features, evidence references, Mao method attributions, and independent risk veto are binding. Use maoq_decide only for council-runtime diagnostics. Neither tool can place a live order or rank stocks in the P2 strategic-state phase.
```

#### Token effect

Small fixed parent guidance and two schemas add prefix cost. Each strategic call also presents the selected deterministic feature record; child cost scales with its evidence size, selected specialist count, and exactly two review children.

#### KV Cache effect

The parent prefix is stable while plugin visibility is unchanged. Every council child is fresh and has an independent request cache.

## Known Limitations and Deferred Work

- **Research and paper decisions only** — no broker, portfolio mutation, or live-order authority exists.
- **Daily state only** — intraday transitions need a separate point-in-time feature contract.
- **Sector persistence needs history** — fewer than two prior compatible snapshots forces `no_trade`.
- **No stock ranking in P2** — `maoq_analyze_strategy` ends at sector battlefield and strategic posture; candidate selection belongs to P3.
- **Risk review is model-authored** — the host enforces veto consistency, but deterministic portfolio limits need a future numeric risk engine.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
