# Agent Note: Bounded autonomy runtime for MAOQ decisions

Status: proposed

English | [中文](2026-08-30-maoq-bounded-autonomy-runtime.zh.md)

## Problem

MAOQ needs an agent runtime that can choose research paths, delegate work, reconcile conflicting evidence, and produce stock-selection decisions without a fixed orchestration graph. Unrestricted autonomy is unsafe for trading: a model must not change market-data cutoffs, risk limits, execution permissions, or production strategy code while it is deciding what to do.

The quantitative domain remains in the separate `maoq-agent` repository. This fork must provide orchestration and runtime policy without duplicating market calculations or turning MAOQ requirements into special cases inside the generic agent loop.

## Proposal

MAOQ will ship as a source-built DSH profile composed from existing session, subagent, Web, workflow, guard, and interaction capabilities plus MAOQ-owned plugins. The profile may select tools and subagents dynamically, but deterministic services enforce resource budgets, data-time boundaries, risk rules, and execution permissions outside model control.

The first implementation will use documented plugin extension points. A core patch is permitted only when a required behavior cannot be expressed as a plugin, and each such patch must include a focused regression test and a note explaining the missing extension point. The generic agent loop will not contain market terminology or strategy rules.

The runtime will expose one structured decision operation to the Python domain service. A decision run binds an immutable market-data snapshot, news-evidence snapshot, strategy version, and runtime version to a unique decision identifier. Retries with the same identifier must not create a second committed decision or execution request.

The commander may choose which specialist agents to run and may stop when additional research has low expected value. Initial specialist roles cover policy and macro evidence, news verification, market regime, short-line emotion cycle, sector battlefield ranking, tactic selection, stock research, and adversarial risk review. Roles are capabilities available to the commander, not a fixed requirement that every run invokes all agents.

Specialists return schema-validated claims with evidence references, observation times, confidence, counter-evidence, and invalidation conditions. Aggregation resolves contradictions against evidence quality and data recency; it does not use majority voting over prose reports. Every model-visible input and every committed conclusion must be reconstructable from the session log, while the authoritative market facts and decision ledger remain in the domain database.

The production profile disables runtime self-modification and excludes broker credentials from research agents. A separate research profile may propose code or strategy patches, but promotion requires tests and explicit human approval. Live execution is outside the first implementation; a deterministic executor may be added only behind account-level limits, idempotency, and an emergency stop.

Market-calendar automation remains an external service. It starts or resumes DSH runs with explicit snapshots and deadlines; the session-local interval scheduler is not the authority for exchange sessions, holidays, or missed-run recovery.

### Autonomy levels

- Level 0 provides read-only analysis with no delegation.
- Level 1 permits autonomous research, Web evidence collection, and bounded subagent delegation.
- Level 2 permits autonomous candidate generation and paper decisions after deterministic risk validation.
- Level 3 may submit constrained live execution requests only after a separate decision approves that capability.
- Self-modifying production behavior is excluded from every level.

### Initial implementation slice

The first slice adds one MAOQ profile and the minimum plugins required to run a decision without changing the generic agent loop. It proves dynamic specialist selection, structured output, independent risk veto, event persistence, recovery, cancellation, and a Python caller. Package boundaries will follow measured independent evolution; the slice will not create one package per conceptual role in advance.

The Python service owns market calculations, tactic definitions, candidate ranking, portfolio state, and the authoritative decision transaction. DSH owns agent execution, model and tool selection, delegated context, session events, cancellation, and runtime telemetry. Their integration uses a narrow versioned protocol rather than direct imports across repositories.

## Alternatives considered

**Implement the complete decision engine inside DSH.** This would couple the TypeScript runtime to quantitative research and duplicate Python calculations. It also makes upstream synchronization harder because market behavior would spread across generic runtime packages.

**Keep upstream DSH unchanged and configure only prompts.** Prompt-only composition cannot reliably enforce idempotency, risk vetoes, evidence fields, tool permissions, or durable decision lifecycle rules.

**Fork and rewrite the agent loop.** A private loop provides maximum freedom but discards the plugin architecture, increases merge conflicts, and makes runtime correctness depend on a large permanent patch set.

**Run every specialist on every decision.** A fixed graph is easy to observe but spends time and tokens on irrelevant questions and prevents the commander from allocating research effort according to uncertainty.

**Allow the production agent to modify its own plugins.** This shortens experimentation but lets an unevaluated change alter permissions or decision behavior during the same process that proposes it.

## Acceptance criteria

- A source-built MAOQ profile starts from this repository and completes one decision through the Python SDK or protocol client.
- The commander selects from at least three specialists at runtime, and a recorded case proves that it can omit an irrelevant specialist.
- Every specialist result and the final decision pass JSON Schema validation and retain evidence time, source, counter-evidence, and invalidation fields.
- A deterministic risk service can reject a model-approved candidate, and the rejected action cannot reach the execution adapter.
- Repeating a decision identifier is idempotent across timeout, cancellation, and process restart.
- Session replay reconstructs the agent-visible evidence and conclusion, while the domain database remains authoritative for facts, portfolio state, and committed decisions.
- Tool filters, delegation depth, parallel-child count, model cost, wall time, and Web access are configurable and fail closed when their limits are reached.
- The production profile has no self-modification tool and no broker credential; the initial slice cannot place a live order.
- Focused composition tests cover the real profile, and a keyless recorded-session snapshot covers the model-visible decision path.
- Upstream `master` can be merged without resolving market-domain changes inside the generic agent loop.

## Risks

Dynamic delegation can become nondeterministic and expensive. The runtime therefore records selection causes, applies hard budgets, and evaluates decisions by replayable outcomes instead of requiring identical reasoning text.

Separating DSH events from the domain ledger creates two persistence systems. Unique decision identifiers and explicit commit results prevent ambiguous ownership; session events explain the run, while the domain transaction determines whether a decision exists.

Plugin-only implementation may expose a genuine missing extension point. The smallest tested core change is preferable to simulating a lifecycle guarantee in prompts, but every core patch increases upstream synchronization cost and must remain free of market-domain policy.
