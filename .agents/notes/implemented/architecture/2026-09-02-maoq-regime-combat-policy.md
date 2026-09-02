# Agent Note: Select feasible tactics with regime evidence and transition control

Status: implemented

English | [中文](2026-09-02-maoq-regime-combat-policy.zh.md)

## Problem

The regime-evidence router repairs sparse scorecard cells but still selects defense on 929 of 967 routable cutoffs. Its dominant rejection is a static market-regime or emotion mismatch. The replay nevertheless contains matured results for every tactic in every market regime, and several fixed tactics earn material returns outside their catalog-declared preferred state. Treating a preferred state as an absolute prohibition prevents the selector from learning which feasible tactic has the least resistance in the current market.

Daily switching is a separate defect. A selector that changes tactic whenever two close scores cross pays repeated costs without proving that the challenger has a durable advantage. Benchmark opportunity cost also matters to promotion, but a future benchmark return cannot enter a decision made at the prior cutoff.

## Decision

The eligibility record will distinguish hard feasibility from preferred-state fit. Ready strategic components and a positive sector battlefield remain hard requirements. Catalog market-regime and emotion-cycle coverage becomes a soft prior recorded in the same gates. A hard-feasible research tactic remains a research candidate when its preferred labels do not match; its `contextFit` stays false and its reason codes preserve the mismatch.

Router v3 will consider every hard-feasible tactic with same-regime matured evidence. State fit contributes 0.15 when market and emotion both match, 0.08 for market only, 0.04 for emotion only, and zero when neither matches. The unchanged eight-sample floor, positive 95% expectancy lower bound, positive doubled-cost expectancy, 50% fill floor, positive final score, research-only authority, and no-cross-regime rule remain mandatory. This broadens comparison without forcing a trade or weakening execution evidence.

A deterministic transition selector will operate after routing. It will enter a qualified tactic from defense immediately and exit immediately when the incumbent is no longer routed. An active incumbent must be held for five routable sessions before a discretionary switch. After that period, a challenger must exceed the incumbent route score by 0.03. The transition record will expose the selected tactic, prior tactic, held sessions, and reason so replay can attribute switching cost separately from route quality.

Benchmark opportunity cost will remain an evaluation and commander-counterevidence input. The replay will compare the transition-controlled track with no-trade, fixed tactics, equal allocation, real indices, and the prior stateless route. No future benchmark return or full-period result will enter a daily route.

## Alternatives considered

**Keep catalog state labels as hard exclusions and lower evidence thresholds.** This increases activity by accepting weaker statistics while preserving the dominant static exclusion defect.

**Allow every tactic without a state prior.** Same-regime evidence would still constrain selection, but the catalog would no longer express the intended tactic doctrine. A bounded soft contribution preserves that information without turning it into an untestable prohibition.

**Force one active tactic in every regime.** This optimizes participation instead of net victory and removes defense when all feasible evidence is negative.

**Inject realized benchmark returns into the route.** The next-session or full-period benchmark result is not known at the decision cutoff and would invalidate the replay.

**Apply transition hysteresis before fixing eligibility.** Lower switching cannot recover opportunities that never enter the route.

## Verification

Focused tests prove preferred-state participation, hard exclusion, same-regime-only evidence, positive expectancy and cost gates, immediate exit, minimum hold, challenger margin, deterministic identities, and replay attribution. Type checking passes across the workspace.

The preregistered 2022–2025 replay contains 969 sessions and 967 routable cutoffs. The raw route selects defense 835 times and an active tactic 132 times, versus 929 and 38 in P1. The transition-controlled track returns +2.70% after costs, compared with -3.14% for P1 and +1.58% for the stateless v4 route. It improves `risk_contraction` from the stateless route's -9.37% to -8.37% without worsening the other reported regime slices. P2 therefore passes its correction acceptance criterion.

The result does not pass paper promotion. The SSE Composite returns +9.26%, the equal-weight quality universe +62.00%, and fixed breakout-pullback +78.06%. During `risk_on_trend`, the corrected route returns +16.61% while the SSE Composite returns +59.16%. It also pays 9.90% cumulative switching charges and is active on only 132 of 968 comparable sessions. The transition rule changes only one daily selection, with one minimum-hold event and no challenger-margin switch, so its parameter evidence remains thin. Historical commander coverage is still zero, and this inspected range cannot authorize further tuning or promotion.

## Consequences

Evidence from a broad market regime can hide important emotion or execution differences, so the evidence-scope penalty and positive lower-bound gates remain. Tactics evaluated outside their preferred doctrine may expose accidental historical correlations; a separate sealed holdout remains required. Five sessions and a 0.03 score margin are development parameters, not universal market constants, and any later change requires a new transition-policy version.

The principal contradiction is no longer static context exclusion. It is insufficient upside participation: the selector preserves capital in weak regimes but does not deploy enough of the profitable breakout family during the main risk-on opportunity set. A successor trial must preregister how current, point-in-time evidence controls bullish participation or exposure and must preserve contraction defense. It cannot use the inspected 2022–2025 interval as its promotion holdout.
