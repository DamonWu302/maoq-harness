---
description: "Build cutoff-correct MAOQ scorecards, deterministic tactic routes, and validated commander decisions without rescanning full market history."
kind: "package-library"
---

# @deepseek-ai/dsh-market-tactic-routing

English | [中文](README.zh.md)

## Summary

`dsh-market-tactic-routing` attributes completed tactic results to the strategic facts known at their original decision cutoff, persists immutable outcomes and aggregate generations, and routes current eligible tactics from one bounded scorecard. It also validates and persists the commander's route-bound proposal and the independent veto as one replayable decision. The deterministic router runs without a model and keeps `defensive_no_trade` available whenever active evidence is inadequate.

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
const decision = createTacticCommanderDecision(route, proposal, risk)
```

Success returns immutable content-addressed records. Future-visible outcomes, incompatible tactic versions, a non-advancing cutoff, mismatched eligibility, incomplete strategic facts, a scorecard newer than the decision cutoff, a tactic outside the route, or a contradictory veto fails closed. `TacticRoutingStore` publishes outcomes by UTC availability day and publishes scorecards, routes, and commander decisions by content identity; bounded range reads fetch only partitions between two scorecard cutoffs.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The routing context uses market regime, emotion cycle, top-sector structure, a state-derived volatility band, top-sector crowding, and a caller-supplied execution-quality band. Each cell keeps sufficient statistics, a recent-effectiveness exponential average, and the latest visibility timestamp. This permits incremental updates without retaining raw daily bars in the scorecard.

The v2 router selects the narrowest evidence tier that reaches eight matured samples: exact context, then market regime plus emotion cycle, then the same market regime. It never borrows evidence across market regimes. Pooled return, risk, and execution metrics are recomputed from sufficient statistics; recent effectiveness is sample-weighted across cells. A broader tier receives a smaller context-alignment score. An active tactic still needs a positive 95% expectancy lower bound, positive doubled-cost expectancy, at least 50% fill rate, and a positive final score. Research tactics may enter a research slate but retain a zero paper-position ceiling.

Commander validation derives scope and position ceilings from the selected routed candidates instead of accepting model-authored authority. `defensive_no_trade` is always selectable through the route fallback even when three active tactics fill the slate. A veto replaces the final selection with defense and cannot be represented as an approved active action.

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

Indirectly, through the P2 consumer that presents the bounded route and persists the validated result. This library registers no prompt or tool and never invokes a model.

#### KV Cache effect

None. A future consumer owns any selected route text added to model context.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No forced participation** — the evidence ladder repairs exact-cell sparsity but does not manufacture an active route when same-regime evidence remains absent or negative.
- **No cross-regime transfer** — evidence learned in a bull state cannot qualify a tactic in contraction, repair, rotation, or high-volatility divergence.
- **Outcome facts are supplied by execution or replay** — the library validates and attributes completed results but does not invent returns from strategic features.
- **Historical model coverage is external** — the library validates supplied proposals and vetoes but does not generate historical model decisions; replay reports missing coverage without imputation.
- **No live order authority** — a promoted route remains a paper risk ceiling, not a broker instruction.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
