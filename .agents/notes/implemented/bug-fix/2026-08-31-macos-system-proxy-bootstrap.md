# Agent Note: Bootstrap macOS system proxies before profile startup

Status: implemented

English | [中文](2026-08-31-macos-system-proxy-bootstrap.zh.md)

## Problem

The macOS network settings can route browser and command-line traffic through a local HTTP or HTTPS proxy without exporting proxy variables to a newly launched Node process. Node's global network client does not use those system settings by itself, and it reads `NODE_USE_ENV_PROXY` only at process startup. A signed-in Codex provider could therefore fail every request with a transport error even though the same endpoint was reachable through the active macOS proxy.

## Decision

The CLI bootstraps proxy configuration only for profile execution and before loading any profile module. On macOS with a Node release that supports environment proxies and process replacement, the launcher preserves explicit `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, and `NO_PROXY` values. When no explicit proxy is present, it reads `scutil --proxy`, derives enabled HTTP and HTTPS proxy URLs plus the bypass list, and replaces the current process once with `NODE_USE_ENV_PROXY=1`. An explicit `NODE_USE_ENV_PROXY` value other than `1` opts out. Other platforms, CLI modes, unsupported Node releases, absent system proxies, and proxy-discovery failures retain their inherited behavior.

## Alternatives considered

Requiring every user to export proxy variables was rejected because GUI launches and ordinary terminal sessions can legitimately have only the macOS system proxy configured. Adding provider-local proxy agents was rejected because the problem affects the process network boundary and should not be reimplemented independently in each model adapter. Mutating `process.env` after profile loading was rejected because Node constructs environment-proxy behavior from startup state.

## Consequences

A supported macOS profile launch can transparently replace itself once before application startup. Explicit operator configuration remains authoritative, and a changed system proxy takes effect after restarting the profile. The bootstrap adds no proxy dependency, performs no discovery on other platforms, and keeps failures best-effort. Unit coverage verifies discovery, precedence, opt-out, bypass propagation, and no-op paths; a real Codex smoke test with all proxy variables removed from the parent command verifies that the restarted DSH process can complete a model request and report provider token usage.
