# Market Tactic Routing Subsystem

English | [中文](market-tactic-routing.zh.md)

The market tactic routing subsystem turns completed, cutoff-correct tactic observations into immutable conditional aggregates and a deterministic top-three slate. It sits after [tactic eligibility](market-tactic-eligibility.md) and before model-assisted synthesis. The implementation lives in [`@deepseek-ai/dsh-market-tactic-routing`](../../packages/market/market-tactic-routing/README.md).

## Outcome visibility

A matured outcome records the active catalog tactic and version, original decision date, maturity date, first availability timestamp, original bounded context, net and doubled-cost return, drawdown, fill rate, and exact source hashes. `availableAt` is the visibility boundary: a scorecard generation accepts only outcomes in the interval after its previous cutoff and at or before its new cutoff. The original strategic record derives the context, so a realized result cannot be relabeled with a later market state.

## Conditional aggregate

The context key contains the versioned market regime, emotion cycle, top-sector structure, volatility proxy, crowding band, and execution-quality band. Each tactic-version and exact-context cell keeps sufficient statistics for sample count, expectation and variance, wins and payoff, maximum drawdown, fill rate, doubled-cost expectation, recent exponential effectiveness, and the latest available outcome. A generation contains only these bounded cells, its previous generation identity, and the newly applied outcome identities.

`TacticRoutingStore` persists outcomes in UTC availability-day partitions and scorecards by content identity. Incremental catch-up enumerates only calendar partitions between two explicit cutoffs and fails when the caller's maximum span is exceeded. The daily router consumes one exact scorecard identity and never scans outcome files or market bars.

## Deterministic route

The v1 router first applies P0 eligibility and exact catalog-version checks. An active tactic then needs at least eight matured exact-context samples, a positive 95% expectation lower bound, positive doubled-cost expectation, at least 50% fill rate, and a positive score. The fixed score preserves each positive and negative component separately. A change to thresholds, bands, decay, or weights requires a new router or context version.

Qualified tactics compete with `defensive_no_trade` in stable score and tactic-ID order. The slate contains at most three entries, while the defensive candidate remains separately addressable even when it falls below three positive active scores. Research and paper promotion remain explicit: research candidates have a zero paper-position ceiling. The record preserves current snapshot, eligibility engine, scorecard, router, context, score components, evidence references, rejected tactics, risk ceilings, and cash floor as replay identities.

## Failure semantics

The subsystem rejects future-visible outcomes, catalog-version drift, duplicate outcomes in one update, non-advancing cutoffs, scorecards newer than the strategic cutoff, eligibility from another snapshot, unavailable strategic components, and missing defense. Missing or weak conditional evidence is not an exception: the active tactic receives explicit rejection reasons and defense wins.
