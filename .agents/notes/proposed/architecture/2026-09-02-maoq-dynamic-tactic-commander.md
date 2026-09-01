# Agent Note: Add a dynamic tactic commander

Status: proposed

English | [中文](2026-09-02-maoq-dynamic-tactic-commander.zh.md)

## Problem

MAOQ has deterministic strategic-state features, a fixed-tactic research lab, a smaller eligibility registry, and a DSH council that can synthesize a free-form tactic string. These parts do not share one tactic identity owner, and no durable record conditions tactic performance on the market state that was knowable at the decision cutoff. Aggregate multi-year tactic results therefore measure isolated weapons but not whether the commander selected the appropriate weapon.

## Proposal

Introduce a P3.5 dynamic tactic commander assembled from ordinary focused packages rather than a fork of the agent loop. One unified catalog will own versioned tactic identity, promotion status, context requirements, execution constraints, invalidation, and risk limits. The research lab, eligibility evaluator, conditional scorecard, deterministic router, commander schema, stock ranker, and audit output will consume this catalog.

The first coverage target will contain ten active tactic families plus `defensive_no_trade`. The router will read only matured, cutoff-correct outcomes and produce a deterministic top-three slate with component scores, uncertainty, rejection reasons, risk ceilings, and a cash floor. The DSH commander may choose at most one primary and one secondary tactic from that slate. Host validation will reject unknown, ineligible, stale, over-budget, or promotion-inconsistent choices before an independent reviewer can approve or veto the result.

The first learning mechanism will be delayed context-conditioned score updates rather than reinforcement learning. A tactic result will update its scorecard only after its declared holding window closes. Changes to tactic rules, context buckets, score transforms, weights, decay, or risk budgets will create new versioned trial identities.

## Alternatives considered

**Let the model choose any tactic from prose.** This preserves flexibility but permits unregistered strategies, hides effective trial count, and cannot reproduce why a tactic was available at one cutoff.

**Choose the recent best full-period tactic.** This ignores state dependence, promotes recency chasing, and cannot distinguish a durable context edge from one favorable regime.

**Implement reinforcement learning first.** Delayed rewards, sparse regime samples, changing market structure, and model non-determinism make attribution and leakage control inadequate for the first selector. A bounded scorecard and router establish auditable evidence before a more adaptive learner is considered.

**Build many tactics before the router.** More overlapping variants increase selection bias and leave the same missing decision contract. The proposal adds only enough distinct families to cover major opportunity sources, then measures dynamic selection before expanding further.

## Acceptance criteria

- One versioned catalog supplies every tactic ID and constraint consumed by research, eligibility, routing, commander synthesis, stock ranking, and audit output.
- The commander schema accepts catalog tactic IDs only, keeps research and paper scope distinct, and cannot override host eligibility or the final risk veto.
- A replay reconstructs each slate from cutoff-correct strategic facts, matured outcomes, scorecard identity, router version, and source hashes without future data.
- Evaluation compares fixed tactics, equal allocation, deterministic routing, DSH-assisted routing, and the final risk-vetoed result net of switching and execution costs.
- Standard daily decisions use bounded scorecard reads and the smallest sufficient council rather than scanning full history or invoking every specialist.
- The next promotion period is frozen before router weights, prompts, and model routes are evaluated against it.

## Risks

Condition buckets can fragment the sample and make uncertainty dominate active choices. Fixed score weights can encode a weak prior, while frequent tactic switching can consume the apparent edge. A model may add persuasive interpretation without measurable selection value. The design therefore keeps `defensive_no_trade` available, reports uncertainty and switching cost, compares deterministic and model-assisted selectors separately, and requires a new sealed holdout before paper promotion.
