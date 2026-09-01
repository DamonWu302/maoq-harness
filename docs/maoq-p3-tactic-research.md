# MAOQ P3 Tactic Research

English | [中文](maoq-p3-tactic-research.zh.md)

## Decision

P3 starts with three research candidates and one production-safe control:

1. `regime_signed_breakout_pullback` — sector-confirmed trend continuation entered on a controlled breakout or pullback, not raw price momentum;
2. `openable_emotion_leader` — next-session continuation of an A-share emotion leader only when the position is actually tradable;
3. `industry_relative_exhaustion_repair` — repair of an idiosyncratic selloff relative to sector peers, not a raw RSI oversold rule;
4. `defensive_no_trade` — the eligible control whenever evidence, state, execution, or evaluation quality is insufficient.

The first three begin with `research` promotion status. An LLM may explain them but cannot make them eligible. Only a versioned deterministic implementation that passes the evaluation protocol below may advance to paper eligibility.

## What the public evidence actually supports

| Candidate | Strongest useful public evidence | What it does not prove | MAOQ consequence |
|---|---|---|---|
| Regime-signed breakout/pullback | A 137-year, 67-market trend study reports positive average returns in every market and an average per-market gross Sharpe near 0.4; an A-share study finds conventional momentum depends strongly on whether the market state persists or changes. | Futures evidence does not prove an individual-stock A-share breakout rule, and gross Sharpe is not net A-share Sharpe. | Market regime and sector battlefield are hard gates. Prefer a first breakout or a pullback with nearby invalidation; reject a raw all-weather momentum rule. |
| Openable emotion leader | A 2011–2020 A-share study finds significant daily momentum is dominated by next-day abnormal returns after price-limit hits. A separate all-A-share high-frequency study finds next-day continuation more likely than reversal after a limit hit. | Neither result proves that a trader can buy a sealed limit-up, survive T+1, or obtain the reported portfolio return after realistic queueing and slippage. | Require an executable next-session price, board-specific limit rules, failed-board risk, and capacity. A sealed-board signal is observation, never a fill. |
| Industry-relative exhaustion repair | A 64-country 1990–2023 study reports China industry-adjusted reversal at 0.99% per month and annualized Sharpe 0.76 versus 0.31 for standard reversal. A China-specific study links short-term contrarian behavior to T+1 and finds it at daily, weekly, and monthly frequencies. | The headline strategy is long-short and does not prove the long-only daily repair entry MAOQ needs. | Remove the sector move first, demand selling exhaustion plus market/sector repair, and validate a long-only implementation under T+1. |

Primary sources:

- Hurst, Ooi, and Pedersen, [A Century of Evidence on Trend-Following Investing](https://www.aqr.com/-/media/AQR/Documents/Insights/Journal-Article/AQR-JPM-Fall-2017.pdf).
- Gao, Guo, and Xiong, [Signed momentum in the Chinese stock market](https://doi.org/10.1016/j.pacfin.2020.101433).
- Zhang and Zhang, [Price Limit Dominates Daily Momentum Effect in the Chinese Stock Market](https://xbbjb.cufe.edu.cn/EN/Y2025/V0/I1/59).
- Wan et al., [Statistical Properties and Pre-hit Dynamics of Price Limit Hits in the Chinese Stock Markets](https://arxiv.org/abs/1503.03548).
- Stosik and Zaremba, [Short-term reversal persists globally—If properly measured](https://doi.org/10.1016/j.econlet.2026.113113).
- Zhang and Zhu, [Only strong short-term contrarian effect exists in Chinese stock market: The role of the T+1 trading mechanism](https://doi.org/10.1016/j.iref.2024.103653).

## Why published high Sharpe numbers are not tactic proof

High public Sharpe numbers are useful as architecture benchmarks, not as permission to copy a tactic. A Journal of Financial Economics study over A-shares from 2000 to 2020 reports a tradable long-only monthly portfolio Sharpe of 1.70 after excluding price-limit buys, but it uses 94 characteristics and machine learning; the authors report momentum as a secondary input relative to liquidity and fundamentals. A separate listwise learning-to-rank paper reports out-of-sample Sharpe around 2 for a long-short portfolio, which is not broadly executable in A-shares. A 2023–2025 Sharpe-selection paper reports 1.71, but its short sample and 1.62 buy-and-hold Sharpe provide weak evidence of incremental edge.

MAOQ therefore records these numbers as comparison points only:

- [Machine learning in the Chinese stock market](https://doi.org/10.1016/j.jfineco.2021.08.017): tradable long-only Sharpe 1.70 over 103 monthly out-of-sample observations; not a single tactic.
- [Constructing long-short stock portfolio with a new listwise learn-to-rank algorithm](https://arxiv.org/abs/2104.12484): reported Sharpe about 2; long-short feasibility and model complexity prevent direct promotion.
- [Sharpe-Driven Stock Selection and Liquidity-Constrained Portfolio Optimization](https://arxiv.org/abs/2511.13251): reported Sharpe 1.71 over 2023–2025; insufficient independent history.

An extreme published statistic such as an overnight/intraday reversal Sharpe must also be rejected when it requires intraday data or same-day execution that the current daily-only, T+1 contract cannot reproduce.

## Deterministic tactic contracts

Every tactic record must contain:

- stable tactic and policy versions;
- `research`, `paper`, or `eligible` promotion status;
- required market regimes, emotion cycles, and sector conditions;
- deterministic eligibility gates and evidence references;
- candidate-feature requirements owned by P4, not inferred by an LLM;
- entry, exit, invalidation, maximum paper position, and maximum holding period;
- execution requirements including T+1, price-limit board, suspension, liquidity, and fill model;
- evaluation identity covering snapshot hashes, parameters, costs, and code version.

The LLM may select only among tactics whose deterministic result is `eligible`. `watch_only`, `research`, missing evidence, and failed execution gates cannot be promoted by narrative confidence.

## Daily data clock

The upstream daily bars update automatically at 19:00 `Asia/Shanghai`. MAOQ treats this as the start of availability, not proof that every table is complete: the automatic runtime makes its first immutable-snapshot check at 19:15, then retries only the cheap identity lookup every 15 minutes during the two-hour revision window. It starts strategic agents only when a usable same-day hash appears. P3 and later backtests may use that frozen close only for decisions and orders no earlier than the next executable session; they must never treat the 19:00 timer as a same-day fill.

## Initial candidate definitions

### Regime-signed breakout/pullback

- Strategic gate: `risk_on_trend` or supportive `rotation`; `repair` is watch-only until breadth confirms.
- Emotion gate: startup, acceleration, or repair; climax, divergence, and ebb prohibit chasing.
- Sector gate: positive persistence, breadth, capacity, and leader quality with bounded crowding and resistance.
- P4 stock shape: sector-relative strength, first platform departure or controlled pullback, manageable distance to protection, and sufficient amount.
- Invalidation: failed breakout, platform loss, sector breadth collapse, or market-state transition.

### Openable emotion leader

- Strategic gate: startup or acceleration with positive promotion economics; climax is observation only.
- Sector gate: the direction explains broad money behavior and has more than one responding constituent.
- P4 stock shape: core/front-row identity, board-height context, prior limit status, sufficient capacity, and a next-session executable price.
- Invalidation: leader break, failed-board/loss effect expansion, promotion collapse, or no executable fill.
- Explicit prohibition: a sealed one-price limit-up cannot be marked bought.

### Industry-relative exhaustion repair

- Strategic gate: repair, rotation, or late contraction with measurable breadth improvement; continuing contraction remains ineligible.
- Sector gate: sector structure is intact or repairing; a collapsing sector cannot supply the benchmark for a long repair.
- P4 stock shape: large negative residual versus sector peers, volume/turnover exhaustion, stabilization or reclaim, and no delisting/suspension constraint.
- Invalidation: new low on renewed volume, failed reclaim, or sector repair failure.

### Defensive no-trade

Eligible whenever another tactic lacks evidence, is not promoted, or fails any gate. It is a real output and the benchmark against which the incremental value of every active tactic is measured.

## Promotion protocol

A tactic cannot leave `research` unless all of the following are reproducible:

1. Point-in-time walk-forward tests with a sealed final holdout and no parameter selection on that holdout.
2. Long-only results under A-share T+1, board-specific price limits, suspensions, delisting outcomes, corporate actions, and point-in-time sector membership.
3. Open/close execution rules that never fill an untradeable limit price; commission, stamp duty, slippage, and capacity stress are explicit.
4. Net out-of-sample annualized Sharpe at least 1.0, positive expectancy under doubled costs, and a positive lower confidence bound or equivalent probabilistic Sharpe evidence.
5. Deflated Sharpe probability at least 95%, Probability of Backtest Overfitting below 20%, and every attempted parameter family counted as a research trial.
6. Positive net expectancy in at least 70% of walk-forward folds and no single market state contributing more than 50% of total profit.
7. Maximum drawdown, turnover, payoff ratio, fill failure, and capacity remain inside the tactic's predeclared bounds.

The multiple-testing controls follow Bailey et al., [The Probability of Backtest Overfitting](https://papers.ssrn.com/sol3/Papers.cfm?abstract_id=2326253). The thresholds are MAOQ promotion policy, not claims made by the cited papers.

## Implementation order

1. **Complete:** build the versioned tactic registry and fail-closed eligibility result type.
2. **Complete:** add gold fixtures proving each strategic gate and the `defensive_no_trade` fallback.
3. **Complete at the pure-contract layer:** add point-in-time daily-history features for adjusted returns, 52-week proximity, sector-relative returns, turnover, amount, and limit-up structure.
4. **Complete for next-open research:** implement one shared execution simulator with lot, cash, T+1, opening price-limit, suspension, commission, stamp-duty, transfer-fee, and slippage rules.
5. **Complete at the provider layer:** add a read-only MySQL history adapter that streams content-addressed paired feature/execution chunks without materializing full news/strategic snapshots for every historical date.
6. **Pure evaluator complete:** implement fixed versioned signals for all three candidates, declared portfolio construction, chronological folds, preliminary Sharpe/drawdown/turnover/fill evidence, and doubled-cost replay. Results remain `research` while DSR, PBO, regime concentration, and capacity are absent.
7. Mount the production history consumer and run the same evaluator against real history.
8. Promote only the candidates that pass; leave the others visible as rejected research evidence.
