---
description: "The market group map: immutable point-in-time market facts for MAOQ research and replay."
kind: "package-group"
---

# packages/market

English | [中文](README.zh.md)

## Summary

The market group turns acquired A-share daily, sector, breadth, emotion, and news facts into immutable point-in-time inputs. It keeps vendor fields outside downstream strategy code and rejects incomplete or temporally invalid evidence before analysis begins.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | Role | ctx key |
|---|---|---|
| [`market-snapshot`](market-snapshot/README.md) | Builds, persists, and queries canonical daily market snapshots | `ctx.marketSnapshots` |
| [`market-snapshot-json`](market-snapshot-json/README.md) | Imports audited provider-neutral drafts by exact snapshot identity | registered adapter |
| [`market-snapshot-mysql`](market-snapshot-mysql/README.md) | Acquires quality-gated daily facts from the existing MySQL pipeline | registered adapter |
| [`market-strategic-state`](market-strategic-state/README.md) | Computes replay-stable strategic features and validates evidence-bound interpretation | library |
| [`tool-maoq-snapshot`](tool-maoq-snapshot/README.md) | Exposes bounded snapshot discovery, generation, listing, and inspection | tools |

-----

<a id="related-documentation"></a>
## Related documentation

- [Market snapshot subsystem](../../docs/subsystems/market-snapshot.md) — persisted facts, identity, cutoff, and adapter rules.
- [Market strategic state subsystem](../../docs/subsystems/market-strategic-state.md) — deterministic labels, evidence references, and interpretation rules.
- [MAOQ roadmap](../../docs/maoq-roadmap.md) — P1 scope and acceptance criteria.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
