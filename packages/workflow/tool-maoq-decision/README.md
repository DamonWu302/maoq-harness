---
description: "The bounded MAOQ decision council for dynamic specialist selection, structured synthesis, and independent risk veto."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-maoq-decision

English | [中文](README.zh.md)

## Summary

`dsh-tool-maoq-decision` gives the commander one `maoq_decide` tool. The caller selects the smallest sufficient ordered subset from six market roles; those specialists run in parallel, a fresh child synthesizes one structured paper decision, and a separate fresh risk child may veto it. A deterministic host check preserves that veto. The package cannot place live orders.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Call `maoq_decide` with a concrete `objective` and an ordered `specialists` subset. Available roles are `market_regime`, `emotion_cycle`, `policy_macro`, `sector_battlefield`, `tactic_selection`, and `stock_research`. The deployment default permits at most four specialists so the commander must choose rather than convene every role.

The result carries the selected roles, normalized specialist reports, one decision, one risk review, and `approved` or `vetoed` status. Specialist reports must state evidence, counter-evidence, confidence, and invalidation conditions. The decision must state the market regime, principal contradiction, battlefield, tactic, action, candidates, and invalidation conditions.

| Field | Default | Meaning |
|---|---|---|
| `subagentProvider` | `spawn` | Fresh structured-output provider for every child. |
| `maxSpecialists` | `4` | Deployment ceiling for selected specialists. |
| `maxResultChars` | `32768` | Parent-facing rendered-result ceiling. |

<a id="understand-the-implementation"></a>
## Understand the implementation

The orchestration script, schemas, provider route, and child cap are deployment-owned. The model supplies only the objective and role subset. Selected specialists run with `Promise.all`; synthesis and risk review run afterward as distinct fresh children. The host decodes the returned object and rejects role drift, malformed decisions, inconsistent risk fields, or any attempt to pair a veto with approved status.

The real-Loader keyless fixture records the full agent-loop path and proves that selecting two roles starts only those two specialists plus synthesis and risk, then returns the independent veto.

## Model Experience

### System prompt and tool schema

#### What the model sees

The parent sees short guidance to select the smallest sufficient council and treat the risk veto as final, plus the generated [`maoq_decide` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-maoq-decision). The fixed script and child schemas are not model-selectable.

##### MAOQ decision guidance

```markdown
For a market decision, identify the current question and call maoq_decide with the smallest sufficient specialist set. Do not invoke every specialist by default. Treat its independent risk veto as final for that run. The result is analysis or a paper decision only; it cannot place a live order.
```

#### Token effect

Small fixed parent guidance and schema cost. Child cost scales with the selected specialist count plus exactly two review children.

#### KV Cache effect

The parent prefix is stable while plugin visibility is unchanged. Every council child is fresh and has an independent request cache.

## Known Limitations and Deferred Work

- **Research and paper decisions only** — no broker, portfolio mutation, or live-order authority exists.
- **Evidence quality is upstream** — the council structures reasoning but does not make stale or incomplete market inputs trustworthy.
- **One council per call** — longitudinal memory, regime transition tracking, and scheduled re-evaluation are deferred to later profile layers.
- **Risk review is model-authored** — the host enforces veto consistency, but deterministic portfolio limits need a future numeric risk engine.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Next layers may add immutable daily snapshots and deterministic portfolio-risk services without changing this tool's authority boundary.

</details>
