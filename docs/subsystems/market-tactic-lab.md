# Market Tactic Lab Subsystem

English | [中文](market-tactic-lab.zh.md)

The market tactic lab subsystem supplies the point-in-time measurements and one shared paper-execution truth needed to compare P3 tactics. It sits after immutable daily acquisition and before walk-forward performance evaluation. The implementation lives in [`@deepseek-ai/dsh-market-tactic-lab`](../../packages/market/market-tactic-lab/README.md).

`TacticLabHistoryService` owns `ctx.marketTacticHistory`, an in-memory registry of exact history adapter names. Provider registrations dispose with their Cordis contributor. Research consumers can list, resolve, or stream one provider without depending on production database code.

## Historical chunks

`TacticLabHistoryAdapter.load()` streams caller-bounded, strictly ascending `TacticLabHistoryChunk` values for an inclusive date range. Each chunk contains one adjusted feature session and one raw execution session for every date. Construction rejects empty input, mismatched dates, nonascending sessions, and invalid session hashes; it sorts source versions and hashes the canonical chunk body. Persisted chunks can therefore be verified and cited without loading the complete research period.

The production implementation in [`@deepseek-ai/dsh-market-snapshot-mysql`](../../packages/market/market-snapshot-mysql/README.md) selects only quality-approved dates. Required adjustment, turnover, and price-limit joins must preserve the daily-price row count. It applies HFQ only to feature prices, retains raw executable prices and exact limits separately, and fetches overlapping SW L1 membership periods separately so it can choose the latest membership effective on each trading date without a range-wide SQL window sort.

## Daily-history features

`computeDailyHistoryFeatures()` sorts immutable daily inputs, rejects duplicate trading dates or invalid content hashes, and computes features only at the newest supplied cutoff. Snapshot stock prices are already adjusted and are used as-is; volume and amount remain raw. Complete session windows produce 1-, 5-, 20-, and 60-session adjusted returns, 20- and 252-session distance from adjusted highs, turnover and amount means, limit-up counts and streaks, and 5- and 20-session sector-relative returns. Sector returns compound daily relative levels rather than dividing them as though they were a continuous index.

A missing symbol session makes every affected window unavailable instead of silently shortening the lookback. Sector-relative returns require one unchanged point-in-time sector across the window. The record stores all input snapshot hashes and exact stock evidence references; it reads no process clock.

`DailyHistoryFeatureStream` consumes each strictly ascending session once for a multi-year replay. It retains at most 252 observations per symbol and emits the same feature semantics as the batch function at every cutoff, preventing repeated full-window scans from dominating strategy evaluation.

## Next-open execution

`simulateNextOpenExecution()` receives a separate raw, unadjusted sequence with exact daily up/down limits and interprets every `signalDate` as a decision made after that session closes. It attempts one fill at the next market session's raw open and never carries an unfilled order to a later favorable date. Orders use board lots and explicit starting cash. Suspended, delisting, missing-bar, opening-limit-up buy, and opening-limit-down sell cases reject with stable reason codes.

The fill price applies side-aware slippage and remains inside the observed daily range. Commission and transfer fees apply on both sides; stamp duty applies on sells. Position lots preserve acquisition dates, sellable quantity enforces T+1, and remaining positions are marked to the latest observed raw close.

## Versioned signals and evaluation

`generateResearchTacticSignal()` implements the first fixed trials for the three P3 candidates. Regime-signed breakout/pullback requires positive 20-session market breadth and ranks liquid near-high stocks with positive sector-relative continuation. Executable emotion leadership requires a bounded market-wide limit-up ratio and ranks liquid one-to-four-board leaders; the execution engine still rejects an opening limit-up. Industry-relative repair requires improving daily breadth without a broad 20-session uptrend, positive sector breadth, an idiosyncratic negative sector residual, exhausted turnover, and a positive reversal day.

`evaluateResearchTactic()` converts ranked signals into a declared maximum number of positions using only the signal-date raw close, fixed holding periods, and the shared next-open engine. It records a daily marked equity curve, chronological folds, net and annualized return, Sharpe, maximum drawdown, turnover, fill rate, positive-fold ratio, and a complete replay with doubled trading costs. These are research measurements: the result remains `research` and names missing Deflated Sharpe, PBO, and market-regime concentration evidence as blockers.

## Model-facing research consumer

[`@deepseek-ai/dsh-tool-maoq-tactic-research`](../../packages/market/tool-maoq-tactic-research/README.md) lists the registered providers and three fixed tactic versions without scanning history. One `maoq_tactic_backtest` call evaluates exactly one tactic over one bounded date range. Deployment configuration owns the source allowlist, stock-count floor, chunk size, maximum calendar span, timeout, and compact recent-signal limit; the model cannot weaken those values.

The report contains source hashes, fixed trial identity, execution counts, base and doubled-cost metrics, chronological folds, recent non-empty candidates, and every promotion blocker. It omits full market rows and the full equity curve from model context.

## Research boundary

The subsystem generates versioned deterministic research signals and comparable preliminary Sharpe evidence. It does not claim promotion, tune parameters, or select tactics. The runtime consumer connects the production adapter to the evaluator, while the remaining evaluation layer owns realistic capacity, Deflated Sharpe, PBO, regime-profit concentration, and final promotion artifacts.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxmarkettactichistory--tacticlabhistoryservice"></a>

### `ctx.marketTacticHistory` — `TacticLabHistoryService`

Registry boundary between production history providers and research consumers.

```ts cordis-catalog
/**
 * Register one history provider until its contributor is disposed.
 * @param adapter - Provider with a unique lowercase-hyphenated name.
 * @returns Disposer for this exact registration.
 */
register(adapter: TacticLabHistoryAdapter): () => void

/**
 * List exact registered source names in deterministic order.
 * @returns Sorted provider names.
 */
listAdapters(): readonly string[]

/**
 * Stream verified provider-neutral history from one exact registered source.
 * @param adapterName - Exact registered provider name.
 * @param request - Inclusive date range and bounded chunk/quality requirements.
 * @returns Provider-owned asynchronous chunk stream.
 */
load(adapterName: string, request: TacticLabHistoryRequest): AsyncIterable<TacticLabHistoryChunk>

/**
 * Resolve one exact provider for a host-side evaluator.
 * @param adapterName - Exact registered provider name.
 * @returns Registered immutable-history adapter.
 */
getAdapter(adapterName: string): TacticLabHistoryAdapter
```

Source: [`packages/market/market-tactic-lab/src/service.ts`](../../packages/market/market-tactic-lab/src/service.ts)
<!-- END GENERATED cordis-surface -->
