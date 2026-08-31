---
description: "Business-language browser rows for MAOQ snapshot and decision tools."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-maoq-tools

English | [中文](README.zh.md)

## Summary

This browser-only plugin replaces the generic fallback rows for the six MAOQ snapshot and decision tools with explicit business-language titles, compact argument summaries, and expandable structured results. It does not change tool execution or model requests.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount it after `dsh-client-ui-tool`. The MAOQ profile does this automatically. Its keyed rows cover snapshot sources, generation, catalog listing, exact-hash inspection, strategic analysis, and the independent-risk decision council.

## Model Experience

### Browser tool presentation

#### What the model sees

Nothing. The package consumes persisted `tool/call` and `tool/result` slices in the browser and contributes no prompt or tool schema.

#### Token effect

No token change; rendering happens after the model response is persisted.

#### KV Cache effect

No cache change; the package never participates in prompt assembly.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Structured results are displayed as bounded preformatted text; richer market charts belong in later domain cards.

<a id="dev-note"></a>
### Dev Note

The keyed rows must remain replayable from the durable call/result slice and must not query live market state.
