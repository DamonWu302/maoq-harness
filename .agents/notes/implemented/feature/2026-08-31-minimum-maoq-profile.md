# Agent Note: Minimum MAOQ decision profile

Status: implemented

English | [中文](2026-08-31-minimum-maoq-profile.zh.md)

## Problem

The proposed bounded-autonomy runtime needs a first executable vertical slice before market-data and strategy breadth expand. The slice must prove three properties together: the commander chooses specialists dynamically instead of following a fixed all-role graph, every stage crosses a structured boundary, and an independent risk reviewer can stop the proposed action. It also needs a distinct product identity without rewriting upstream package identities, provider names, licensing, or attribution.

## Decision

Ship a new `maoq` profile composed from `dsh-base`, `dsh-web-app`, and `dsh-maoq-app`. The MAOQ layer adds a reality-first commander persona and the `maoq_decide` tool. Its authority ends at research and paper decisions.

`maoq_decide` accepts one objective and an ordered smallest-sufficient subset from six roles: market regime, emotion cycle, policy/macro, sector battlefield, tactic selection, and stock research. Only selected specialists run, in parallel. A fresh synthesis child then returns the principal contradiction, battlefield, tactic, action, candidates, confidence, and invalidation conditions. A separate fresh risk child returns an approve/veto decision, reasons, hard limits, and invalidation conditions.

The workflow script and all output schemas are fixed deployment code. The caller cannot select a provider, rewrite the protocol, increase the host child ceiling, or bypass the risk phase. The host validates the selected role order across specialist reports and synthesis, validates risk-field consistency, and rejects any result where a veto is paired with approved status. The default profile permits at most four selected specialists and uses fresh `spawn` children.

The browser replaces the user-visible upstream mark with `ui-brand-maoq`. The independent code-native SVG joins opposing forces into an `M`, marks their contradiction point, and extends an upward route. The package occupies sidebar and hero slots, while the shell favicon, manifest name, and default title use MAOQ. Technical `@deepseek-ai/*` package names, provider integrations, license, and upstream history stay intact for compatibility and attribution.

## Testing

Unit tests cover role selection, parallel specialist launch, child caps, structured approved and vetoed decisions, inconsistent-veto rejection, input bounds, prompt lifecycle, and brand slot lifecycle. A keyless real-Loader test boots the actual Agent loop, tool registry, worker-thread workflow engine, subagent seam, persistence, and a deterministic structured provider. Its recorded result proves that a two-role choice starts no unselected specialist, produces structured synthesis, and returns the independent veto to the parent. A delivered source-CLI smoke resolves the shipped `maoq` profile and pins its Codex route, council model, and child ceiling. Browser tests prove that the configured Codex route suppresses DeepSeek API-key onboarding on both initial load and refresh. Profile and bundle tests pin the shipped composition and paper-only policy.

## Consequences

- MAOQ has an executable command surface while remaining a removable plugin layer rather than a fork of the Agent loop.
- Dynamic specialist choice is model discretion inside a host-owned role and budget boundary.
- Risk veto is not merely prompt advice; result consistency is enforced after the workflow crosses back into host code.
- The profile is ready for later daily-market snapshots, network research, strategy libraries, and deterministic portfolio risk without granting those capabilities prematurely.

## Alternatives considered

- **A fixed six-agent graph** — rejected because it hides the commander's central decision: which contradiction requires which evidence now. It also spends context and latency on irrelevant roles.
- **Let synthesis approve after a risk objection** — rejected because advisory risk cannot provide an independent stop boundary. Host validation makes a veto terminal for the run.
- **Rewrite upstream package names** — rejected because it would break workspace compatibility and obscure license and source attribution; user-visible identity is independently composable.

## Known limitations and deferred work

- Market data, sector taxonomy, policy/news evidence, and immutable daily cutoffs are not implemented in this slice.
- The risk reviewer is independent by context but still model-authored; deterministic exposure, liquidity, and drawdown engines remain future services.
- The profile makes one council decision per call and has no longitudinal regime journal or scheduled daily loop yet.
- User-visible branding is replaced, but compatibility-critical source package names and upstream attribution deliberately remain.
