# Agent Note: Second-wave daily tactic trials

Status: implemented

English | [中文](2026-09-02-second-wave-daily-tactic-trials.zh.md)

## Problem

The first three MAOQ tactic trials do not satisfy the promotion thresholds. Retuning their breakout, limit-up, and repair parameters would increase selection bias without testing distinct sources of return.

## Decision

The fixed research registry includes three additional daily-bar and sector trials: correlation-cluster sector rotation, sector-residual strength, and low-volatility sector leadership. They share the existing next-open A-share execution policy, costs, fold construction, capacity audit, Deflated Sharpe calculation, and suite-level PBO calculation.

The feature record uses schema version 2. It adds 20-session stock realized volatility, point-in-time sector 1- and 20-session returns, sector realized volatility, and canonical 20-session sector-correlation pairs. The incremental engine retains only the bounded sector and stock observations required to reproduce the batch result.

The three trials accept new entries once every five sessions. Correlation clustering uses the preregistered 0.75 threshold. The model cannot change thresholds, portfolio construction, entry frequency, or holding periods through the research tool. All six trials count toward `attemptedTrials`, and none can leave `research` without the sealed holdout.

## Alternatives considered

**Retune the first three tactics.** This would search near observed failures and undercount the effective trials, so the registry keeps their versions and results unchanged.

**Adopt published long-short or intraday implementations.** Their execution assumptions do not match the daily-only, long-only, T+1 policy, so public results remain motivation or comparison evidence only.

**Add a general optimizer.** A factor allocator would make attribution and trial counting less reliable before individual signals demonstrate positive net evidence, so every new trial remains a fixed transparent rule.

## Consequences

The same production-history read compares six fixed trials and raises the DSR attempted-trial count from three to six. Feature computation costs increase because every accepted session calculates stock volatility and sector correlations. The reported 2022–2025 results remain research evidence even when a new tactic is negative; a failed trial stays visible and cannot be overwritten by a nearby parameter variant.
