---
description: "Deterministic MAOQ P3 tactic definitions, promotion status, and fail-closed strategic eligibility gates."
kind: "package-library"
---

# @deepseek-ai/dsh-market-tactic-eligibility

English | [中文](README.zh.md)

## Summary

`dsh-market-tactic-eligibility` owns the shared tactic catalog and converts one replay-stable P2 strategic feature record into a versioned P3 tactic-eligibility record. The host owns every tactic identity, version, promotion status, gate, and execution requirement. Research candidates can fit the current context without becoming eligible; `defensive_no_trade` remains the only production-safe fallback until an active tactic passes the declared evaluation protocol.

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

Call `evaluateTacticEligibility(features)` after `dsh-market-strategic-state` has produced a complete deterministic feature record and before any P4 stock ranking. The function returns deeply frozen gate results, eligible sector IDs, stable reason codes, research candidates, and the exact set of eligible tactics.

```text
const eligibility = evaluateTacticEligibility(features)
```

The catalog contains ten active research tactics: regime-signed breakout/pullback, platform consolidation and second advance, AH52 resistance path, openable emotion leader, first-divergence core repair, first-limit delayed price discovery, industry-relative exhaustion repair, correlation-cluster sector rotation, sector-residual strength, and low-volatility sector leadership, plus defensive no-trade. Every definition owns its tactic family and explicit preferred market-regime and emotion-cycle coverage. Every hard-feasible active tactic is intentionally `research_only`; a preferred-state mismatch is preserved as soft context evidence and never promotes it to `eligible`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Each active tactic first requires ready market-regime, emotion-cycle, and sector-battlefield components plus a positive top sector. Those are hard feasibility gates. Catalog-owned regime and emotion coverage is a soft preferred-state prior: mismatch keeps `contextFit` false and emits stable `STATE_MISMATCH` reasons, but does not exclude an otherwise feasible research candidate. The router, not this evaluator, decides whether same-regime matured evidence is strong enough to compete with defense. The result keeps context fit separate from promotion status so model prose cannot promote research. Missing hard evidence fails active tactics closed while defense remains available.

The upstream daily pipeline updates at 19:00 `Asia/Shanghai`; the MAOQ runtime first checks for a complete same-day immutable snapshot at 19:15. This library reads only that already-frozen feature record and never schedules acquisition or assumes that a timer implies data readiness.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Market tactic eligibility subsystem](../../../docs/subsystems/market-tactic-eligibility.md) — contracts and failure semantics.
- [P3 tactic research](../../../docs/maoq-p3-tactic-research.md) — evidence, candidate choice, and promotion protocol.
- [Market strategic state](../market-strategic-state/README.md) — deterministic P2 input.
- [MAOQ roadmap](../../../docs/maoq-roadmap.md) — P3 and P4 boundaries.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through model-facing consumers that present selected gate results and own every prompt or tool schema.

#### KV Cache effect

None by itself. The library registers no prompt or tool; consumers own the cache effect of presenting eligibility records.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Research status is deliberate** — no active tactic is eligible until its own realistic A-share walk-forward evaluation passes.
- **P2 context only** — stock-level shape, liquidity, tradability, and execution gates belong to P4 and remain unimplemented here.
- **Daily frequency only** — intraday emotion transitions and queue position require a separate point-in-time contract.
- **Holiday discovery is upstream** — the automatic runtime avoids model work when no same-day snapshot exists; this pure library does not own a trading calendar.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Promotion is a source-controlled policy change. Do not derive it from model confidence, a single backtest headline, or a matching market label.

</details>
