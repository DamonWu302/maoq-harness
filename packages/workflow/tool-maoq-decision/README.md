---
description: "Build evidence-bound MAOQ strategic states and route-constrained tactic decisions under an independent risk veto."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-maoq-decision

English | [中文](README.zh.md)

## Summary

`dsh-tool-maoq-decision` gives the commander canonical daily strategic-state tools and `maoq_select_tactics`, which turns the latest approved state plus one bounded conditional scorecard into a route-constrained tactic decision. Strategic quick analysis uses one synthesis child and one independent risk child; deep analysis first runs selected specialists. Tactic selection starts exactly two fresh children only when an active tactic qualifies, while a defense-only route starts none. The host rejects stale state, unknown evidence, route expansion, fabricated promotion, inconsistent vetoes, and paper exposure for research tactics. The package cannot rank stocks or place live orders.

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

Call `maoq_analyze_strategy` with a current snapshot hash, at least two prior snapshot hashes, explicit decision time, maximum feature age, concrete objective, and the smallest sufficient ordered specialist subset. P2 roles are `market_regime`, `emotion_cycle`, `policy_macro`, `sector_battlefield`, and `tactic_selection`. The deployment default permits at most four specialists.

For the routine market state, call `maoq_state_refresh_daily` with no arguments. It selects the newest snapshot for each of the latest three distinct trading dates, uses a stable daily objective, applies the `market_regime`, `emotion_cycle`, and `sector_battlefield` lenses, derives decision time from the current snapshot cutoff, and uses the deployment-owned age limit. A corrected newest snapshot changes the identity and invalidates the older mirror; changing user wording does not.

With `autoDailyRefresh` enabled, the first future live root Agent owns a disposable Shanghai-market timer. On weekdays it checks for a same-day snapshot at `dailyRefreshTime`, retries only cheap snapshot selection during the configured window, and starts the strategic workflow only for an unseen content hash. A revised same-day snapshot receives one new canonical decision; an unchanged hash starts no children. A process that starts after the window makes one catch-up attempt. Market holidays produce no model work because the newest snapshot date does not match the Shanghai calendar date.

The strategic result stores deterministic features separately from interpretation. Reports and synthesis must cite exact snapshot evidence refs, include counter-evidence and falsifiable transition conditions, and explain each selected Mao method with its application and limitation. The host supplies the work title and paraphrased principle from an allowlist. Stale or incomplete features may produce only `no_trade`, and the independent risk verdict determines final actionability. Current-state reads additionally return `freshness`; callers must treat the immutable decision as historical whenever `currentUseAllowed` is false.

After an approved actionable state exists, call `maoq_select_tactics` with no arguments. The host rechecks freshness, derives hard eligibility, loads only the latest scorecard visible at the state cutoff, and constructs the deterministic top-three route. The commander may choose one primary and one optional secondary tactic from that route; `defensive_no_trade` remains available as a fallback. The independent reviewer has final veto authority. Routes and validated decisions persist under `tacticStateRoot`; research tactics retain zero paper exposure regardless of model wording.

| Field | Default | Meaning |
|---|---|---|
| `subagentProvider` | `spawn` | Fresh structured-output provider for every child. |
| `maxSpecialists` | `4` | Deployment ceiling for selected specialists. |
| `maxResultChars` | `32768` | Parent-facing rendered-result ceiling. |
| `analysisMode` | `quick` | `quick` runs synthesis plus independent risk; `deep` adds selected specialist reports. |
| `stateRoot` | `.maoq/decisions` | Directory containing immutable strategic decision mirrors. |
| `tacticStateRoot` | `.maoq/tactics` | Directory containing immutable tactic scorecards, routes, and commander decisions. |
| `maxStateFiles` | `500` | Maximum files scanned by latest and history queries. |
| `maxTacticStateFiles` | `500` | Maximum scorecard files inspected to resolve the newest cutoff-visible generation. |
| `maxSnapshotFiles` | `500` | Maximum immutable snapshots scanned to verify the newest usable market input. |
| `dailyStateMaximumAgeHours` | `24` | Host-owned maximum age of a canonical daily state. |
| `autoDailyRefresh` | `false` | Let a future live root Agent maintain the canonical state after close. |
| `dailyRefreshTime` | `19:15` | First automatic attempt after the upstream 19:00 daily-bar update in the fixed `Asia/Shanghai` market zone. |
| `dailyRefreshRetryMinutes` | `15` | Interval between cheap snapshot checks inside the refresh window. |
| `dailyRefreshWindowMinutes` | `120` | Window that accepts a late or revised same-day snapshot. |

<a id="understand-the-implementation"></a>
## Understand the implementation

The orchestration script, schemas, provider route, and child cap are deployment-owned. The daily path first canonicalizes mutable conversational intent into one fixed request. Its timer waits for an idle exact root Agent, passes the maintenance cancellation signal into the same strategic function as the manual tool, and cancels active analysis before plugin teardown completes. The shared strategic path then derives a SHA-256 decision ID from the objective, snapshot hashes, decision time, age bound, specialist set, analysis mode, feature/workflow versions, provider route, and available Codex-provider settings fingerprint. A matching persisted record returns immediately with `cacheHit: true` and `agentsStarted: 0`. A miss loads snapshots by exact hash, computes versioned features, runs the selected workflow, and atomically publishes the completed result under that ID. Failed workflows are never cached. Quick mode applies the selected roles as synthesis lenses and starts exactly two children: synthesis, then independent risk review. Deep mode runs selected specialists with `Promise.all`, followed by the same two fresh children. Each child schema enumerates the exact evidence refs available in that feature record, while the host still rejects role drift, rewritten deterministic labels, unknown evidence refs, unrecognized method IDs, inconsistent risk fields, and any attempt to make stale or incomplete inputs actionable. The optional settings provider exposes `maoq-decision`; changes cancel an active automatic attempt, invalidate its process-local completion marker, and affect the next call without a restart.

The latest and by-ID query tools evaluate current use without mutating the mirror. They resolve the newest cutoff-safe snapshot from the host catalog rather than trusting a model-supplied hash. Maximum age, an unverifiable or changed snapshot, feature/workflow version drift, analysis-mode drift, provider-route drift, or provider-settings drift produces `freshness.status: stale` and `currentUseAllowed: false`, with explicit reasons. The record remains available for replay, but cannot silently become a current recommendation.

Tactic selection publishes the deterministic route before invoking the workflow. A defense-only slate creates and persists a host decision directly. An active slate exposes only its candidates, defensive fallback, scores, evidence refs, scope, and risk ceilings to a fixed two-agent workflow. The optional secondary field is normalized to `null` after structured output because the worker schema subset uses an optional string rather than a nullable type union. The routing library then derives final scope, cash floor, and maximum paper position and publishes the decision only after host validation.

Loader compositions prove the strategic tools and tactic selector load with the profile services. The tactic composition creates a fresh strategic mirror, routes qualified active research tactics, starts exactly two children, and persists a research-scoped decision. Focused fixtures prove evidence closure, stale-state refusal, defensive fallback, host-derived scope, token accounting, and final veto. The lower-level `maoq_decide` diagnostic retains the shared tactic catalog as its structured enum.

-----

<a id="further-exploration"></a>
## Further Exploration

- [Strategic state library](../../market/market-strategic-state/README.md) — deterministic labels, evidence addresses, and attribution catalog.
- [Market snapshot](../../market/market-snapshot/README.md) — immutable inputs loaded by hash.
- [MAOQ roadmap](../../../docs/maoq-roadmap.md) — P2 scope and acceptance criteria.

## Model Experience

### System prompt and tool schema

#### What the model sees

The parent sees short guidance to read persisted state tools first, use `maoq_analyze_strategy` only when no matching state exists, call `maoq_select_tactics` only after an approved actionable state, preserve deterministic evidence, and treat the risk veto as final. It also sees the generated [tool schemas](../../../docs/tool-catalog.md#deepseek-aidsh-tool-maoq-decision). Fixed scripts and child schemas are not model-selectable.

##### MAOQ decision guidance

```markdown
For current-state questions, call maoq_state_latest first. A persisted mirror is current only when freshness.currentUseAllowed is true. If it is missing or stale and at least three trading-day snapshots exist, call maoq_state_refresh_daily; the host fixes its objective, snapshot window, specialist lenses, decision time, and age policy, and exact repeats start no agents. Use maoq_state_history for multi-day review and maoq_state_get for one exact mirror. Call maoq_analyze_strategy only for an explicitly ad-hoc question that the canonical daily state does not answer, using the smallest sufficient specialist set. After an approved actionable daily state, call maoq_select_tactics to consume only the host-built deterministic top-three route; its promotion scope, evidence allowlist, risk ceilings, and independent risk veto are binding. Use maoq_decide only for council-runtime diagnostics. None of these tools can place a live order.
```

#### Token effect

Small fixed parent guidance and six schemas add prefix cost. A strategic cache miss presents the selected deterministic feature record to its workflow. An exact cache hit and all three state queries start no children. Quick strategic misses pay for two child contexts; deep misses add one per selected specialist. Active tactic selection pays for two more fresh contexts, while deterministic defense starts none. Missing provider usage increments `unavailableCalls` instead of being estimated.

#### KV Cache effect

The parent prefix is stable while plugin visibility is unchanged. Every council child is fresh and has an independent request cache.

## Known Limitations and Deferred Work

- **Research and paper decisions only** — no broker, portfolio mutation, or live-order authority exists.
- **Daily state only** — intraday transitions need a separate point-in-time feature contract.
- **Sector persistence needs history** — fewer than two prior compatible snapshots forces `no_trade`.
- **No stock ranking in P2** — `maoq_analyze_strategy` ends at sector battlefield and strategic posture; candidate selection belongs to P3.
- **Risk review is model-authored** — the host enforces veto consistency, but deterministic portfolio limits need a future numeric risk engine.
- **Historical model value is not imputed** — deterministic routes replay without model calls; commander and veto performance require matching recorded decisions and otherwise remain no-trade.
- **No exchange holiday calendar or snapshot event** — the weekday timer relies on the snapshot trading date to avoid holiday model work and discovers revisions at the next configured check rather than from a push event.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
