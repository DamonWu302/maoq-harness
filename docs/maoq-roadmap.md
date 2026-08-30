# MAOQ Development Roadmap

English | [中文](maoq-roadmap.zh.md)

## Purpose

This document turns the MAOQ direction into an executable sequence. The outcome is not a chatbot that discusses stocks, but a research and paper-trading agent that can identify the principal contradiction, select the least-resistance battlefield, choose tactics for the current market state, rank stocks, state invalidation conditions, and accept an independent risk veto.

The immediate next step is **M0: prove one real commander decision end to end**. Market-data breadth and tactical breadth come only after the runtime path is observable and reliable.

## Current baseline

- The `maoq` profile carries the commander persona and a bounded `maoq_decide` council.
- The commander can switch between the local Codex login and existing external API-key providers, with an exact model selection for new tasks.
- The commander dynamically selects no more than four specialists from market regime, emotion cycle, policy and macro, sector battlefield, tactic selection, and stock research.
- Fresh specialist, synthesis, and risk-review agents produce structured output; the independent reviewer has final veto power.
- Council token usage is reported per call and aggregated without invented estimates.
- The system remains research and paper-trading only; it has no live-order authority.

## Product principles

1. **Victory is the objective, evidence is the constraint.** Optimize for risk-adjusted, repeatable outcomes rather than persuasive narratives.
2. **Seek truth from facts.** Every conclusion names its evidence cutoff, counter-evidence, confidence, and invalidation conditions.
3. **The principal contradiction comes before the stock.** Market state and sector battlefield determine which tactics and candidates are eligible.
4. **Use a tactical pool, not one permanent setup.** Trend continuation, emotion leadership, oversold reversal, platform pullback, event-driven opportunity, and defense are conditional tools.
5. **Concentrate only after reconnaissance.** The system narrows from the whole market to regimes, sectors, tactics, and stocks; it does not begin from a favorite ticker.
6. **Risk veto is independent.** Risk constraints are not softened because a thesis is attractive.
7. **No look-ahead.** Data, sector membership, news, and policy evidence must all be reproducible as of the decision cutoff.

## Milestones

| Milestone | Goal | Main deliverable | Exit criterion |
|---|---|---|---|
| M0 — Runtime proof | Prove the current commander stack with real model calls | Reproducible commander smoke scenario and usage report | Both model sources can create a new task; Codex can call tools; council output, veto, and token usage are visible |
| M1 — Market snapshot | Freeze one immutable daily market input | Versioned daily-bar, sector, and evidence snapshot schema | The same cutoff always rebuilds the same snapshot; no future data enters |
| M2 — Strategic state | Identify the market's principal contradiction and least-resistance direction | Market-regime, emotion-cycle, and sector-battlefield engines | Each daily snapshot produces a state, supporting evidence, counter-evidence, and transition conditions |
| M3 — Tactical pool | Match tactics to the current state | Gated tactic registry with entry, exit, and invalidation rules | Ineligible tactics are deterministically excluded before stock ranking |
| M4 — Stock battlefield | Return actionable short- and medium-horizon candidates | Scenario-aware candidate generation, ranking, and explanation | Every candidate traces to sector, tactic, evidence, risk, and invalidation; walk-forward evaluation is reproducible |
| M5 — Operating loop | Run the process consistently without live execution | Scheduled research, paper portfolio, review, and drift report | Daily runs are idempotent, auditable, and fail closed on stale or incomplete data |

## M0 — Immediate sprint: real runtime proof

### Work items

1. Add a profile-level smoke harness that starts `maoq` from the delivered CLI rather than a hand-built test context.
2. Exercise the **Local Codex login** commander with a small tool call, then confirm the assistant continues after the tool result.
3. Exercise one configured **External API** commander without changing or deleting its credential flow.
4. Run `maoq_decide` with two selected specialists, one synthesis agent, and one independent risk reviewer.
5. Record commander and council token usage by provider, model, role, and unavailable-usage count.
6. Add failure scenarios for missing Codex login, invalid model, provider timeout, malformed structured output, and risk veto.
7. Add one browser check confirming that Codex configuration suppresses API-key onboarding after both startup and refresh.
8. Publish a short operator runbook covering launch, model switching, diagnostics, and recovery.

### Acceptance criteria

- `pnpm dsh --profile maoq` starts without requesting an API key when the Codex-login route is configured.
- A newly created task uses the provider and model saved on the Models page; an existing task does not switch mid-session.
- The commander performs at least one real tool call and consumes its result before answering.
- The council starts only the requested specialists and always runs fresh synthesis and risk-review agents.
- A risk veto cannot be rendered as approval.
- Provider-reported token usage is visible; absent usage is marked unavailable instead of estimated.
- Logs and user-visible diagnostics never contain access tokens, refresh tokens, or API keys.

## M1 — Immutable daily market snapshot

### Data boundary

- **Stock daily bars:** adjusted OHLCV, turnover, trading status, limit-up/limit-down state, listing age, and data-quality flags.
- **Sector daily data:** point-in-time membership, sector index bars, breadth, limit-up count, advancing ratio, leadership, and internal dispersion.
- **Market-wide state:** major indexes, total turnover, advance/decline distribution, limit-up ladder, failed breakouts, and loss-effect measures.
- **Policy and news evidence:** source URL, publisher, publication time, retrieval time, event time, affected sectors, confidence, and explicit cutoff eligibility.
- **Snapshot identity:** trading date, cutoff time, calendar version, adjustment version, sector taxonomy version, source versions, and content hash.

### Acceptance criteria

- Building the same date and cutoff twice produces the same content hash.
- Suspended, newly listed, delisted, and limit-constrained stocks have explicit semantics.
- Historical sector membership is point-in-time correct.
- News published or retrieved after the cutoff cannot enter the snapshot.
- Missing or conflicting critical fields fail the decision run rather than silently defaulting.

## M2 — Strategic state engine

The strategic layer produces three connected but independently testable outputs:

1. **Market regime:** risk-on trend, rotation, high-volatility divergence, risk-off contraction, or repair.
2. **Emotion cycle:** ignition, acceleration, climax, divergence, retreat, or repair, supported by ladder height, promotion rate, failed breakouts, loss effect, and breadth.
3. **Sector battlefield:** sector strength, persistence, capacity, catalyst support, internal breadth, leader quality, crowding, and resistance.

The engine must separate observation from interpretation. Deterministic features are computed first; model analysis explains the principal contradiction, counter-evidence, and possible transitions without rewriting those features.

## M3 — Tactical pool

| Tactic family | Eligible environment | Primary evidence | Typical invalidation |
|---|---|---|---|
| Trend continuation and breakout | Expanding trend with sector confirmation | Relative strength, volume structure, breadth, and persistence | Breakout failure or sector breadth collapse |
| Emotion leader and limit-up ladder | Ignition or acceleration with positive promotion economics | Ladder structure, promotion rate, sealed orders, follower response | Core leader breaks, loss effect spreads, or promotion rate collapses |
| Oversold reversal | Panic or retreat followed by measurable repair | Selling exhaustion, divergence, reclaim, and breadth repair | New low with renewed volume or repair breadth failure |
| Platform pullback and secondary advance | Mainline sector remains intact after controlled consolidation | Support retention, shrinking supply, renewed leadership | Platform breakdown or sector leadership change |
| Policy or event driven | New evidence changes expected payoff for a sector | Source quality, novelty, transmission path, capacity, and price confirmation | Catalyst disproved, absorbed, or unsupported by price and breadth |
| Defensive and no-trade | Risk-off, low edge, stale evidence, or excessive crowding | Drawdown risk, liquidity, dispersion, and uncertainty | Clear regime repair with improving expected payoff |

Every tactic is a module with eligibility gates, candidate features, entry conditions, exit conditions, invalidation, position ceiling, and evaluation protocol. The LLM may select among eligible tactics; it may not bypass a failed deterministic gate.

## M4 — Stock selection and evaluation

Candidate selection proceeds in this order:

```text
daily snapshot
  -> market regime and emotion cycle
  -> sector battlefield ranking
  -> eligible tactical modules
  -> tactic-specific candidate generation
  -> liquidity and tradability filters
  -> independent risk veto
  -> short-horizon and medium-horizon lists
```

The output keeps short-line and medium-line decisions separate. A short-line candidate emphasizes emotion position, leadership, liquidity, next-session execution risk, and rapid invalidation. A medium-line candidate emphasizes sector persistence, trend quality, pullback structure, catalyst durability, and a wider holding horizon. The system does not force both lists to be populated.

Evaluation uses walk-forward splits, point-in-time membership, transaction costs, limit constraints, suspension handling, and delisting outcomes. Report hit rate, payoff ratio, expectancy, maximum drawdown, turnover, capacity, regime-conditioned performance, and the contribution of vetoed trades. No single backtest score is sufficient for promotion.

## M5 — Daily operating loop

1. Build and validate the immutable snapshot after the configured cutoff.
2. Run deterministic state and sector features.
3. Let the commander choose the smallest sufficient specialist council.
4. Produce strategic state, eligible tactics, candidates, and invalidation conditions.
5. Apply independent deterministic and model risk reviews.
6. Update a paper portfolio only; never place a live order.
7. After the outcome window closes, attribute decisions to data, regime, sector, tactic, selection, execution assumptions, and veto.
8. Monitor feature drift, tactic decay, model changes, token cost, and unavailable evidence.

## Architecture boundaries

- LLMs interpret evidence, compare contradictions, select eligible modules, and explain decisions.
- Deterministic services own cutoffs, feature computation, tactic gates, portfolio arithmetic, risk ceilings, and backtest accounting.
- Web search supplies policy and news evidence with provenance; it never overwrites market data or bypasses the cutoff.
- Market-data adapters are replaceable. Snapshot and decision contracts do not depend on one vendor's field names.
- Live brokerage integration remains out of scope until the research and paper loop has stable evidence of value and a separate authorization design.

## Promotion gates

A milestone advances only when its artifact is reproducible, its failures are explicit, and its tests cover the highest-risk boundary. A tactic advances from research to the paper pool only when it survives walk-forward evaluation across multiple regimes and remains viable after costs and execution constraints. A model or prompt change advances only when replay and live canary scenarios show no regression in structure, veto behavior, or evidence discipline.

## Recommended next action

Start M0 with one delivered-profile smoke scenario: launch `maoq`, select `openai-codex/gpt-5.6-sol`, ask the commander to inspect a small local fixture and call `maoq_decide` with `market_regime` and `sector_battlefield`, force the risk reviewer to veto one unsafe paper trade, and persist the complete output plus token-usage facts. Do not begin market-data ingestion until this scenario is repeatable.
