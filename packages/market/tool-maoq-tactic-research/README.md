---
description: "Bounded MAOQ tools for discovering fixed research tactics and evaluating one tactic against quality-gated daily history."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-maoq-tactic-research

English | [中文](README.zh.md)

## Summary

`dsh-tool-maoq-tactic-research` lets the MAOQ commander discover fixed versioned tactics and run one deterministic historical trial at a time. Each trial streams quality-gated daily data, uses shared next-open A-share execution, reports chronological folds and doubled-cost results, and retains exact source hashes. Every result remains research evidence and cannot authorize live trading.

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

Mount the tool after `dsh-market-tactic-lab` and at least one registered `TacticLabHistoryAdapter`. The MAOQ profile permits the production MySQL history adapter, requires at least 3,000 stocks per session, reads 30 sessions per chunk, and limits one call to a five-year calendar range.

```yaml
- id: tool-maoq-tactic-research
  name: '@deepseek-ai/dsh-tool-maoq-tactic-research'
  config:
    allowedAdapters:
      - long-short-stock-history-mysql
    minimumStocks: 3000
    chunkSessions: 30
    maxRangeDays: 1827
    evaluationTimeoutMs: 900000
    recentSignalLimit: 10
```

| Field | Default | Meaning |
|---|---|---|
| `allowedAdapters` | `long-short-stock-history-mysql` | History sources the model may evaluate. |
| `minimumStocks` | `3000` | Required complete stock rows per accepted session. |
| `chunkSessions` | `30` | Maximum sessions streamed in each provider chunk. |
| `maxRangeDays` | `1827` | Maximum inclusive calendar span for one call. |
| `evaluationTimeoutMs` | `900000` | Foreground evaluation timeout. |
| `recentSignalLimit` | `10` | Latest non-empty signal dates returned in the compact report. |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-tool-maoq-tactic-research) is the exhaustive field reference.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`maoq_tactic_research_sources` lists registered history sources and all three fixed tactic versions without scanning the database. `maoq_tactic_backtest` accepts one allowed source, one fixed tactic id, and an inclusive date range. The tool enforces deployment-owned quality and range limits, streams the selected adapter once, and returns counts, performance statistics, folds, recent non-empty candidate signals, content hashes, and promotion blockers rather than the full equity curve or all market rows.

The model cannot lower the stock-count floor, enlarge chunks or date ranges, change portfolio construction, tune signal thresholds, or remove the doubled-cost replay. Cancellation stops before the next history chunk; a database query already in progress depends on its provider to return before the tool can observe cancellation.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Market tactic lab](../market-tactic-lab/README.md) — shared history, signal, execution, and evaluation semantics.
- [MySQL market adapter](../market-snapshot-mysql/README.md) — production quality-gated history provider.
- [P3 tactic research](../../../docs/maoq-p3-tactic-research.md) — evidence and promotion policy.

-----

<a id="model-experience"></a>
## Model Experience

### System prompt and tool schemas

#### What the model sees

The commander sees two generated [tool schemas](../../../docs/tool-catalog.md#deepseek-aidsh-tool-maoq-tactic-research) and the following stable workflow guidance.

##### MAOQ tactic research guidance

```markdown
Use maoq_tactic_research_sources before a historical evaluation when the source or tactic is unknown. Run maoq_tactic_backtest for one fixed tactic and the smallest sufficient date range; do not run all tactics by habit because each call scans quality-gated daily history. Treat every result as research evidence, preserve source hashes and promotion blockers, and never infer live-trading approval from Sharpe alone.
```

#### Token effect

One short stable guidance section and two bounded schemas add parent-prefix cost. A completed trial adds a compact JSON report; bounded chunk hashes preserve exact source evidence while only the execution-session count enters context. Stock rows, per-session hashes, and the complete equity curve stay outside the model result.

#### KV Cache effect

The prefix remains stable while tool visibility and deployment limits do not change. Trial reports are turn data and do not modify the fixed prompt prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Foreground evaluation** — long history scans are bounded and cancellable between chunks but are not durable background jobs.
- **One tactic per call** — comparing all tactics requires explicit sequential calls so the model cannot trigger three concurrent full-history scans accidentally.
- **Daily execution only** — the report cannot model intraday stops, auction queue priority, or volume participation.
- **Research status only** — Deflated Sharpe, PBO, regime-profit concentration, and capacity evidence remain mandatory outside this tool before promotion.
- **Compact model result** — full fills, rejections, signals, and equity points remain evaluator-owned in memory and are not persisted by this package.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Keep quality floors and portfolio construction in deployment or evaluator code. Do not expose model arguments that can weaken evidence quality or tune a trial after observing its result.

</details>
