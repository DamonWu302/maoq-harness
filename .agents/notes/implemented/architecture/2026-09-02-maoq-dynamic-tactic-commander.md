# Agent Note: Add a bounded dynamic tactic commander

Status: implemented

English | [中文](2026-09-02-maoq-dynamic-tactic-commander.zh.md)

## Problem

MAOQ needs to choose among context-eligible tactics without allowing a model to invent a weapon, reinterpret the market-data cutoff, promote a research trial, or hide switching cost. A full-period result for one tactic cannot show whether the system selected the right tactic with only evidence available at each decision time.

## Decision

The dynamic layer remains a composition of focused libraries and workflow consumers rather than an agent-loop fork. The tactic catalog owns six active research identities plus `defensive_no_trade`; the routing library owns matured outcomes, conditional scorecards, deterministic top-three routes, host-validated commander decisions, and their content-addressed persistence.

`maoq_select_tactics` reads the latest approved and currently fresh strategic mirror, loads only the newest cutoff-visible scorecard, and builds one deterministic route. A defense-only route creates a zero-agent decision. An active route starts exactly two fresh structured-output agents: one commander selects a primary tactic and optional secondary tactic from the route, then one independent reviewer approves or vetoes it. The host validates route identity, evidence membership, promotion-derived scope, risk ceilings, cash floor, and veto consistency before publishing the decision. A research tactic always retains a zero paper-position ceiling.

The tactic lab supplies a prequential replay that reconstructs daily strategic proxy features from point-in-time stock, sector, and raw execution sessions. At each cutoff, it exposes only outcomes whose observation windows have matured, creates the route, schedules future tactic outcomes without revealing them early, and applies a fixed five-basis-point switching cost. The report keeps fixed-tactic, equal-allocation, no-trade, deterministic-route, commander-proposal, and final-veto tracks separate. Missing historical commander decisions remain explicit zero coverage rather than being imputed.

The 2022-01-01 through 2025-12-31 production-history run contains 969 sessions and 964 routable cutoffs. The deterministic route selects defense on 925 sessions and breakout-pullback on 39. It returns -2.43% after switching costs, reaches 7.14% maximum drawdown, switches 68 times, and pays 3.40% in switching costs. Fixed breakout-pullback returns 80.50% with 36.71% maximum drawdown, equal allocation returns -15.99%, and no-trade returns zero. Historical commander coverage is zero, so the run rejects paper promotion of the deterministic router but does not measure incremental value from DSH synthesis or veto.

## Verification

Unit coverage proves route membership, defensive fallback availability, host-derived scope, final veto, content identities, cutoff intervals, and stale-state refusal. Prequential tests mutate a future equity point and prove every earlier route remains unchanged. A real Loader composition generates an approved strategic mirror, routes three active research tactics, starts exactly two fresh agents, and persists an approved research-scoped decision with no paper exposure. The production replay runs through `pnpm run maoq:p35-canary -- --start 2022-01-01 --end 2025-12-31 --chunk-sessions 30 --query-timeout-ms 300000`.

## Alternatives considered

**Let the model choose any tactic from prose.** This permits unregistered strategies, hides the effective trial count, and cannot reproduce why a tactic was available at one cutoff.

**Choose the recent best full-period tactic.** This ignores state dependence, promotes recency chasing, and cannot distinguish a durable context edge from one favorable regime.

**Implement reinforcement learning first.** Delayed rewards, sparse context samples, changing market structure, and model non-determinism make attribution and leakage control inadequate for the first selector. The bounded scorecard makes evidence visibility auditable.

**Tune switching rules on the inspected 2022–2025 range.** This would convert development evidence into an invalid holdout. A cost-aware successor must freeze its transition policy before evaluation on a separate development range and sealed holdout.

## Consequences

Standard daily selection reads one current mirror and one bounded scorecard instead of rescanning market history. The model can resolve a bounded conflict but cannot expand the route, promote a tactic, or reverse a veto. The replay exposes that v1 reduces drawdown but switches too often to retain an advantage after costs. No active tactic or dynamic router gains paper authority from this implementation; historical DSH value remains unmeasured until cutoff-correct commander records exist for an evaluation range that was not used to tune the selector.
