---
description: "Build cutoff-correct MAOQ conditional tactic scorecards and deterministic top-three routing slates without rescanning full market history."
kind: "package-library"
---

# @deepseek-ai/dsh-market-tactic-routing

English | [中文](README.zh.md)

## Summary

`dsh-market-tactic-routing` attributes completed tactic results to the strategic facts known at their original decision cutoff, persists immutable outcomes and aggregate generations, and routes current eligible tactics from one bounded scorecard. The router emits at most three catalog tactics with score components, evidence references, rejection reasons, risk ceilings, and a cash floor. It runs without a model and keeps `defensive_no_trade` available whenever active evidence is inadequate.

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

Use this library after P0 eligibility and before model-assisted P2 synthesis. A completed paper or replay result enters through `attributeMaturedTacticOutcome()`, which takes the original `StrategicFeatureRecord`, derives the fixed context bands, and binds the current catalog version. `advanceTacticScorecard()` accepts only outcomes newly visible after the previous cutoff. `routeEligibleTactics()` then reads the aggregate generation rather than raw outcomes or full daily history.

### Entry point

```text
const outcome = attributeMaturedTacticOutcome(completed)
const next = advanceTacticScorecard(previous, [outcome], cutoffTime)
const route = routeEligibleTactics(features, eligibility, next)
```

Success returns immutable content-addressed records. Future-visible outcomes, incompatible tactic versions, a non-advancing cutoff, mismatched eligibility, incomplete strategic facts, and a scorecard newer than the decision cutoff fail closed. `TacticRoutingStore` publishes outcomes by UTC availability day and scorecards by content identity; bounded range reads fetch only partitions between two scorecard cutoffs.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The v1 context uses market regime, emotion cycle, top-sector structure, a state-derived volatility band, top-sector crowding, and a caller-supplied execution-quality band. Each cell keeps sufficient statistics, a recent-effectiveness exponential average, and the latest visibility timestamp. This permits incremental updates without retaining raw daily bars in the scorecard.

An active tactic needs eight matured exact-context samples, a positive 95% expectancy lower bound, positive doubled-cost expectancy, at least 50% fill rate, and a positive final score. The fixed score combines state fit, conditional expectancy, exact-context alignment, recent effectiveness, execution and doubled-cost evidence, then subtracts drawdown, crowding, transition, and sample-uncertainty penalties. Research tactics may enter a research slate but retain a zero paper-position ceiling.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Market tactic routing subsystem](../../../docs/subsystems/market-tactic-routing.md) — outcome visibility, aggregate generations, and route semantics.
- [Market tactic eligibility](../market-tactic-eligibility/README.md) — the shared catalog and hard context gates.
- [Dynamic tactic commander](../../../docs/maoq-dynamic-tactic-commander.md) — P0-P2 architecture and acceptance criteria.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through future P2 consumers that present the bounded route. This library registers no prompt or tool and never invokes a model.

#### KV Cache effect

None. A future consumer owns any selected route text added to model context.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Exact context only** — v1 does not borrow evidence from adjacent or broader context cells; missing exact evidence produces uncertainty and defense.
- **Outcome facts are supplied by execution or replay** — the library validates and attributes completed results but does not invent returns from strategic features.
- **No model comparison yet** — P2 owns DSH-assisted selection and the incremental attribution against this deterministic route.
- **No live order authority** — a promoted route remains a paper risk ceiling, not a broker instruction.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
