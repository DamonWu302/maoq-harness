# MAOQ Development Roadmap

English | [中文](maoq-roadmap.zh.md)

## Purpose

This document turns the MAOQ direction into an executable sequence. The outcome is not a chatbot that discusses stocks, but a research and paper-trading agent that can identify the principal contradiction, select the least-resistance battlefield, choose tactics for the current market state, rank stocks, state invalidation conditions, and accept an independent risk veto.

The current focus is **P3 tactic eligibility**. P0 through P2 are complete: full label fixtures, the corrected 12-snapshot/10-evaluation-day production canary, and the current Local Codex route canary are recorded in the [MAOQ operations runbook](maoq-operations.md#p2-canary).

## Current baseline

- The `maoq` profile carries the commander persona and a bounded `maoq_decide` council.
- The commander can switch between the local Codex login and existing external API-key providers, with an exact model selection for new tasks.
- The commander dynamically selects no more than four specialists from market regime, emotion cycle, policy and macro, sector battlefield, tactic selection, and stock research.
- Fresh specialist, synthesis, and risk-review agents produce structured output; the independent reviewer has final veto power.
- Council token usage is reported per call and aggregated without invented estimates.
- Immutable daily snapshots feed deterministic market-regime, emotion-cycle, and sector-battlefield features; canonical strategic mirrors are cached, freshness-checked, and maintained automatically after close when a same-day snapshot appears.
- The system remains research and paper-trading only; it has no live-order authority.

## Product principles

1. **Victory is the objective, evidence is the constraint.** Optimize for risk-adjusted, repeatable outcomes rather than persuasive narratives.
2. **Seek truth from facts.** Every conclusion names its evidence cutoff, counter-evidence, confidence, and invalidation conditions.
3. **The principal contradiction comes before the stock.** Market state and sector battlefield determine which tactics and candidates are eligible.
4. **Use a tactical pool, not one permanent setup.** Trend continuation, emotion leadership, oversold reversal, platform pullback, event-driven opportunity, and defense are conditional tools.
5. **Concentrate only after reconnaissance.** The system narrows from the whole market to regimes, sectors, tactics, and stocks; it does not begin from a favorite ticker.
6. **Risk veto is independent.** Risk constraints are not softened because a thesis is attractive.
7. **No look-ahead.** Data, sector membership, news, and policy evidence must all be reproducible as of the decision cutoff.

## Milestones

| Milestone | Goal | Main deliverable | Exit criterion |
|---|---|---|---|
| P0 — Runtime proof | Prove the current commander stack with real model calls | Reproducible commander smoke scenario and usage report | Both model sources can create a new task; Codex can call tools; council output, veto, and token usage are visible |
| P1 — Market snapshot | Freeze one immutable daily market input | Versioned daily-bar, sector, and evidence snapshot schema | The same cutoff always rebuilds the same snapshot; no future data enters |
| P2 — Strategic state | Identify the market's principal contradiction and least-resistance direction | Market-regime, emotion-cycle, and sector-battlefield engines | Each daily snapshot produces a state, supporting evidence, counter-evidence, and transition conditions |
| P3 — Tactical pool | Match tactics to the current state | Gated tactic registry with entry, exit, and invalidation rules | Ineligible tactics are deterministically excluded before stock ranking |
| P4 — Stock battlefield | Return actionable short- and medium-horizon candidates | Scenario-aware candidate generation, ranking, and explanation | Every candidate traces to sector, tactic, evidence, risk, and invalidation; walk-forward evaluation is reproducible |
| P5 — Operating loop | Run the process consistently without live execution | Scheduled research, paper portfolio, review, and drift report | Daily runs are idempotent, auditable, and fail closed on stale or incomplete data |

## P0 — Runtime foundation and real decision proof

**Status:** complete. Local Codex login, model selection, token accounting, macOS system-proxy bootstrap, bounded specialist selection, structured synthesis, independent risk veto, external-adapter parity, startup/refresh onboarding behavior, and the failure matrix have automated evidence. The [MAOQ operations runbook](maoq-operations.md) owns the operator canary and recovery procedure.

### Scope and deliverables

1. Add a profile-level smoke harness that starts `maoq` from the delivered CLI rather than a hand-built test context.
2. Exercise the **Local Codex login** commander with a small tool call, then confirm the assistant continues after the tool result.
3. Exercise one configured **External API** commander without changing or deleting its credential flow.
4. Run `maoq_decide` with two selected specialists, one synthesis agent, and one independent risk reviewer.
5. Record commander and council token usage by provider, model, role, and unavailable-usage count.
6. Add failure scenarios for missing Codex login, invalid model, provider timeout, malformed structured output, and risk veto.
7. Add one browser check confirming that Codex configuration suppresses API-key onboarding after both startup and refresh.
8. Publish a short operator runbook covering launch, model switching, diagnostics, and recovery.

### Acceptance criteria

- `pnpm dsh --profile maoq` starts without requesting an API key when the Codex-login route is configured.
- A newly created task uses the provider and model saved on the Models page; an existing task does not switch mid-session.
- The commander performs at least one real tool call and consumes its result before answering.
- The council starts only the requested specialists and always runs fresh synthesis and risk-review agents.
- A risk veto cannot be rendered as approval.
- Provider-reported token usage is visible; absent usage is marked unavailable instead of estimated.
- Logs and user-visible diagnostics never contain access tokens, refresh tokens, or API keys.
- Each failure class produces a stable, actionable diagnostic and cannot be rendered as a successful decision.
- A committed keyless replay covers specialist selection, structured synthesis, and a terminal risk veto; a real-provider smoke covers the delivered CLI path.

## P1 — Immutable daily market snapshot

**Status:** Complete. [`dsh-market-snapshot`](../packages/market/market-snapshot/README.md) owns `MarketSnapshot` v1, deterministic construction, cutoff and point-in-time validation, source lineage, content-addressed persistence, and exact-identity reads. [`dsh-market-snapshot-json`](../packages/market/market-snapshot-json/README.md) provides audited replay; [`dsh-market-snapshot-mysql`](../packages/market/market-snapshot-mysql/README.md) consumes the quality-gated production daily, sector, index, and emotion facts; and [`dsh-market-news-web`](../packages/market/market-news-web/README.md) freezes pre-cutoff policy and news evidence for exact replay. The [P1 canary](maoq-operations.md#p1-canary) records the real-database acceptance evidence.

P1 applies “seek truth from facts” by keeping acquired observations separate from interpretation, “no investigation, no right to speak” by failing on missing critical facts, and “concrete analysis of concrete conditions” by versioning the exact date, cutoff, adjustment, calendar, sector classification, and sources. The [market snapshot decision](../.agents/notes/implemented/architecture/2026-08-31-maoq-market-snapshot.md) owns this mapping.

### Scope and deliverables

1. Define one versioned `MarketSnapshot` document that owns identity, cutoff, provenance, quality state, daily stock bars, point-in-time sector data, market breadth, emotion facts, and eligible news evidence.
2. Add a deterministic builder that normalizes source fields, validates trading-day semantics, sorts every unordered collection, computes the content hash, and persists the immutable result.
3. Introduce source adapters for the chosen daily-bar, sector, and news feeds without exposing vendor field names above the adapter layer.
4. Provide read-only snapshot lookup by identity and content hash for the commander, tests, historical replay, and later backtests.
5. Publish a fixture set covering a normal session, suspension, recent listing, delisting path, limit-constrained trading, sector-membership change, missing data, conflicting data, and news on both sides of the cutoff.

### Data boundary

- **Stock daily bars:** adjusted OHLCV, turnover, trading status, limit-up/limit-down state, listing age, and data-quality flags.
- **Sector daily data:** point-in-time membership, sector index bars, breadth, limit-up count, advancing ratio, leadership, and internal dispersion.
- **Market-wide state:** major indexes, total turnover, advance/decline distribution, limit-up ladder, failed breakouts, and loss-effect measures.
- **Policy and news evidence:** source URL, publisher, publication time, retrieval time, event time, affected sectors, confidence, and explicit cutoff eligibility.
- **Snapshot identity:** trading date, cutoff time, calendar version, adjustment version, sector taxonomy version, source versions, and content hash.

### Acceptance criteria

- Building the same date and cutoff twice produces the same content hash.
- Suspended, newly listed, delisted, and limit-constrained stocks have explicit semantics.
- Historical sector membership is point-in-time correct.
- News published or retrieved after the cutoff cannot enter the snapshot.
- Missing or conflicting critical fields fail the decision run rather than silently defaulting.
- Every persisted field is traceable to a source version or a named deterministic transformation.
- Snapshot consumers receive read-only data and cannot mutate the stored artifact or reinterpret its cutoff.
- Fixture replay succeeds without network access and produces byte-stable normalized output.

## P2 — Strategic state and principal-contradiction engine

**Status:** complete. Deterministic features, evidence-bound interpretation, sourced Mao method attribution, independent risk veto, immutable mirrors, freshness invalidation, idempotent post-close maintenance, full label gold coverage, rolling production replay, and a current Local Codex route canary have passed. The model sees a bounded top-five battlefield set plus one deterministic counterexample, while the host retains all sector features and exact evidence.

### Scope and deliverables

The strategic layer produces three connected but independently testable outputs:

1. **Market regime:** risk-on trend, rotation, high-volatility divergence, risk contraction, or repair.
2. **Emotion cycle:** startup, acceleration, climax, divergence, ebb, or repair, supported by ladder height, promotion rate, failed breakouts, loss effect, and breadth.
3. **Sector battlefield:** sector strength, persistence, capacity, catalyst support, internal breadth, leader quality, crowding, and resistance.

The engine must separate observation from interpretation. Deterministic features are computed first; model analysis explains the principal contradiction, counter-evidence, and possible transitions without rewriting those features.

The deterministic layer owns feature definitions, missing-data behavior, classification inputs, and eligibility bounds. The interpretation layer receives one snapshot identity plus those computed facts and returns a structured thesis containing the principal contradiction, least-resistance battlefield, supporting evidence references, counter-evidence references, transition conditions, confidence, and eligible strategic posture. The final record stores both layers so a later evaluator can distinguish a feature error from a reasoning error.

### Acceptance criteria

- The same snapshot and engine version always produce identical deterministic features.
- Market regime, emotion cycle, and sector battlefield can each be tested and failed independently.
- Every emitted state cites concrete snapshot fields; the model cannot introduce an uncited price, count, date, sector membership, or news fact.
- Supporting evidence, counter-evidence, confidence, and falsifiable transition conditions are mandatory structured fields.
- Every accepted interpretation names at least one allowlisted Mao method, its source work, its evidence-bound application, and its limitation; method summaries are marked as paraphrases rather than quotations.
- A stale, incomplete, or internally inconsistent snapshot cannot produce an actionable posture.
- Golden fixtures cover at least one case for each market-regime and emotion-cycle label, plus ambiguous evidence that must reduce confidence or produce defense/no-trade.
- Changing a prompt or model cannot change deterministic features; replay reports interpretation differences separately.
- The engine does not rank individual stocks or bypass the later tactic-eligibility and risk layers.

## P3 — Tactical pool

**Status:** in progress. The initial registry, fail-closed P2 context gates, point-in-time daily-history feature contract, and shared next-open A-share execution simulator are implemented. The three active candidates remain `research`; only `defensive_no_trade` is eligible until the production history adapter and walk-forward evaluation prove promotion. The evidence review and promotion policy are in [MAOQ P3 tactic research](maoq-p3-tactic-research.md).

| Tactic family | Eligible environment | Primary evidence | Typical invalidation |
|---|---|---|---|
| Trend continuation and breakout | Expanding trend with sector confirmation | Relative strength, volume structure, breadth, and persistence | Breakout failure or sector breadth collapse |
| Emotion leader and limit-up ladder | Ignition or acceleration with positive promotion economics | Ladder structure, promotion rate, sealed orders, follower response | Core leader breaks, loss effect spreads, or promotion rate collapses |
| Oversold reversal | Panic or retreat followed by measurable repair | Selling exhaustion, divergence, reclaim, and breadth repair | New low with renewed volume or repair breadth failure |
| Platform pullback and secondary advance | Mainline sector remains intact after controlled consolidation | Support retention, shrinking supply, renewed leadership | Platform breakdown or sector leadership change |
| Policy or event driven | New evidence changes expected payoff for a sector | Source quality, novelty, transmission path, capacity, and price confirmation | Catalyst disproved, absorbed, or unsupported by price and breadth |
| Defensive and no-trade | Risk-off, low edge, stale evidence, or excessive crowding | Drawdown risk, liquidity, dispersion, and uncertainty | Clear regime repair with improving expected payoff |

Every tactic is a module with eligibility gates, candidate features, entry conditions, exit conditions, invalidation, position ceiling, and evaluation protocol. The LLM may select among eligible tactics; it may not bypass a failed deterministic gate.

## P4 — Stock selection and evaluation

Candidate selection proceeds in this order:

```text
daily snapshot
  -> market regime and emotion cycle
  -> sector battlefield ranking
  -> eligible tactical modules
  -> tactic-specific candidate generation
  -> liquidity and tradability filters
  -> independent risk veto
  -> short-horizon and medium-horizon lists
```

The output keeps short-line and medium-line decisions separate. A short-line candidate emphasizes emotion position, leadership, liquidity, next-session execution risk, and rapid invalidation. A medium-line candidate emphasizes sector persistence, trend quality, pullback structure, catalyst durability, and a wider holding horizon. The system does not force both lists to be populated.

Evaluation uses walk-forward splits, point-in-time membership, transaction costs, limit constraints, suspension handling, and delisting outcomes. Report hit rate, payoff ratio, expectancy, maximum drawdown, turnover, capacity, regime-conditioned performance, and the contribution of vetoed trades. No single backtest score is sufficient for promotion.

## P5 — Daily operating loop

1. Build and validate the immutable snapshot after the configured cutoff.
2. Run deterministic state and sector features.
3. Let the commander choose the smallest sufficient specialist council.
4. Produce strategic state, eligible tactics, candidates, and invalidation conditions.
5. Apply independent deterministic and model risk reviews.
6. Update a paper portfolio only; never place a live order.
7. After the outcome window closes, attribute decisions to data, regime, sector, tactic, selection, execution assumptions, and veto.
8. Monitor feature drift, tactic decay, model changes, token cost, and unavailable evidence.

## Extension form and architecture decision

MAOQ remains a profile assembled from ordinary Cordis plugins; it does not fork the Agent loop and does not become one monolithic plugin. `dsh-maoq-app` remains the deployment bundle that selects and configures capabilities, while owned runtime behavior lives in focused packages with tests and explicit services.

- **P0 orchestration:** keep `dsh-tool-maoq-decision` as the model-facing council Consumer. It coordinates selected subagents and enforces the final veto, but it does not fetch market data or calculate indicators.
- **P1 market facts:** the MAOQ market-snapshot service owns snapshot types, deterministic construction, validation, persistence, read-only queries, and a named adapter registry. Source-specific or independently deployed acquisition belongs in separate provider packages.
- **P2 strategic state:** `dsh-market-strategic-state` computes deterministic features and validates evidence-bound interpretation as a plain domain library; `dsh-tool-maoq-decision` consumes it and the snapshot service through `maoq_analyze_strategy`. Specialist roles remain runtime agents, not Cordis plugins.
- **Market task mode:** the shipped `maoq` agent preset owns the narrow per-session persona and capability set. It composes web research and user questions while the MAOQ Profile contributes snapshot and decision tools globally; coding tools remain in Standard mode. A task chooses its preset before the first message and does not mutate it mid-run.
- **Current UI:** `dsh-client-ui-maoq-tools` is a separate Client Cordis plugin for the now-stable snapshot and decision call records. The bundle mounts it; domain packages do not import browser components.
- **Later data vendors:** split a vendor adapter into its own Service Provider package only when replacement, credentials, dependencies, or lifecycle genuinely differ. The snapshot schema and downstream decisions never depend on vendor field names.

Do not create one package or plugin per indicator, tactic, specialist role, or prompt. Deterministic calculators are ordinary modules inside their owning capability package; tactics become registered modules only in P3, when independent eligibility and evaluation justify that extension point. This keeps P0–P2 replaceable at real system boundaries without turning internal functions into deployment units.

## Architecture boundaries

- LLMs interpret evidence, compare contradictions, select eligible modules, and explain decisions.
- Deterministic services own cutoffs, feature computation, tactic gates, portfolio arithmetic, risk ceilings, and backtest accounting.
- Web search supplies policy and news evidence with provenance; it never overwrites market data or bypasses the cutoff.
- Market-data adapters are replaceable. Snapshot and decision contracts do not depend on one vendor's field names.
- Live brokerage integration remains out of scope until the research and paper loop has stable evidence of value and a separate authorization design.

## Promotion gates

A milestone advances only when its artifact is reproducible, its failures are explicit, and its tests cover the highest-risk boundary. A tactic advances from research to the paper pool only when it survives walk-forward evaluation across multiple regimes and remains viable after costs and execution constraints. A model or prompt change advances only when replay and live canary scenarios show no regression in structure, veto behavior, or evidence discipline.

## Recommended next action

Start P3 by defining tactic eligibility contracts and gold fixtures without adding stock ranking to the P2 engine. Keep the [P0 canary](maoq-operations.md#p0-canary) and P2 deterministic replay fixtures green when changing model routes, prompts, council structure, authentication, or browser onboarding.
