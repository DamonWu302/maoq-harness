# Agent Note: MAOQ deterministic strategic state and sourced method attribution

Status: implemented

English | [中文](2026-08-31-maoq-strategic-state.zh.md)

## Problem

An unconstrained model can rename market states, cite observations that are absent from the decision snapshot, and produce a plausible principal contradiction without showing what would falsify it. Asking the model to mention Mao Selected Works adds a second attribution risk: it can invent a title, quotation, or connection that the host cannot audit. P2 needs deterministic observations to remain stable across prompt and model changes while preserving useful interpretation.

## Decision

`@deepseek-ai/dsh-market-strategic-state` owns versioned deterministic market regime, emotion cycle, and sector battlefield features. It accepts one immutable current snapshot and explicit prior snapshots, sorts history, computes every label before model execution, and gives each observation a `snapshot:<hash>#<path>` evidence address. The three feature families return independent ready or unavailable results. An unavailable component prevents an actionable posture without erasing the ready components.

Market regime and emotion cycle use current breadth and emotion observations. Sector comparison requires two prior snapshots with the same classification version and computes strength, persistence, capacity, catalyst support, internal breadth, leader quality, crowding, and resistance. It orders sectors deterministically and emits no stock ranking.

The separate `StrategicInterpretationDraft` contains the principal contradiction, least-resistance battlefield, supporting evidence, counter-evidence, transition conditions, confidence, posture, and Mao method applications. The host rejects empty or unknown evidence references, missing counter-evidence, invalid confidence, absent transition conditions, stale actionable output, and actionable output from incomplete features. Decision time and maximum age are explicit replay inputs; the validator reads no ambient clock.

The model chooses only an allowlisted `MaoMethodId` and explains its application, evidence, and limitation. `MAO_METHOD_CATALOG` adds the source work, source URL, and a fixed Chinese method summary after validation. Every resolved entry is marked `paraphrase`; no model-provided title or purported quotation becomes attribution. The catalog maps analytical methods from 《反对本本主义》, 《改造我们的学习》, 《矛盾论》, 《实践论》, 《集中优势兵力，各个歼灭敌人》, and 《中国革命战争的战略问题》 to the research workflow without claiming that those works discuss securities trading.

`maoq_analyze_strategy` loads snapshots by exact hash and supports quick and deep interpretation over the same deterministic record. Quick mode applies the selected roles as synthesis lenses in one fresh child, then runs a separate fresh risk review. Deep mode first supplies the deterministic features to the selected specialists in parallel, requires evidence and method references in every report, then runs synthesis and the same independent review. Every child output schema enumerates the evidence addresses from that exact feature record, preventing an unknown reference from invalidating the completed council after all child calls have run; host validation remains the final fail-closed boundary. The host preserves deterministic labels, resolves attributions, and combines validated posture with the risk verdict. The lower-level `maoq_decide` remains available for council-runtime diagnostics and is not the P2 strategic decision path.

Completed strategic runs are published as immutable decision mirrors under a SHA-256 identity derived from their exact objective, snapshot hashes, replay time, age bound, specialist set, mode, feature/workflow versions, provider route, and available Codex-provider settings fingerprint. The cache lookup happens before snapshot loading or provider resolution. An exact hit returns the stored state with zero new children; latest, history, and by-ID tools read the same store without model work. `maoq_state_refresh_daily` removes conversational variation before that identity is built: the host selects the newest three distinct trading dates and fixes the daily objective, three specialist lenses, snapshot-derived decision time, and deployment age policy. Latest and by-ID reads resolve the newest cutoff-safe host snapshot and expose a separate fail-closed freshness verdict: an unverifiable catalog, age expiry, snapshot change, engine/workflow drift, analysis-mode drift, provider-route drift, or provider-settings drift makes current use unavailable while preserving the immutable record for history. Failed or cancelled workflows never publish a mirror. Internal post-close and event-driven scheduling remain later operating-loop work.

## Alternatives considered

**Let the commander infer all states directly from snapshot JSON.** This makes labels change with prompts and models, prevents independent component tests, and mixes observation with interpretation.

**Put Mao titles and quotations in the prompt and accept free-text citations.** A prompt is not an attribution boundary; the model can still alter titles, paraphrases, or evidence links. Edition-specific quotations also create a verification burden that does not improve the decision contract.

**Collapse unavailable components into `no_trade` without retaining partial results.** This hides whether market, emotion, or sector history failed and makes data-quality diagnosis and replay comparison less useful.

**Begin stock ranking inside P2.** Candidate scoring would bypass the P3 research and P4 risk boundaries. P2 therefore stops at sector ordering and strategic posture.

**Always run every selected specialist.** This preserves maximum separation but makes routine state checks pay for reports that the deterministic feature engine already supplies. Deep mode retains that path; quick mode removes only those reports and never removes the independent risk reviewer.

## Consequences

The same ordered snapshot hashes and engine version produce byte-identical deterministic features; prompt or model changes can affect only the separately stored interpretation. Every accepted interpretation names supporting and opposing snapshot fields, falsifiable transition conditions, confidence, and at least one sourced method application. Quick mode fixes strategic child count at two, while deep mode adds one child per selected specialist. Both modes preserve the final independent veto. Exact repeated requests become filesystem reads and report `agentsStarted: 0`; historical review no longer reruns the council. Missing history, stale inputs, or invented citations fail closed. Thresholds are explicit engine policy: changing them requires a version bump and updated gold fixtures. The fixed attribution catalog improves auditability but deliberately gives up verbatim quotation and edition page references. Intraday state remains outside this daily contract.
