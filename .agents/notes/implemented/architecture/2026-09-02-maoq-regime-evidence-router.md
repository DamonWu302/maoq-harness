# Agent Note: Route tactics through a same-regime evidence ladder

Status: implemented

English | [中文](2026-09-02-maoq-regime-evidence-router.zh.md)

## Problem

The first deterministic router required eight matured observations in one exact six-dimensional context cell. The 2022–2025 replay showed that this fragmentation extended defense into 263 of 301 `risk_on_trend` decisions even though an active fixed tactic earned materially more over that state. Lowering the sample floor would make each estimate noisier, while forcing activity would invent exposure without positive evidence.

## Decision

The tactic catalog owns every tactic family's eligible market regimes and emotion cycles. Automated coverage requires at least one active tactic family for every market regime, so a catalog omission cannot silently turn one state into permanent defense.

Router v2 selects the narrowest evidence tier that reaches the unchanged eight-sample floor: exact context, market regime plus emotion cycle, then market regime. It never pools observations across market regimes. Pooled expectancy, variance, lower bound, win rate, payoff, fill rate, doubled-cost result, and drawdown are recomputed from cell sufficient statistics; recent effectiveness is sample-weighted across cells. Broader evidence receives a smaller context-alignment contribution. Every active route still requires a positive 95% expectancy lower bound, positive doubled-cost expectancy, at least 50% fill rate, and a positive route score.

Each candidate and daily replay record stores its selected evidence scope. Route, eligibility-engine, and dynamic-replay versions advance so old identities cannot be mistaken for the new policy. Research tactics keep zero paper authority.

## Verification

Focused tests prove catalog regime coverage, exact-context selection, regime-emotion and same-regime pooling, rejection of cross-regime borrowing, evidence-scope serialization, unchanged positive-evidence gates, and daily replay audit fields. The production-history v3 replay covers 969 sessions and 967 routable cutoffs. Missing or insufficient evidence rejections fall from 446 to 93, but the route remains defensive on 929 sessions and active on 38; all active selections still use exact-context evidence. Total return remains -3.14% versus +9.26% for the SSE Composite. P1 therefore passes correctness and sparsity acceptance but fails participation acceptance. The inspected 2022–2025 interval remains development evidence rather than a promotion holdout.

## Alternatives considered

**Force a minimum daily participation rate.** This optimizes activity instead of victory and can convert missing or negative evidence into exposure.

**Pool all historical contexts.** This would let bull-state evidence qualify a tactic during contraction or high-volatility divergence, erasing the principal contradiction the router is intended to respect.

**Lower the exact-cell sample floor.** This increases the number of routes by accepting less reliable estimates instead of using more comparable observations.

**Tune the ladder after each 2022–2025 result.** That interval has already been inspected and cannot become a sealed holdout. P1 freezes the ladder before reading its successor result; P2 transition parameters require their own preregistration.

## Consequences

The router can learn a tactic's behavior within the current market regime even when secondary context dimensions fragment the exact cells. It remains allowed to hold cash when same-regime evidence is missing, cost-fragile, or statistically nonpositive. Wider evidence is less context-specific, so its scope is visible to the commander and receives a smaller score contribution. The replay shows that sparse cells were not the principal cause of over-defense: static context exclusion and nonpositive same-regime evidence now dominate. P2 must revise the regime combat policy before spending effort on switching hysteresis.
