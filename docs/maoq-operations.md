# MAOQ Operations Runbook

English | [中文](maoq-operations.zh.md)

## Purpose

This runbook owns the P0 and P1 operating checks for launching MAOQ, choosing a model route, proving one bounded decision, reading token usage, freezing a market snapshot, and recovering from common failures. MAOQ remains a foreground research and paper-trading application; it has no live-order authority.

## Start, verify, and stop

From the repository root, build after a fresh checkout or source change that affects browser artifacts, then launch the delivered profile:

```sh
pnpm run build
pnpm dsh --profile maoq
```

Keep that terminal open. Stopping the process or closing its terminal stops the local server; an already-open browser then reports `Failed to fetch` until the profile is launched again. Stop cleanly with one `Ctrl+C`.

The launch output prints the authenticated browser URL. A direct unauthenticated health probe should reach the server and normally return HTTP 401:

```sh
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3080/
lsof -nP -iTCP:3080 -sTCP:LISTEN
```

Connection refusal and no listener mean the MAOQ process is not running. HTTP 401 means the server is running and protecting the browser session; it is not a model-authentication failure.

## Choose a model route

For the local Codex route, first confirm the shared ChatGPT login:

```sh
codex login status
```

Launch MAOQ, open **Settings → Models → Commander model**, choose **Local Codex login**, and select the exact model. The shipped council uses `gpt-5.6-luna` at low reasoning over an HTTPS Responses route; it still reuses the same Codex login. A configured Codex route suppresses the DeepSeek API-key onboarding at startup and after refresh.

For an external API route, keep the existing provider profile and credential flow: configure the provider on the Models page, store its API key through the credential field, then select that provider and model for the commander. Never put a key in a patch file, prompt, log, or committed fixture.

A saved model selection applies to newly created tasks. An existing task retains the provider and model recorded when it was created, so create a new task after switching routes.

## Choose the task mode

Before the first message of a market task, select **MAOQ Market mode** in the preset switch. Presets are immutable after a task starts, so changing the default does not convert an existing Standard-mode task. In MAOQ Market mode, a snapshot request should show a dedicated snapshot card and must not call `todo_write`, `glob`, `grep`, `bash`, or file-editing tools. Use **Standard mode** only when working on the harness repository itself.

## P0 canary

Create a new task on the intended commander route and ask it to call `maoq_decide` with only `market_regime` and `sector_battlefield`, synthesize one paper decision, and require the independent reviewer to veto the decision when the evidence cutoff is missing. The result passes when only those two specialists run, synthesis is structured, the veto produces `vetoed`, no live action is proposed, and token usage is reported per child plus a total. Missing provider usage must appear in `unavailableCalls`; it must never be estimated.

Run the canary once with Local Codex login. When an external provider credential is available, repeat it in a new task on that route. CI validates the same external-adapter lifecycle against a local protocol peer so the release gate needs no secret; the live external canary validates the operator's account, endpoint, quota, and chosen model.

## Failure recovery

| Symptom | Meaning | Recovery |
|---|---|---|
| `llm/listProviders failed: Failed to fetch` | Browser cannot reach the local MAOQ server | Check the 3080 listener, relaunch the profile, then reload the authenticated browser URL |
| Codex login is missing | The local OAuth record is unavailable | Run `codex login`, confirm `codex login status`, then create a new MAOQ task |
| `UNKNOWN_MODEL` or invalid-model diagnostic | The selected route does not offer that model | Select a model advertised for that provider and create a new task |
| `TRANSPORT`, timeout, or repeated retry exhaustion | The provider endpoint is unreachable or stalled | Confirm local connectivity and proxy state, restart the profile after a system-proxy change, then retry a new task |
| Missing external credential | The selected API route names an unset credential reference | Store the key on the Models page; do not replace or remove the Codex route |
| Malformed specialist or synthesis output | A structured child failed its schema | Treat the run as failed; do not use its partial narrative as a decision |
| Risk result is `vetoed` | The independent reviewer stopped this paper decision | Preserve the veto and its reasons; start no action from that run |

## P0 acceptance evidence

| P0 property | Automated evidence | Operator evidence |
|---|---|---|
| Delivered `maoq` Profile resolves through the source CLI | [`source-launch.compat.spec.ts`](../apps/cli/tests/source-launch.compat.spec.ts) | Launch command and HTTP/listener checks above |
| Local Codex auth is opt-in and isolated to `openai-codex` | [`auth.spec.ts`](../packages/llm/llm-pi-ai/tests/auth.spec.ts) | `codex login status` plus one Local Codex canary |
| External API routing remains available | [`adapter.spec.ts`](../packages/llm/llm-pi-ai/tests/adapter.spec.ts) and [`dynamic-config.spec.ts`](../packages/llm/llm-pi-ai/tests/dynamic-config.spec.ts) | One canary when an operator credential is available |
| Codex configuration suppresses API-key onboarding at startup and refresh | [`onboarding-dialog.client.spec.tsx`](../packages/client/ui-settings-models/tests/onboarding-dialog.client.spec.tsx) | Reload the empty MAOQ home and confirm no DeepSeek-key modal appears |
| MAOQ Market mode is selectable and excludes coding detours | [`web-agent-presets.e2e.ts`](../apps/cli/tests/web-agent-presets.e2e.ts) and [`shipped-root.spec.ts`](../packages/preset/agent-presets/tests/shipped-root.spec.ts) | Start a new MAOQ-mode task and confirm a snapshot question does not create todos or search files |
| MAOQ tools display business-language rows | [`tool-rows.client.spec.tsx`](../packages/client/ui-maoq-tools/tests/tool-rows.client.spec.tsx) | Confirm the transcript says “Browse snapshot catalog” or the active locale equivalent |
| Commander selects only the requested specialists | [`loader-composition.spec.ts`](../packages/workflow/tool-maoq-decision/tests/loader-composition.spec.ts) | Inspect the canary's specialist list |
| Structured synthesis and final risk veto are host-enforced | [`tool-maoq-decision.spec.ts`](../packages/workflow/tool-maoq-decision/tests/tool-maoq-decision.spec.ts) | Confirm a forced unsafe proposal ends as `vetoed` |
| Missing login, invalid model, transport failure, malformed output, cancellation, and veto fail explicitly | Adapter, Codex subagent, and MAOQ decision tests linked above | Use the recovery table; never reinterpret an error as approval |
| Provider token usage is reported without estimates | [`tool-maoq-decision.spec.ts`](../packages/workflow/tool-maoq-decision/tests/tool-maoq-decision.spec.ts) | Inspect per-call totals and `unavailableCalls` in the canary |

P0 is complete when the automated evidence is green and the Local Codex canary passes on the operator machine. A live external canary is required before relying on that external account, but the absence of an external credential does not block Local Codex operation or the keyless release gate.

## P1 canary

The profile mounts the production daily adapter lazily because database endpoints and credentials are deployment facts. Use a SELECT-only account and configure `MAOQ_MYSQL_HOST`, `MAOQ_MYSQL_PORT`, `MAOQ_MYSQL_SOCKET`, `MAOQ_MYSQL_USER`, `MAOQ_MYSQL_DATABASE`, and the password credential key `MAOQ_MYSQL_PASSWORD_CREDENTIAL` as needed. Then ask the commander to “generate the latest 10 immutable daily snapshots through 2026-08-28 with cutoff 2026-08-31T16:00:00+08:00.” It may use `maoq_snapshot_sources`, `maoq_snapshot_generate`, `maoq_snapshot_list`, and `maoq_snapshot_inspect`; generation returns exact `currentHash` and `historyHashes` for strategic analysis. Do not replace any version token with a friendly date.

Policy and news acquisition is a separate pre-cutoff step. Run `ctx.marketNews.acquire()` with versioned queries early enough that it finishes before `cutoffTime`; add its content hash through `discoverIdentity`. A search first executed after the cutoff is ineligible even if the article was published earlier. Replays call `get(hash)` and perform no search.

The 2026-08-31 local acceptance used trading date 2026-08-28 and cutoff `2026-08-31T16:00:00+08:00`. Two full adapter builds and one persisted replay produced the same hash, `1369f75b3759ecedf4db41e22e812640787bfec16b555fb3966e3df56ea17c7c`, over 5,208 stocks, 31 SW L1 sectors, and 6 major indices. The same source correctly rejected the earlier 2026-08-28 cutoff because the index rows had been refreshed on 2026-08-31, and rejected the incomplete 2026-05-11 quality row. This proves the cutoff is enforced rather than inferred from the trading date.

### P1 acceptance evidence

| P1 property | Automated evidence | Real-data evidence |
|---|---|---|
| Canonical immutable build, exact identity, conflicts, and frozen replay | [`market-snapshot.spec.ts`](../packages/market/market-snapshot/tests/market-snapshot.spec.ts) | Repeated build and persisted read returned the hash above |
| Quality-gated daily, reference, sector, breadth, and emotion facts | [`market-snapshot-mysql.spec.ts`](../packages/market/market-snapshot-mysql/tests/market-snapshot-mysql.spec.ts) | 5,208 stocks, 31 sectors, 6 indices; joined count equaled the quality row |
| Model-triggered bounded acquisition and exact hash recovery | [`loader-composition.spec.ts`](../packages/market/tool-maoq-snapshot/tests/loader-composition.spec.ts) | Ask for a bounded window, then inspect the returned current hash |
| Cutoff-safe web evidence and offline replay | [`market-news-web.spec.ts`](../packages/market/market-news-web/tests/market-news-web.spec.ts) | The shipped profile mounts the immutable store at `.maoq/news`; a provider canary is required before relying on that provider's timestamps |
| No look-ahead or silent quality fallback | MySQL and news tests linked above | Refreshed post-cutoff index evidence and the incomplete session were both rejected |
| Provider-neutral audited import | [`market-snapshot-json.spec.ts`](../packages/market/market-snapshot-json/tests/market-snapshot-json.spec.ts) | Exact identity-addressed imports remain available without database credentials |

P1 is complete when these tests, documentation gates, host build, real daily double-build, early-cutoff rejection, and unusable-quality rejection pass. A particular web provider must still pass a live pre-cutoff canary before its evidence is used in research; provider availability does not weaken or bypass the immutable batch contract.
