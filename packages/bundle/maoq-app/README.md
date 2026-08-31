---
description: "The MAOQ browser profile layer for bounded commander decisions and independent risk veto."
kind: "package-bundle"
---

# `@deepseek-ai/dsh-maoq-app`

English | [中文](README.zh.md)

## Summary

The MAOQ application layer composes over `dsh-base` and `dsh-web-app`. It supplies the commander persona and mounts [`dsh-tool-maoq-decision`](../../workflow/tool-maoq-decision/README.md), the immutable [`dsh-market-snapshot`](../../market/market-snapshot/README.md) fact store, the bounded [`dsh-tool-maoq-snapshot`](../../market/tool-maoq-snapshot/README.md) acquisition tools, and the pre-cutoff [`dsh-market-news-web`](../../market/market-news-web/README.md) evidence freezer. The shipped `maoq` profile therefore retains the ordinary browser, data, web-search, and subagent capabilities while adding one bounded decision council. It grants no live-trading authority.

## Table of Contents

- [Use this package](#use-this-package)
- [Operate and recover](#operate-and-recover)
- [Choose the commander model](#choose-commander-model)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Launch with `dsh --profile maoq`. The shipped template composes `dsh-base`, `dsh-web-app`, then this policy layer, and keeps profile patches live-reloadable. The market snapshot service stores immutable artifacts under `.maoq/snapshots`, reads audited provider-neutral imports from `.maoq/imports`, and freezes pre-cutoff web evidence under `.maoq/news`, all relative to the launch directory. On a supported macOS and Node combination, profile launch automatically inherits enabled system HTTP and HTTPS proxies when no explicit proxy environment is present. The decision council reuses the local Codex/ChatGPT login through Codex app-server, pins `gpt-5.6-sol`, permits at most four selected specialists, and limits rendered results to 32768 characters. Token usage is reported per specialist, commander synthesis, and independent risk review, then aggregated across input, cache, output, reasoning, and total tokens. Calls without provider usage are counted in `unavailableCalls` rather than estimated.

The profile also mounts the lazy `long-short-stock-mysql` adapter. Configure `MAOQ_MYSQL_HOST`, `MAOQ_MYSQL_PORT`, `MAOQ_MYSQL_SOCKET`, `MAOQ_MYSQL_USER`, and `MAOQ_MYSQL_DATABASE` when their defaults do not match the existing daily-data database. Set `MAOQ_MYSQL_PASSWORD_CREDENTIAL` to the credential-store key that holds the password; the password itself never enters the patch or tool arguments. The commander may generate at most ten sessions per foreground call.

<a id="operate-and-recover"></a>
## Operate and recover

The [MAOQ operations runbook](../../../docs/maoq-operations.md) covers foreground process lifetime, server health checks, Local Codex and external API canaries, token inspection, the P0 evidence matrix, and recovery from provider-directory, authentication, model, transport, structured-output, and veto failures.

<a id="choose-commander-model"></a>
## Choose the commander model

Open **Settings → Models → Commander model** to switch the outer commander between **Local Codex login** and **External API**, then select or enter the exact model. The local path reuses the current Codex/ChatGPT sign-in and needs no second API key; it is opt-in and reads only the `openai-codex` credential. The external path retains the existing DeepSeek and other API-key providers unchanged. A saved change applies to newly created tasks; an existing task keeps its selected model. This switch affects the outer commander only: the bounded decision council continues to use its pinned Codex app-server model and continues reporting its own token usage.

<a id="model-experience"></a>
## Model Experience

### Commander persona

#### What the model sees

The model is instructed to seek truth from current evidence, identify the principal contradiction, choose the least-resistance battlefield, call the smallest sufficient specialist council, expose counter-evidence and invalidation conditions, accept the independent risk veto, and remain within research or paper-trading scope.

##### MAOQ commander persona

```markdown
You are the MAOQ commander. Seek truth from current evidence, identify the principal contradiction, and concentrate analysis on the market direction with the least resistance. Choose the smallest sufficient specialist council for each decision; do not invoke every specialist by habit. Distinguish strategic posture from tactical opportunity, expose counter-evidence and invalidation conditions, and prefer no trade when the evidence is inadequate. The independent risk reviewer has final veto power. You may produce research and paper-trading decisions only. Never place live orders, weaken risk limits, move the market-data cutoff, or modify production strategy code.
```

#### Token effect

One stable persona plus the decision tool guidance and schema.

#### KV Cache effect

Stable while the profile, plugin roster, and live patch text are unchanged. A profile patch change invalidates the affected prefix.

## Known Limitations and Deferred Work

- **Daily database is deployment-configured** — the adapter is lazy, but generation fails until the configured MySQL endpoint and password credential are available.
- **No portfolio executor** — decisions stop at research and paper-trading output.
- **One generic risk reviewer** — numeric exposure, liquidity, and drawdown engines remain future independent services.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

P1 establishes immutable market facts before P2 adds strategic interpretation or tactical breadth.

</details>
