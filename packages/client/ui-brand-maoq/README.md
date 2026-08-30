---
description: "Independent MAOQ brand occupants for the browser sidebar and conversation hero."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-maoq

English | [中文](README.zh.md)

## Summary

This package fills the browser's sidebar mark, sidebar name, and conversation hero mark with the independent MAOQ identity. Its geometric mark joins two opposing forces into an `M`, centers their contradiction point, and extends one route upward. It uses no DeepSeek artwork, portrait, red star, or established political emblem. The package contributes nothing to model requests.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the plugin after the generic sidebar and conversation slot declarations. The three occupants register atomically and withdraw together during HMR. The mark inherits the surrounding text color, while the standalone favicon supplies its own light/dark palette.

<a id="understand-the-implementation"></a>
## Understand the implementation

[`src/client/Brand.tsx`](src/client/Brand.tsx) owns the code-native SVG geometry and wordmark. [`src/client/index.ts`](src/client/index.ts) performs declaration-aware slot registration. No bitmap or copied upstream logo asset is involved.

<a id="model-experience"></a>
## Model Experience

None, as this package is browser presentation only and never enters a provider request.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- **One fixed identity** — alternate marks or themes belong in another slot-occupant package.
- **No design-token palette** — the inline mark inherits `currentColor`; favicon colors are separate shell assets.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
