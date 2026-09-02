# Agent Note: MAOQ model-led tactic council

Status: implemented

English | [中文](2026-09-02-maoq-model-led-tactic-council.zh.md)

## Problem

The P2 tactic commander currently treats the deterministic top-three route as both quantitative advice and an absolute model allowlist. The model can reorder that shortlist, but it cannot identify a lower-ranked hard-feasible tactic as the path of least resistance, select the experts needed for the current contradiction, or preserve expert disagreement. This makes the harness behave like a scripted router with prose rather than a model-led investment committee.

The relaxation must not let model prose bypass catalog registration, hard data gates, promotion scope, execution evidence, or the independent risk veto.

## Decision

The route exposes two distinct host-owned surfaces. `slate` remains the deterministic quantitative recommendation. The advisory universe contains every catalog tactic that passes hard feasibility gates, plus defense, with catalog rules, state fit, eligible sectors, quantitative disposition, evidence, and rejection reasons.

A model planner selects exactly two relevant specialists from a fixed registry: short-term sentiment, big-bull trend, short-fast execution, oversold reversal, and sector rotation. The selected specialists run independently and return structured support, opposition, evidence, confidence, and invalidation.

The commander synthesizes those reports into a battle plan containing the market phase, principal contradiction, rewarded style, posture, primary and optional secondary tactic, stock-selection missions, evidence, counter-evidence, confidence, and invalidation. It records whether it follows or overrides the quantitative slate. An override requires an explicit rationale and counter-evidence.

The host accepts tactic IDs only from the route's advisory universe. A tactic outside the deterministic slate is always research-only with zero paper-position authority, even if its catalog promotion is higher. The model cannot rewrite entries, exits, promotion, evidence, position ceilings, or the data cutoff.

An independent risk agent reviews the complete battle plan and specialist disagreement. Its veto remains final and deterministically replaces the action with defense. The full proposal, selected specialists, reports, risk review, and derived authority are content-addressed and persisted for replay and attribution.

This slice stops before stock ranking and order construction. `stockMissions` express what the next stock-selection layer must search for; they are not candidates or orders.

## Alternatives considered

**Keep the deterministic top three as the hard model allowlist.** This preserves the smallest validation surface, but it defeats the purpose of using a reasoning harness: the model cannot challenge a sparse or lagging scorecard and cannot choose a different form of attack for the current market.

**Let the model invent or modify tactics.** This offers maximum freedom but destroys replayability, promotion control, and falsifiable attribution. New tactics must enter through the source-controlled catalog and validation process.

**Run every specialist on every decision.** This maximizes coverage but adds latency, token cost, and correlated narrative noise. Dynamic selection of two specialists keeps diverse judgment while forcing the planner to identify the current principal contradiction.

**Allow an override to inherit paper authority from catalog promotion.** This would turn prose into an execution-policy bypass. Only deterministic route qualification can grant the route's existing watch or paper authority.

## Verification

- The model sees the deterministic slate as advice and the complete hard-feasible advisory universe as its bounded research space.
- A planner chooses two unique specialists from the fixed registry, and only those specialists run.
- The persisted proposal includes specialist reports and a structured battle plan with principal contradiction, posture, stock missions, evidence, counter-evidence, confidence, and invalidation.
- Following and overriding the quantitative slate are distinguishable; an override without rationale and counter-evidence is rejected by host validation.
- Unknown, hard-infeasible, or uncatalogued tactics are rejected.
- A route-external advisory tactic is forced to research scope, zero paper position, and a 100 percent cash floor.
- Independent risk veto deterministically produces defense while retaining the rejected proposal for attribution.
- Model-visible prompts and schemas are covered by real Loader composition or keyless snapshot tests, and token usage includes planner, selected specialists, commander, and risk calls.

## Consequences

The wider research universe may cause the model to favor compelling narratives over measured conditional expectancy. Structured disagreement, mandatory override evidence, zero route-external authority, durable attribution, and later outcome scoring limit that risk but do not eliminate it.

Two specialists can miss a relevant lens. The planner's selection is persisted so missed expertise can be attributed and evaluated; expanding the count requires latency and outcome evidence rather than intuition.
