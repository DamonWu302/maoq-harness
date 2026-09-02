# Agent Note: Add a bounded dynamic tactic commander

Status: implemented

English | [中文](2026-09-02-maoq-dynamic-tactic-commander.zh.md)

## Problem

MAOQ needs to choose among context-eligible tactics without allowing a model to invent a weapon, reinterpret the market-data cutoff, promote a research trial, or hide switching cost. A full-period result for one tactic cannot show whether the system selected the right tactic with only evidence available at each decision time.

## Decision

The dynamic layer remains a composition of focused libraries and workflow consumers rather than an agent-loop fork. The tactic catalog owns six active research identities plus `defensive_no_trade`; the routing library owns matured outcomes, conditional scorecards, deterministic top-three routes, host-validated commander decisions, and their content-addressed persistence.

`maoq_select_tactics` reads the latest approved and currently fresh strategic mirror, loads only the newest cutoff-visible scorecard, and builds one deterministic route. A defense-only route creates a zero-agent decision. An active route starts exactly two fresh structured-output agents: one commander selects a primary tactic and optional secondary tactic from the route, then one independent reviewer approves or vetoes it. The host validates route identity, evidence membership, promotion-derived scope, risk ceilings, cash floor, and veto consistency before publishing the decision. A research tactic always retains a zero paper-position ceiling.

The tactic lab supplies a prequential replay that reconstructs daily strategic proxy features from point-in-time stock, sector, and raw execution sessions. At each cutoff, it exposes only outcomes whose observation windows have matured, creates the route, schedules future tactic outcomes without revealing them early, and applies a fixed five-basis-point switching cost. The report keeps fixed-tactic, equal-allocation, no-trade, deterministic-route, commander-proposal, and final-veto tracks separate. It also attributes each track against aligned SSE Composite, CSI 300, CSI 500, CSI 1000, and equal-weight-universe returns, including regime slices and the opportunity cost of cash. Missing historical commander decisions remain explicit zero coverage rather than being imputed.

The 2022-01-01 through 2025-12-31 production-history run contains 969 sessions, 967 routable cutoffs, and 968 comparable return observations. The deterministic route selects defense on 929 sessions and breakout-pullback on 38. It returns -3.14% after switching costs, reaches 7.49% maximum drawdown, switches 66 times, and pays 3.30% in switching costs. Fixed breakout-pullback returns 78.06% with 36.71% maximum drawdown, equal allocation returns -18.94%, and no-trade returns zero. SSE Composite returns 9.26%; the route's geometric excess is -11.35%. In `risk_on_trend`, the route is active on only 38 of 301 observations and returns -1.77% while the index returns 59.16%. It does avoid part of the loss in `risk_contraction`, but that benefit does not compensate for missed participation. Historical commander coverage is zero, so the run rejects paper promotion of the deterministic router, proves that v1 overextends defense into bullish states, and still cannot measure incremental value from DSH synthesis or veto.

## Verification

Unit coverage proves route membership, defensive fallback availability, host-derived scope, final veto, content identities, cutoff intervals, stale-state refusal, benchmark alignment, relative-return attribution, and cash opportunity-cost accounting. Prequential tests mutate a future equity point and prove every earlier route remains unchanged. A real Loader composition generates an approved strategic mirror, routes three active research tactics, starts exactly two fresh agents, and persists an approved research-scoped decision with no paper exposure. The upstream index series was backfilled from its official Tushare pipeline before the production replay ran through `pnpm run maoq:p35-canary -- --start 2022-01-01 --end 2025-12-31 --chunk-sessions 30 --query-timeout-ms 300000`.

## Alternatives considered

**Let the model choose any tactic from prose.** This permits unregistered strategies, hides the effective trial count, and cannot reproduce why a tactic was available at one cutoff.

**Choose the recent best full-period tactic.** This ignores state dependence, promotes recency chasing, and cannot distinguish a durable context edge from one favorable regime.

**Implement reinforcement learning first.** Delayed rewards, sparse context samples, changing market structure, and model non-determinism make attribution and leakage control inadequate for the first selector. The bounded scorecard makes evidence visibility auditable.

**Tune switching rules on the inspected 2022–2025 range.** This would convert development evidence into an invalid holdout. A cost-aware successor must freeze its transition policy before evaluation on a separate development range and sealed holdout.

## Consequences

Standard daily selection reads one current mirror and one bounded scorecard instead of rescanning market history. The model can resolve a bounded conflict but cannot expand the route, promote a tactic, or reverse a veto. The benchmarked replay exposes that v1's main defect is not only switching cost: it spends almost the whole bull-state sample in cash, reducing drawdown in contractions while forfeiting much larger risk-on gains. The successor must define eligible participation and evidence standards per market regime before it is frozen and evaluated on a separate range. No active tactic or dynamic router gains paper authority from this implementation; historical DSH value remains unmeasured until cutoff-correct commander records exist for an evaluation range that was not used to tune the selector.
