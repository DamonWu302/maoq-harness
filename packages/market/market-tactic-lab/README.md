---
description: "Point-in-time daily research features and one shared realistic A-share paper-execution policy for MAOQ P3."
kind: "package-library"
---

# @deepseek-ai/dsh-market-tactic-lab

English | [中文](README.zh.md)

## Summary

`dsh-market-tactic-lab` supplies the common measurement and execution foundation for MAOQ tactic research. It content-addresses bounded pairs of adjusted feature sessions and raw execution sessions, computes daily research features, and replays close-authored orders only at the next market session's open under explicit A-share trading rules and costs.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Pass ordered or unordered immutable daily sessions to `computeDailyHistoryFeatures()`. The newest session defines the decision date; missing stock sessions make affected windows `null` instead of skipping the gap. Sector-relative returns require the stock to remain in the same point-in-time sector throughout the complete window.

```text
const features = computeDailyHistoryFeatures(snapshots)
```

For a multi-year full-universe replay, push each ascending session once through `DailyHistoryFeatureStream`. It preserves the batch feature semantics while retaining only each symbol's bounded 252-session window, rather than rescanning the full lookback for every decision date.

History providers implement `TacticLabHistoryAdapter` and stream bounded `TacticLabHistoryChunk` values. `buildTacticLabHistoryChunk()` validates one-to-one date pairing, sorts source versions, records the inclusive range, and freezes a SHA-256 content address so evaluators can cite exact inputs without holding a multi-year universe in memory.

Pass a separate raw, unadjusted execution sequence with exact daily up/down limits and close-authored orders to `simulateNextOpenExecution()`. The default policy starts with paper cash and conservative explicit costs. An order fills once on the next market session or records one stable rejection reason.

```text
const result = simulateNextOpenExecution(snapshots, orders)
```

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Snapshot stock prices are already adjusted by their acquisition adapter, so research uses them directly and never applies the adjustment factor twice. Volume and amount remain raw. Feature windows follow market sessions, require complete symbol observations, cite immutable inputs, and never read an ambient clock. Multi-session sector returns compound each session's relative sector level instead of treating those daily levels as a continuous index. The incremental engine produces the same feature record as the batch engine for each cutoff and bounds retained observations per symbol.

Execution uses raw unadjusted prices. Orders authored after session `t` can first fill at session `t+1`; a missing or suspended bar never advances to a later favorable session. Buys at an opening limit-up and sells at an opening limit-down are rejected. Slippage is applied against the open and clipped to the observed daily range. Positions retain acquisition dates, sell checks enforce T+1, and final equity marks remaining shares to the latest observed raw close.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Market tactic lab subsystem](../../../docs/subsystems/market-tactic-lab.md) — feature and execution semantics.
- [P3 tactic research](../../../docs/maoq-p3-tactic-research.md) — candidate evidence and promotion protocol.
- [Market snapshot](../market-snapshot/README.md) — immutable daily input.
- [Market tactic eligibility](../market-tactic-eligibility/README.md) — context and promotion gates before stock ranking.

-----

<a id="model-experience"></a>
## Model Experience

None, as this host-side library adds no model-visible context or tools.

#### KV Cache effect

None. A later consumer owns any selected feature or result rendered to a model.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No runtime history consumer yet** — `dsh-market-snapshot-mysql` supplies the read-only production adapter, but the evaluator and model-facing research tool do not mount it yet.
- **One next-open order style** — intraday stops, auctions, queue priority, and volume participation need separate versioned execution policies.
- **No portfolio optimizer** — the replay enforces cash and positions but does not choose weights, tactics, or orders.
- **No performance statistics** — walk-forward folds, Sharpe, deflated Sharpe, PBO, drawdown, and capacity reports belong to the next evaluation layer.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

All tactics must share this execution policy during comparison. A tactic-specific fill shortcut is an evaluation change and requires a new engine version, not a local backtest option.

</details>
