---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-07-12'
step_id: 'S16'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

# Mirror the enriched node-evidence shape in the mock engine to match the live wire byte-for-byte

## Scope

- `frontend/src/stores/server/mockEngine.ts`

## Description

- Mirror the enriched node-evidence shape in the mock engine to match the live wire byte-for-byte: documents already carried `{ path, doc_type }`; code_locations stay keyed on `path` and now also ride the additive `resolved_target`/`bridge_node_id` value-adds the live engine emits, plus a symbol-bearing code location exercising the GUI `symbol?` field; commits keep the `subject`.

## Outcome

The mock `/nodes/{id}/evidence` body now mirrors the live enriched wire shape byte-for-byte for every GUI-consumed field plus the engine's additive value-adds, so a consumer test drives the same body the live origin serves. The frontend lint gate (eslint, prettier, tsc, token-drift, figma-registry) is green.

## Notes

The mock evidence already matched the GUI `NodeEvidence` documents/commits shape from a prior cycle; this Step aligns the code-locations to the live engine's additive fields and adds the symbol case so the mock is a true byte-for-byte mirror, not just a GUI-shape match. The mock file lives under the testing module, not the path the plan row names; the actual file was used.
