# Market Tactic Lab Subsystem

English | [中文](market-tactic-lab.zh.md)

The market tactic lab subsystem supplies the point-in-time measurements and one shared paper-execution truth needed to compare P3 tactics. It sits after immutable daily acquisition and before walk-forward performance evaluation. The implementation lives in [`@deepseek-ai/dsh-market-tactic-lab`](../../packages/market/market-tactic-lab/README.md).

## Daily-history features

`computeDailyHistoryFeatures()` sorts immutable daily inputs, rejects duplicate trading dates or invalid content hashes, and computes features only at the newest supplied cutoff. Snapshot stock prices are already adjusted and are used as-is; volume and amount remain raw. Complete session windows produce 1-, 5-, 20-, and 60-session adjusted returns, 20- and 252-session distance from adjusted highs, turnover and amount means, limit-up counts and streaks, and 5- and 20-session sector-relative returns. Sector returns compound daily relative levels rather than dividing them as though they were a continuous index.

A missing symbol session makes every affected window unavailable instead of silently shortening the lookback. Sector-relative returns require one unchanged point-in-time sector across the window. The record stores all input snapshot hashes and exact stock evidence references; it reads no process clock.

## Next-open execution

`simulateNextOpenExecution()` receives a separate raw, unadjusted sequence with exact daily up/down limits and interprets every `signalDate` as a decision made after that session closes. It attempts one fill at the next market session's raw open and never carries an unfilled order to a later favorable date. Orders use board lots and explicit starting cash. Suspended, delisting, missing-bar, opening-limit-up buy, and opening-limit-down sell cases reject with stable reason codes.

The fill price applies side-aware slippage and remains inside the observed daily range. Commission and transfer fees apply on both sides; stamp duty applies on sells. Position lots preserve acquisition dates, sellable quantity enforces T+1, and remaining positions are marked to the latest observed raw close.

## Research boundary

The package neither generates tactic signals nor reports Sharpe. This separation forces regime-signed trend, openable emotion-leader, and industry-relative repair research to share identical feature and execution semantics. A later MySQL history adapter will freeze the production daily tables into lightweight sessions, and the evaluator will own walk-forward folds, realistic capacity, multiple-testing controls, and promotion artifacts.
