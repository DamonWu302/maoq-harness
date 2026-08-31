# Market Strategic State Subsystem

English | [中文](market-strategic-state.zh.md)

The market strategic state subsystem converts immutable daily observations into replay-stable P2 features, then validates a separate model interpretation against exact evidence references. It implements the strategic-state boundary in the [MAOQ roadmap](../maoq-roadmap.md) without ranking stocks or granting execution authority.

## Deterministic feature record

`StrategicFeatureRecord` identifies the current snapshot, ordered history snapshot hashes, schema version, engine version, trading date, and cutoff. Its evidence catalog addresses each observation as `snapshot:<contentHash>#<path>` and stores the observed value. The feature engine reads no ambient clock and sorts history before computation, so the same snapshot hashes and engine version produce identical canonical output.

The record contains three independently testable `StrategicComponent` values. A ready component contains its computed value and evidence references. An unavailable component contains stable reason codes and cannot substitute a default. `eligibleForInterpretation` is true only when market regime, emotion cycle, and sector battlefields are all ready.

## Market regime and emotion cycle

The market regime calculator produces `risk_on_trend`, `rotation`, `high_volatility_divergence`, `risk_contraction`, or `repair`. Its inputs are advance ratio, mean major-index change, limit balance, broken-limit pressure, and loss-effect rate.

The emotion calculator produces `startup`, `acceleration`, `climax`, `divergence`, `ebb`, or `repair`. Its inputs are board height, promotion rate, broken-limit rate, loss-effect rate, and advance ratio. Thresholds are part of `STRATEGIC_ENGINE_VERSION`; a threshold change must create a new engine version and refresh the gold fixtures.

## Sector battlefields

Sector comparison requires the current snapshot and at least two prior snapshots with the same sector-classification version. It computes strength, persistence, capacity, catalyst support, internal breadth, leader quality, crowding, resistance, and a deterministic composite score. Every sector carries the evidence references used by those dimensions.

The output orders sectors by composite score and stable sector ID. It does not emit members, leaders, candidates, or a stock ranking. Missing or incompatible history makes only the sector component unavailable and prevents an actionable strategic posture.

## Interpretation boundary

`StrategicInterpretationDraft` must state the principal contradiction, least-resistance battlefield, supporting evidence, counter-evidence, falsifiable transition conditions, confidence, eligible posture, and Mao method applications. The host rejects empty evidence sets, duplicate or unknown references, invalid confidence, missing transition conditions, and method applications without evidence or a limitation.

`buildStrategicStateRecord()` receives an explicit decision time and maximum age. It reads no process clock. A stale, time-inconsistent, or incomplete feature record may produce only `no_trade`; confidence below `0.5` remains non-actionable even when the stated posture is more aggressive. The final record stores deterministic features and interpretation separately so replay can compare model changes without changing computed facts.

## Mao method attribution

The model selects only a `MaoMethodId` and writes its application, evidence references, and limitation. `MAO_METHOD_CATALOG` supplies the work title, source URL, and a Chinese method summary after validation. Every resolved attribution carries `attributionKind: paraphrase`; the system does not present the summary as an edition-specific quotation.

The initial catalog covers investigation before conclusion, seeking truth from facts, principal contradiction, concrete analysis, practice testing, concentrating advantage, and initiative-flexibility-planning. The mapping is an analytical method analogy for market research, not a claim that the works discuss securities trading.
