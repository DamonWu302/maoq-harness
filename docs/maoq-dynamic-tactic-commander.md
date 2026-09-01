# MAOQ Dynamic Tactic Commander

English | [中文](maoq-dynamic-tactic-commander.zh.md)

## Summary

The dynamic tactic commander turns the deterministic strategic state, a diverse fixed tactic catalog, and each tactic's matured context-conditioned record into one bounded daily choice. It may select one primary tactic, one secondary tactic, or `defensive_no_trade`; the model cannot invent a tactic, weaken eligibility, change execution rules, or bypass the independent risk veto.

## Table of Contents

- [Problem](#problem)
- [Tactic coverage](#tactic-coverage)
- [Decision architecture](#decision-architecture)
- [Dynamic scorecard](#dynamic-scorecard)
- [Commander contract](#commander-contract)
- [Learning and replay](#learning-and-replay)
- [Acceptance criteria](#acceptance-criteria)
- [Dynamic-layer P0-P2 plan](#implementation-sequence)
- [Dev Note](#dev-note)

-----

<a id="problem"></a>
## Problem

A full-period result for one tactic measures a weapon in isolation; it does not measure whether MAOQ identified the principal contradiction and chose the right weapon with information available at that time. The dynamic layer must therefore preserve fixed, auditable tactic implementations while evaluating and routing them conditionally by market regime, emotion cycle, sector structure, execution quality, and evidence uncertainty.

The shared catalog aligns the six fixed research trials, eligibility evaluation, and the general council tactic enum. A host-owned conditional scorecard and deterministic router now turn matured comparable-state evidence into a bounded top-three slate. The remaining gap is model-assisted selection and attribution: the DSH commander does not yet consume that slate, and no prequential comparison isolates value added by synthesis and veto.

-----

<a id="tactic-coverage"></a>
## Tactic coverage

The first dynamic catalog targets ten active tactic families plus defense. The count is a coverage target, not permission to add nearby parameter variants; every implementation remains a versioned trial and counts toward multiple-testing correction.

| Tactic family | Horizon | Distinct opportunity source | Initial disposition |
|---|---|---|---|
| Regime-signed breakout and controlled pullback | medium | Trend expansion with sector confirmation | Retain and revise through a new version only |
| Platform consolidation and second advance | short/medium | Supply contraction inside an intact mainline | Add |
| AH52 resistance path | medium | Shrinking overhead supply across market and sector | Add |
| Sector-cluster rotation | medium | Capital migration between co-moving sector groups | Retain as negative research evidence until redesigned |
| Sector-residual strength | medium | Stock-specific continuation inside a valid sector | Retain as negative research evidence until redesigned |
| Low-volatility sector leadership | medium | Defensive leadership without acceleration chasing | Retain as negative research evidence until redesigned |
| Executable emotion leadership | short | Startup or early acceleration in the limit-up economy | Replace the failed close-chasing form with a separately registered hypothesis |
| First-divergence core repair | short | First controlled disagreement inside an intact mainline | Add first |
| First-limit delayed price discovery | short | Delayed incorporation after a broad, executable first limit-up | Add after daily-limit reconstruction is proven |
| T+1 panic repair | short | Exhaustion and recovery after high-turnover selling | Add with an execution path of at least two sessions |
| Defensive no-trade | defense | Preserve optionality when evidence or advantage is inadequate | Always retain |

Policy and news are catalyst evidence rather than a standalone buy signal. A catalyst may raise a tactic's context score only when source quality, transmission path, sector price confirmation, breadth, capacity, and cutoff eligibility all pass.

-----

<a id="decision-architecture"></a>
## Decision architecture

```text
immutable daily snapshot
  -> deterministic strategic state
  -> unified tactic catalog and hard eligibility
  -> context-conditioned tactic scorecard
  -> deterministic top-three routing slate
  -> selected DSH specialists and commander synthesis
  -> host validation and independent risk veto
  -> tactic-specific stock ranking and next-session paper execution
  -> matured outcome attribution and scorecard update
```

One catalog owns tactic identity, family, version, promotion status, context requirements, entry and exit rules, invalidation, execution requirements, and risk limits. The research lab, eligibility evaluator, routing layer, commander schema, stock ranker, and audit reports consume that catalog rather than maintaining separate tactic unions.

The deterministic eligibility layer removes tactics that conflict with current facts. The router then ranks only permitted research or promoted tactics, while keeping promotion status explicit. A research tactic may appear in a research slate but cannot create a paper position; `defensive_no_trade` remains available even when an active tactic ranks first.

-----

<a id="dynamic-scorecard"></a>
## Dynamic scorecard

The scorecard indexes matured tactic outcomes by tactic version and bounded context: market regime, emotion cycle, sector structure, volatility band, crowding band, and execution-quality band. Each cell stores sufficient statistics for sample count, net expectancy and its 95% lower bound, win rate, payoff ratio, drawdown, fill rate, doubled-cost result, a 0.2-alpha recent-effectiveness average, observation cutoff, and exact source identities. Insufficient evidence remains uncertainty rather than becoming a zero return.

The first router uses one preregistered, versioned score rather than model-authored weights:

```text
route score =
  state fit
  + conditional expectancy lower bound
  + sector and emotion alignment
  + recent out-of-sample effectiveness
  + execution, liquidity, and catalyst confirmation
  - drawdown, crowding, transition, and uncertainty penalties
```

The v1 implementation requires eight exact-context matured samples, positive 95% expectancy lower bound, positive doubled-cost expectancy, at least 50% fill rate, and a positive final score. It freezes exact transforms and weights before replay. A weight, context bucket, decay rule, or risk-budget change creates a new router version and trial identity. The router returns the top three permitted tactics, score components, evidence references, uncertainty, maximum risk budget, cash floor, and rejection reasons; it does not select stocks.

-----

<a id="commander-contract"></a>
## Commander contract

The DSH council resolves conflicts that deterministic scores do not settle: which contradiction is principal, whether a transition is underway, whether independent policy or news evidence confirms the sector path, and whether the advantage is clear enough to act. The commander receives a bounded top-three slate and may choose at most one primary tactic and one secondary tactic.

The structured decision records the snapshot, strategic-state and router versions, principal contradiction, least-resistance battlefield, selected and rejected tactic IDs, score evidence, research or paper scope, risk budgets, cash weight, confidence, counter-evidence, transition conditions, and invalidation conditions. `tacticId` is an enum from the unified catalog rather than free-form prose.

Host validation rejects an unknown or ineligible tactic, a risk budget above the tactic limit, a research tactic presented as paper action, stale evidence, an inconsistent cash allocation, or a decision that omits required counter-evidence. The independent reviewer runs after synthesis and can convert the complete result to `defensive_no_trade`; the commander cannot reverse that veto.

Standard mode reads the current strategic mirror and deterministic slate, then runs commander synthesis and independent risk review. Deep mode adds only the specialists needed to resolve material disagreement, such as emotion, policy and macro, sector battlefield, or tactic selection; it does not invoke every specialist or rescan full history on each daily decision.

-----

<a id="learning-and-replay"></a>
## Learning and replay

The first implementation uses delayed contextual score updates, not reinforcement learning. A decision at session `t` reads only observations and matured outcomes available by its cutoff, executes no earlier than session `t+1`, and updates the scorecard only after the selected tactic's declared outcome window closes. Open or incomplete outcomes never enter the selector early, and the model never edits tactic parameters from realized results.

The 2022–2025 history is a development corpus because its aggregate results have already been inspected. A prequential replay can still test whether each simulated decision used only prior information, but it cannot serve as a sealed promotion holdout. Final promotion requires a separately frozen period that was not used to choose tactics, router features, weights, prompts, or model routes.

The replay compares `defensive_no_trade`, equal allocation, each fixed tactic, the deterministic router, the router plus DSH commander, and the complete result after risk veto. It reports net return, drawdown, turnover, switching cost, conditional regret, abstention contribution, tactic concentration, state attribution, rejected-trade contribution, token use, latency, and model-route differences. An oracle that sees future outcomes is diagnostic only and never a deployable baseline.

-----

<a id="acceptance-criteria"></a>
## Acceptance criteria

1. The research lab, eligibility evaluator, router, commander, and stock ranker consume one versioned tactic catalog.
2. The commander cannot return an unknown tactic ID, alter tactic parameters, or promote a research tactic through prose.
3. Every route is reproducible from its snapshot, state, catalog, scorecard, router version, and matured-outcome cutoff.
4. Every daily replay uses only data, news, sector membership, and completed tactic outcomes available at that decision cutoff.
5. The output preserves the top-three slate, score components, rejected tactics, uncertainty, cash weight, and invalidation conditions.
6. `defensive_no_trade` competes as a real action and is mandatory when no tactic has positive evidence after uncertainty and costs.
7. Host validation and the independent risk reviewer both fail closed, and a veto cannot render as approval.
8. Evaluation separates value added by strategic state, deterministic routing, DSH synthesis, stock ranking, execution, and risk veto.
9. The dynamic selector must beat preregistered fixed and equal-allocation baselines net of switching costs before paper promotion; the sealed-holdout policy in [P3 tactic research](maoq-p3-tactic-research.md) remains binding.
10. Standard daily operation does not scan full history or invoke all specialists; bounded scorecard reads, token use, latency, and unavailable evidence are observable.

-----

<a id="implementation-sequence"></a>
## Dynamic-layer P0-P2 plan

These phases belong to P3.5 and do not replace the project-wide P0-P5 milestones in the [roadmap](maoq-roadmap.md).

### P0 — One tactic truth and fail-closed use

**Status: implemented.** `dsh-market-tactic-eligibility` owns the six active tactic IDs, `defensive_no_trade`, their versions, families, promotion status, context requirements, execution requirements, and risk policy. The tactic lab derives its research ID and version maps from that catalog. The general council exposes the same IDs as an enum, and host validation rejects unknown tactics, mismatched `no_trade`, unknown actions, and a research tactic presented as `paper_trade`.

P0 exits when catalog identity and versions cannot drift across the eligibility evaluator, research lab, and council; invalid model output fails at the host parser; and a real Loader composition preserves a registered tactic through synthesis and veto. P0 does not claim conditional performance, top-three routing, or dynamic tactic selection.

### P1 — Conditional record and deterministic routing

**Status: implemented.** `dsh-market-tactic-routing` attributes completed results to the original strategic cutoff and current catalog version, persists content-addressed outcomes and immutable aggregate generations, and rejects future-visible evidence. A versioned deterministic router reads only the bounded scorecard, applies hard eligibility and fixed evidence thresholds, and emits the top three tactics with component scores, evidence references, rejection reasons, risk ceilings, and a cash floor.

P1 exits with content identities for every outcome, scorecard, and route; open-closed cutoff updates prevent incomplete outcomes from leaking forward; bounded date partitions avoid full-history reads; and `defensive_no_trade` wins when conditional evidence is missing, insufficient, cost-fragile, or poorly executable. The deterministic record can be replayed and compared without invoking a model; P2 owns model-assisted comparison.

### P2 — DSH commander, veto, and prequential attribution

P2 gives the DSH commander only the deterministic top-three slate and the smallest sufficient specialist evidence. The commander may choose one primary and one secondary tactic, while host validation owns scope and risk limits and an independent reviewer keeps final veto authority. Daily prequential replay then attributes the incremental value and cost of deterministic routing, DSH synthesis, stock ranking, execution, and veto.

P2 exits when every model-assisted decision is cutoff-correct and replayable, unknown or unpromoted actions fail closed, standard mode avoids full-history scans and unnecessary specialists, and the complete selector beats preregistered fixed and abstention-aware baselines net of switching costs before paper promotion.

-----

<a id="dev-note"></a>
## Dev Note

P0 and P1 supply the shared identity, conditional evidence, and deterministic routing foundation; P2 remains proposed. Existing fixed-tactic and route results remain research evidence and do not prove that model-assisted selection adds value. The next sealed date range, P2 prompt, model route, and attribution comparison remain preregistration decisions owned by their implementation changes and Agent Notes.
