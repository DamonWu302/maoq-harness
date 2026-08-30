---
description: "The MAOQ browser profile layer for bounded commander decisions and independent risk veto."
kind: "package-bundle"
---

# `@deepseek-ai/dsh-maoq-app`

English | [中文](README.zh.md)

## Summary

The MAOQ application layer composes over `dsh-base` and `dsh-web-app`. It supplies the commander persona and mounts [`dsh-tool-maoq-decision`](../../workflow/tool-maoq-decision/README.md). The shipped `maoq` profile therefore retains the ordinary browser, data, web-search, and subagent capabilities while adding one bounded decision council. It grants no live-trading authority.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Launch with `dsh --profile maoq`. The shipped template composes `dsh-base`, `dsh-web-app`, then this policy layer, and keeps profile patches live-reloadable. The decision tool uses the `spawn` provider, permits at most four selected specialists, and limits rendered results to 32768 characters.

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

- **Not a data product** — this layer does not yet define market-data connectors, daily snapshot semantics, or news-source ranking.
- **No portfolio executor** — decisions stop at research and paper-trading output.
- **One generic risk reviewer** — numeric exposure, liquidity, and drawdown engines remain future independent services.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The next profile layer should define one immutable market snapshot before adding tactical breadth.

</details>
