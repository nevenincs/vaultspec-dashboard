---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S17'
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
     The S17 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Mirror the historical text-diff route shape in the mock engine to match the live wire byte-for-byte and ## Scope

- `frontend/src/stores/server/mockEngine.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Mirror the historical text-diff route shape in the mock engine to match the live wire byte-for-byte

## Scope

- `frontend/src/stores/server/mockEngine.ts`

## Description

- Add the `histdiff` verb to the mock `/ops/git/{verb}` whitelist, mirroring the live two-rev historical diff byte-for-byte: it requires `path` plus BOTH `from` and `to` revs (either rev missing is a 400 before any work, exactly as the live route validates), and returns a verbatim two-rev unified diff with the tiers block.
- Extend the wire client `opsGit` to accept the `histdiff` verb and the `from`/`to` rev fields so a consumer drives the historical diff through the same client path as the working-tree diff.

## Outcome

The mock historical text-diff route mirrors the live wire byte-for-byte (verb echo, verbatim two-rev unified diff, tiers block, and the same rev-and-path validation 400s). The wire client supports the new verb. The frontend lint gate (eslint, prettier, tsc, token-drift, figma-registry) is green.

## Notes

The `opsGit` client extension is the wire-client seam (the stores layer's sole network surface), not a view-store data shape change, so the preserved-contract boundary holds. The mock file lives under the testing module, not the path the plan row names.
