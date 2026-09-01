# Agent Note: MAOQ deterministic tactic eligibility

Status: implemented

English | [中文](2026-09-01-maoq-tactic-eligibility.zh.md)

## Problem

P2 can identify a market regime, emotion cycle, and sector battlefield, but those facts do not authorize a trading tactic. If an LLM can infer tactics directly from prose, an untested idea, unavailable input, or attractive backtest headline can silently become actionable before stock ranking.

## Decision

`@deepseek-ai/dsh-market-tactic-eligibility` owns a versioned, immutable registry and a pure fail-closed evaluator between P2 and P4. Every definition states promotion status, evidence grade, history and holding requirements, position ceiling, entry, exit, invalidation, and execution requirements.

Context fit and promotion are separate fields. Matching P2 facts can make a `research` tactic `research_only`, but cannot place it in `eligibleTacticIds`. Missing market, emotion, or sector evidence makes every active tactic ineligible. `defensive_no_trade` is the only initially eligible definition and always remains a zero-position fallback.

The first active research definitions are regime-signed breakout/pullback, openable emotion leader, and industry-relative exhaustion repair. Their public evidence and promotion thresholds are recorded in `docs/maoq-p3-tactic-research.md`; citation strength does not substitute for MAOQ's own point-in-time A-share evaluation.

The daily data pipeline updates at 19:00 `Asia/Shanghai`, while automatic MAOQ maintenance first checks at 19:15 and waits for a usable immutable same-day hash. The eligibility library consumes frozen P2 facts only and reads no ambient clock.

## Alternatives considered

- Let the commander select any named tactic and rely on independent risk review. This detects some bad outputs after model reasoning but does not create a replay-stable pre-ranking gate.
- Mark the three initial candidates eligible from published Sharpe figures. The cited studies use different markets, portfolio constructions, data frequencies, and execution assumptions.
- Encode one favored breakout or limit-up strategy directly in stock ranking. This would collapse regime recognition, tactic eligibility, and stock selection into one untestable path.

## Consequences

- P3 context matching is deterministic, deeply frozen, evidence-referenced, and replayable.
- Active tactics stay unavailable for simulated positions until explicit source-controlled promotion.
- P4 must add daily-history stock features and a shared execution simulator before it can produce candidate lists.
- Promotion changes require a new reviewed policy and evaluation artifact, not a prompt edit.

## Verification

Unit tests cover matching research contexts, reversal-only contexts, unavailable P2 inputs, the defense fallback, immutable definitions, and the prohibition on treating a sealed one-price limit as a fill.
