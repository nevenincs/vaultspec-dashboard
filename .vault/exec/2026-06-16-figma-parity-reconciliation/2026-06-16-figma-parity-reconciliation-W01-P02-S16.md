---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S16'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace figma-parity-reconciliation with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S16 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Mirror the enriched node-evidence shape in the mock engine to match the live wire byte-for-byte and ## Scope

- `frontend/src/stores/server/mockEngine.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Mirror the enriched node-evidence shape in the mock engine to match the live wire byte-for-byte

## Scope

- `frontend/src/stores/server/mockEngine.ts`

## Description

- Mirror the enriched node-evidence shape in the mock engine to match the live wire byte-for-byte: documents already carried `{ path, doc_type }`; code_locations stay keyed on `path` and now also ride the additive `resolved_target`/`bridge_node_id` value-adds the live engine emits, plus a symbol-bearing code location exercising the GUI `symbol?` field; commits keep the `subject`.

## Outcome

The mock `/nodes/{id}/evidence` body now mirrors the live enriched wire shape byte-for-byte for every GUI-consumed field plus the engine's additive value-adds, so a consumer test drives the same body the live origin serves. The frontend lint gate (eslint, prettier, tsc, token-drift, figma-registry) is green.

## Notes

The mock evidence already matched the GUI `NodeEvidence` documents/commits shape from a prior cycle; this Step aligns the code-locations to the live engine's additive fields and adds the symbol case so the mock is a true byte-for-byte mirror, not just a GUI-shape match. The mock file lives under the testing module, not the path the plan row names; the actual file was used.
