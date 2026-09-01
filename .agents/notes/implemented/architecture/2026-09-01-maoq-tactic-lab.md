# Agent Note: MAOQ shared tactic research truth

Status: implemented

English | [中文](2026-09-01-maoq-tactic-lab.zh.md)

## Problem

Published tactic returns are not comparable when each implementation chooses its own adjusted prices, missing-session behavior, sector history, fill timing, price-limit assumptions, or costs. Full MAOQ market snapshots are appropriate for current decisions but materializing news and strategic evidence for more than one thousand historical sessions is unnecessary for daily backtests.

## Decision

`@deepseek-ai/dsh-market-tactic-lab` owns two pure, versioned research contracts. `computeDailyHistoryFeatures()` derives adjusted returns, high proximity, sector-relative returns, turnover, amount, and limit-up structure from point-in-time daily sessions. Missing symbol sessions fail affected windows closed, and sector-relative measurements require stable point-in-time membership across the complete window.

`simulateNextOpenExecution()` receives a separate unadjusted sequence with exact up/down limits, treats every signal date as an after-close decision, and attempts one fill at the next market session's raw open. It applies explicit board lots, cash, acquisition-date lots, T+1 sellability, suspension and delisting rejection, opening price-limit rejection, side-aware slippage, commission, sell stamp duty, transfer fees, and final raw-close marks. An unfilled order never carries forward to a later favorable session.

Current daily decisions continue to use full immutable market snapshots, whose stock prices are already adjusted. Historical research reads the existing production tables through `LongShortStockTacticHistoryAdapter`. It streams content-addressed bounded chunks that pair an adjusted feature sequence with a raw execution sequence from the same daily, adjustment, limit, quality, and point-in-time sector facts. Required joins must preserve every selected daily-price row.

Multi-year evaluation feeds those chunks through `DailyHistoryFeatureStream`, which preserves batch feature semantics while retaining only each symbol's 252-session observation window. The production adapter obtains price facts and overlapping sector periods with separate bounded reads, then attaches the latest effective membership deterministically; this avoids a range-wide database window sort without changing point-in-time meaning.

Three fixed versioned research trials convert the shared features into deterministic ranked candidates only after their market and sector gates pass. `evaluateResearchTactic()` gives each trial declared position limits and holding periods, sizes from the signal-date raw close, executes through the same next-open policy, and reports daily equity, chronological folds, Sharpe, drawdown, turnover, fill rate, positive-fold ratio, and doubled-cost results. It always remains `research` while Deflated Sharpe, PBO, and market-regime profit concentration are absent.

## Alternatives considered

- Generate a complete market snapshot for every historical date. This preserves one shape but needlessly repeats policy, news, and strategic acquisition for execution-only tests.
- Let each tactic own its feature and fill code. This makes apparent Sharpe differences inseparable from favorable implementation assumptions.
- Use adjusted prices for fills. Adjusted history is correct for features but is not a price at which an A-share order could execute.
- Carry unfilled price-limit orders forward. This introduces hidden order persistence and selects later favorable fills without an explicit policy.

## Consequences

- All three initial tactic candidates can be compared on identical measurement and execution semantics.
- Apparent high Sharpe cannot bypass missing multiple-testing or regime-concentration evidence.
- Corporate actions do not create false feature returns, while fills and equity marks remain raw and executable.
- Daily-only research still cannot claim intraday stops, queue priority, or auction fills.
- Real Sharpe and promotion evidence remain incomplete until a runtime consumer mounts the history adapter and the walk-forward evaluator is implemented and run.

## Verification

Gold tests cover content-addressed chunk stability and corruption rejection, adjusted-feature/raw-execution separation, required-join row preservation, deterministic overlapping point-in-time sectors, batch/stream parity through 252 sessions, adjustment-factor continuity, missing sessions, sector changes, all three signal gate families, deterministic ranking, close-known sizing, fixed holding periods, chronological folds, doubled costs, promotion blockers, next-session timing, both-side costs, opening limit-up rejection, suspension, invalid lots, duplicate orders, cash, positions, and immutable results.
