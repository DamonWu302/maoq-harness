# Agent Note: Unify MAOQ tactic identity and host validation

Status: implemented

English | [中文](2026-09-02-maoq-unified-tactic-catalog.zh.md)

## Problem

The fixed-tactic lab, strategic eligibility evaluator, and general DSH council need the same tactic identity and promotion facts. Separate ID and version maps can drift, while a free-form model field can name an unregistered tactic or present a research tactic as a paper action.

## Decision

`@deepseek-ai/dsh-market-tactic-eligibility` owns the canonical catalog for six active research tactics and `defensive_no_trade`. Each definition owns its tactic version, family, promotion status, context gates, execution requirements, and risk policy. It exports the complete and active ID sets plus a runtime ID guard for model and worker boundaries.

`@deepseek-ai/dsh-market-tactic-lab` derives its research tactic union and version map from that catalog. `@deepseek-ai/dsh-tool-maoq-decision` embeds the same IDs in the general council schema and validates the returned tactic and action after the worker result crosses back to the host. The host rejects unknown tactics and actions, requires `defensive_no_trade` and `no_trade` together, and rejects `paper_trade` for a tactic whose catalog promotion status is not `eligible`.

The catalog does not select a tactic. Conditional performance, deterministic top-three routing, and DSH-assisted dynamic selection remain separate P3.5 phases in the [dynamic tactic commander](../../../../docs/maoq-dynamic-tactic-commander.md).

## Verification

Catalog tests prove stable IDs, unique versions, immutable definitions, and fail-closed eligibility. Research-signal tests prove their ID and version map equals the active catalog. Council tests reject invented tactics and promotion-inconsistent actions, while the Loader composition preserves a registered tactic through synthesis and independent veto.

## Alternatives considered

**Keep a tactic map in each package.** This avoids a package dependency but permits identity, version, and promotion drift at exactly the places that must agree.

**Validate only through the model output schema.** Structured output reduces malformed values but does not replace validation after the worker boundary or enforce catalog promotion semantics.

**Move the catalog into the workflow package.** That makes the research and eligibility layers depend on an orchestration consumer. The eligibility library already owns promotion and execution policy, so it is the smaller stable owner.

## Consequences

Adding or versioning an active tactic requires one catalog change and corresponding eligibility and signal implementation evidence. The research lab and council gain a direct workspace dependency on the eligibility library. P0 prevents identity drift and invalid paper actions, but it does not demonstrate that any active tactic deserves promotion or that dynamic selection adds value.
