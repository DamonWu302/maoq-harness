# Agent Note: Implement cutoff-correct conditional tactic routing

Status: implemented

English | [中文](2026-09-02-maoq-conditional-tactic-routing.zh.md)

## Problem

The shared tactic catalog made every weapon identifiable and fail-closed, but aggregate full-period results still could not answer which eligible weapon fit the market state known at a particular decision cutoff. Letting a model inspect full history would be slow, vulnerable to future leakage, and impossible to reproduce.

## Decision

Add `dsh-market-tactic-routing` as an ordinary focused library rather than changing the agent loop. It owns three immutable, content-addressed records: matured tactic outcomes, conditional scorecard generations, and deterministic route decisions.

Each outcome is attributed to the original strategic cutoff and exact catalog tactic version only after its holding window has matured. Scorecard cells are keyed by tactic version and six bounded context dimensions: market regime, emotion cycle, sector structure, volatility, crowding, and execution quality. Incremental generations retain sufficient statistics and a 0.2-alpha recent-effectiveness average, so a daily update reads only newly available date partitions rather than rescanning full history.

Router version `maoq-deterministic-tactic-router-v1` freezes its first evidence policy. An active tactic requires at least eight exact-context matured samples, a positive 95% expectancy lower bound, positive expectancy under doubled execution cost, at least 50% fill, and a positive final score. The score combines catalog state fit, the conditional lower bound, exact-context evidence, recent effectiveness, execution quality, cost robustness, drawdown, crowding, volatility, and sample uncertainty. Stable ordering emits at most three active tactics with component scores, evidence identities, rejection reasons, risk ceilings, and a cash floor. `defensive_no_trade` remains independently available and wins when active evidence is unavailable or inadequate.

## Verification

- Unit fixtures cover cutoff attribution, future-evidence rejection, duplicate rejection, immutable persistence, bounded incremental reads, exact-context qualification, catalog eligibility, stable top-three ordering, research-only position limits, and defensive fallback.
- The package compiles independently and its public contracts are documented in paired English and Chinese package and subsystem documentation.
- Route identities include the strategic snapshot, scorecard, router version, eligibility, and catalog evidence needed for deterministic replay.

## Alternatives considered

**Ask DSH to read raw history for every decision.** This increases latency and token use, permits inconsistent calculations, and obscures the exact evidence available at the cutoff.

**Route on full-period aggregate return.** This ignores state dependence and turns regime changes into hidden selection error.

**Train an adaptive learner immediately.** The current outcome stream is too sparse for defensible online learning. A fixed, versioned baseline is required before model or learner value can be measured.

## Consequences

P1 now supplies a small, replayable decision slate to the later commander without granting a model authority to bypass eligibility or risk limits. The fixed thresholds are a preregistered baseline, not a claim that they are economically optimal. P2 must compare deterministic routing with bounded DSH selection, and P4 must supply a sealed stock-outcome stream before any paper-trading promotion claim is valid.
