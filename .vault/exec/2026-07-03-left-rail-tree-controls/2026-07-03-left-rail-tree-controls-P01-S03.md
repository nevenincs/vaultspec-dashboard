---
tags:
  - '#exec'
  - '#left-rail-tree-controls'
date: '2026-07-04'
modified: '2026-07-04'
step_id: 'S03'
related:
  - "[[2026-07-03-left-rail-tree-controls-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace left-rail-tree-controls with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S03 and 2026-07-03-left-rail-tree-controls-plan placeholders are machine-filled by
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
     The Adapt the new `size` field tolerantly (+ `VaultTreeEntry` in `engine.ts`): validate non-negative integers, drop malformed, absent stays absent and ## Scope

- `frontend/src/stores/server/liveAdapters.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Adapt the new `size` field tolerantly (+ `VaultTreeEntry` in `engine.ts`): validate non-negative integers, drop malformed, absent stays absent

## Scope

- `frontend/src/stores/server/liveAdapters.ts`

## Description

- Add `normalizeVaultTreeSize` to `frontend/src/stores/server/liveAdapters.ts`: finite non-negative integers only, malformed dropped whole
- Extend `VaultTreeEntry` with optional `size` in `engine.ts`
- Extend the adapter fixture test with a valid and a malformed size vector

## Outcome

`liveAdapters.test.ts` 93/93 green.

## Notes

None.
