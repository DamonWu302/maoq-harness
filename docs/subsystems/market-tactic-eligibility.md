# Market Tactic Eligibility Subsystem

English | [中文](market-tactic-eligibility.zh.md)

The market tactic eligibility subsystem is the deterministic boundary between P2 strategic state and P4 stock ranking. It identifies which tactic contexts fit current evidence while separately enforcing whether each tactic has earned promotion. The implementation lives in [`@deepseek-ai/dsh-market-tactic-eligibility`](../../packages/market/market-tactic-eligibility/README.md).

## Registry contract

Every `TacticDefinition` has a stable tactic ID, family, promotion status, evidence grade, history requirement, maximum holding period, maximum paper position, entry and exit policies, invalidation policy, and execution requirements. The initial active candidates are regime-signed breakout/pullback, openable emotion leader, and industry-relative exhaustion repair. All three begin in `research`; defensive no-trade begins in `eligible`.

Promotion and context fit are independent. `research` plus matching context becomes `research_only`; `paper` becomes `watch_only`; only an `eligible` definition with passing gates can enter `eligibleTacticIds`. Model analysis cannot modify either field.

## Deterministic gates

`evaluateTacticEligibility()` consumes one `StrategicFeatureRecord`. Active tactics first require ready market-regime, emotion-cycle, and sector-battlefield components. Each family then applies allowlisted strategic labels plus a positive top-sector gate. Passing results expose at most three positively scored sector IDs; failures carry stable reason codes and exact P2 evidence references.

If any required component is unavailable, every active tactic fails closed. `defensive_no_trade` remains eligible with zero position and no-order execution requirements. This ensures that incomplete evidence cannot disappear merely because model prose is confident.

## Data clock

The upstream daily bars update automatically at 19:00 `Asia/Shanghai`. The automatic MAOQ runtime first checks at 19:15 and retries a cheap immutable-identity lookup during the revision window. Strategic agents start only after a usable same-day snapshot hash appears. Eligibility evaluation receives that frozen record and never reads the ambient clock, so replay stays deterministic.

## Promotion boundary

The registry does not implement the backtest or promote tactics automatically. Promotion requires point-in-time walk-forward evidence, realistic A-share T+1 and price-limit execution, explicit costs and capacity, multiple-testing controls, and predeclared risk bounds. The complete policy and research sources are recorded in [MAOQ P3 tactic research](../maoq-p3-tactic-research.md).
