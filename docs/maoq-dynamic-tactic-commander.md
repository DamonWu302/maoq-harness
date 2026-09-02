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

The shared catalog aligns the six fixed research trials, eligibility evaluation, and the general council tactic enum. A host-owned conditional scorecard and deterministic router turn matured comparable-state evidence into a bounded top-three slate; `maoq_select_tactics` then runs constrained commander synthesis, host validation, and independent risk veto. Prequential replay can measure deterministic routing, but the historical range has no recorded model decisions, so it cannot yet measure value added by DSH synthesis and veto.

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

The v2 implementation selects the narrowest evidence tier that reaches eight matured samples: exact context, then market regime plus emotion cycle, then the same market regime. Evidence never crosses a market-regime boundary. Wider tiers recompute return, risk, and execution metrics from cell sufficient statistics, sample-weight recent effectiveness, and receive a smaller context-alignment contribution. Positive 95% expectancy lower bound, positive doubled-cost expectancy, at least 50% fill rate, and a positive final score remain mandatory. A weight, context bucket, evidence ladder, decay rule, or risk-budget change creates a new router version and trial identity. The router returns the top three permitted tactics, score components, evidence tier, evidence references, uncertainty, maximum risk budget, cash floor, and rejection reasons; it does not select stocks.

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

The replay compares `defensive_no_trade`, equal allocation, each fixed tactic, the deterministic router, the router plus DSH commander, and the complete result after risk veto. It binds each comparable session to the SSE Composite, CSI 300, CSI 500, CSI 1000, and a labeled equal-weight A-share universe. Each comparison reports geometric excess return, annualized excess return, information ratio, beta, upside and downside capture, cash opportunity cost, avoided loss, and strategy-versus-benchmark attribution by decision-date market regime. An oracle that sees future outcomes is diagnostic only and never a deployable baseline.

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
8. Evaluation separates value added by strategic state, deterministic routing, DSH synthesis, stock ranking, execution, and risk veto, and reports the same track against complete real-index and equal-weight baselines.
9. The dynamic selector must beat its preregistered fixed, equal-allocation, abstention-aware, and market-index baselines net of switching costs before paper promotion; the sealed-holdout policy in [P3 tactic research](maoq-p3-tactic-research.md) remains binding.
10. Standard daily operation does not scan full history or invoke all specialists; bounded scorecard reads, token use, latency, and unavailable evidence are observable.

-----

<a id="implementation-sequence"></a>
## Dynamic-layer P0-P2 plan

These phases belong to P3.5 and do not replace the project-wide P0-P5 milestones in the [roadmap](maoq-roadmap.md).

| Phase | Status | Main deliverable | Acceptance result |
|---|---|---|---|
| P0 — One tactic truth | Complete | Versioned catalog, derived research IDs, model schema, and fail-closed host validation | The catalog, lab, research tool, and council share one identity; focused tests and the real Loader composition pass |
| P1 — Conditional record and routing | Complete | Matured outcomes, immutable conditional scorecard, deterministic top-three slate, and defensive fallback | Automated coverage proves cutoff, content identity, insufficient-evidence, and future-data rejection behavior |
| P2 — Commander and attribution | Implemented; not promoted | `maoq_select_tactics`, commander decision records, independent veto, prequential replay, and real-index attribution | Deterministic replay loses to no-trade and the SSE Composite after costs; historical model coverage is zero, so paper promotion is prohibited |

### P0 — One tactic truth and fail-closed use

**Status: implemented.** `dsh-market-tactic-eligibility` owns the six active tactic IDs, `defensive_no_trade`, their versions, families, promotion status, context requirements, execution requirements, and risk policy. The tactic lab derives its research IDs and version map from that catalog, and the model-facing research tool consumes the derived ID list. The general council exposes the same IDs as an enum, and host validation rejects unknown tactics, mismatched `no_trade`, unknown actions, and a research tactic presented as `paper_trade`.

P0 exits when catalog identity and versions cannot drift across the eligibility evaluator, research lab, research tool, and council; invalid model output fails at the host parser; and a real Loader composition preserves a registered tactic through synthesis and veto. P0 does not claim conditional performance, top-three routing, or dynamic tactic selection.

### P1 — Conditional record and deterministic routing

**Status: implemented.** `dsh-market-tactic-routing` attributes completed results to the original strategic cutoff and current catalog version, persists content-addressed outcomes and immutable aggregate generations, and rejects future-visible evidence. A versioned deterministic router reads only the bounded scorecard, applies hard eligibility and fixed evidence thresholds, and emits the top three tactics with component scores, evidence references, rejection reasons, risk ceilings, and a cash floor.

P1 exits with content identities for every outcome, scorecard, and route; open-closed cutoff updates prevent incomplete outcomes from leaking forward; bounded date partitions avoid full-history reads; and `defensive_no_trade` wins when conditional evidence is missing, insufficient, cost-fragile, or poorly executable. The deterministic record can be replayed and compared without invoking a model; P2 owns model-assisted comparison.

### P2 — DSH commander, veto, and prequential attribution

**Status: implemented and not promoted.** `maoq_select_tactics` gives the DSH commander only the deterministic top-three slate, defensive fallback, and smallest sufficient evidence. The commander may choose one primary and one secondary tactic, while host validation owns scope and risk limits and an independent reviewer keeps final veto authority. Structured decisions, token use, route identity, and final veto are persisted for later attribution.

The point-in-time replay from 2022-01-01 through 2025-12-31 covers 969 sessions, of which 967 are routable. The deterministic route selects defense on 929 sessions and breakout-pullback on 38. With 5 basis points of switching cost, it returns -3.14%, reaches 7.49% maximum drawdown, switches 66 times, and pays 3.30% in switching costs. The fixed breakout-pullback tactic returns 78.06% with 36.71% maximum drawdown, equal allocation returns -18.94%, and no-trade returns zero. The current router reduces drawdown, but excessive abstention and switching fail the paper-promotion criterion.

The benchmark baseline uses 968 aligned return observations. The SSE Composite returns 9.26%, so the deterministic route trails it by 11.35%. During 301 `risk_on_trend` decision sessions, the route is active on only 38 sessions and returns -1.77% while the SSE Composite returns 59.16%. During 366 `risk_contraction` sessions, the route returns -0.80% while the index loses 13.14%. Defense therefore avoids contraction losses, but the selector incorrectly carries abstention into the main risk-on opportunity set.

The historical range contains no recorded DSH commander decisions, so the model-proposal and final-veto tracks both fall back to no-trade and model coverage is zero. This replay can reject the current deterministic dynamic router; it cannot show that model selection has no value, and the same 2022–2025 range cannot be tuned and then presented as a passing holdout. The regime-evidence successor defines catalog-owned state and emotion coverage plus a same-regime evidence ladder. It intentionally does not force participation: absence of same-regime evidence or negative cost-adjusted evidence still selects defense. Hysteresis, minimum holding period, and cost-aware transition remain a separate successor decision that must be frozen before evaluation on a separate development range and sealed holdout.

### Router-correction P0-P2

These correction phases address the over-defense finding above and are separate from the original P3.5 delivery phases.

| Phase | Status | Deliverable | Acceptance |
|---|---|---|---|
| P0 — Diagnose participation | Complete | Regime-sliced benchmark, route counts, rejection counts, and fixed-tactic comparison | Prove whether defense is justified by state or caused by router sparsity |
| P1 — Regime evidence router | Implemented, acceptance failed | Catalog-owned regime/emotion coverage, exact → regime-emotion → same-regime evidence ladder, audited evidence scope | No cross-regime leakage and fewer sparse-evidence rejections passed; active participation did not increase |
| P2 — Regime combat policy | Implemented; correction accepted, not promoted | Hard feasibility separated from state-fit priors, feasible same-regime comparison, opportunity-cost attribution, and versioned transition control | Active selections increase from 38 to 132 and net return improves from -3.14% to +2.70%, but the route still trails the SSE Composite and fixed breakout baseline |

The v4 correction replay retains 969 sessions and 967 routable cutoffs. The raw route selects defense 835 times, breakout-pullback 72, exhaustion repair 59, and low-volatility sector leadership once. The transition-controlled track is active on 132 of 968 comparable sessions, returns +2.70% after 5-basis-point switching costs, reaches 9.35% maximum drawdown, and pays 9.90% cumulative switching charges. It improves on both P1's -3.14% and the v4 stateless route's +1.58%. The transition changes only one daily selection, however: one minimum-hold retention occurs, while no challenger-margin switch occurs. Its apparent return increment is therefore development evidence, not broad validation of the five-session and 0.03 parameters.

The correction is economically incomplete. The SSE Composite returns +9.26%, the equal-weight quality universe +62.00%, and fixed breakout-pullback +78.06%. In 301 `risk_on_trend` observations the corrected route is active on 81 and returns +16.61%, while the SSE Composite returns +59.16%. It improves contraction handling to -8.37% against the index's -13.14%, and its 9.35% maximum drawdown is much smaller than the index's 25.61%, but low upside participation remains the principal contradiction. Benchmark attribution also reports 18.94% opportunity cost against the equal-weight universe during cash sessions. P2 therefore passes its preregistered correction criterion—better net performance than P1 without worsening every regime—but still fails paper promotion and cannot use this inspected range as a sealed holdout.

P2 exits when every model-assisted decision is cutoff-correct and replayable, unknown or unpromoted actions fail closed, standard mode avoids full-history scans and unnecessary specialists, and the complete selector beats preregistered fixed and abstention-aware baselines net of switching costs before paper promotion.

-----

<a id="dev-note"></a>
## Dev Note

P0 through P2 host capabilities, hard/soft gate separation, same-regime routing, transition attribution, and no-look-ahead replay are implemented. Router-correction P2 repairs much of the over-defense defect and turns the development result positive, but it still loses to the SSE Composite and captures too little of `risk_on_trend`; model-assisted incremental value also remains unmeasured. The next trial must improve bullish participation and exposure using point-in-time evidence, while preserving contraction defense, and must be evaluated on a new preregistered development range followed by a sealed holdout. The inspected 2022–2025 range cannot authorize threshold tuning or paper promotion.
