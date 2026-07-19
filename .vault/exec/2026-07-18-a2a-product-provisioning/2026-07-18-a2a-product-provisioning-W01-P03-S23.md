---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S23'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace a2a-product-provisioning with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S23 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Mount and inventory the bearer-gated lifecycle routes separately from the fixed ops A2A namespace and ## Scope

- `engine/crates/vaultspec-api/src/lib.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Mount and inventory the bearer-gated lifecycle routes separately from the fixed ops A2A namespace

## Scope

- `engine/crates/vaultspec-api/src/lib.rs`

## Description

- Mount the three bearer-gated lifecycle routes (`/a2a/lifecycle/status`,
  `/a2a/lifecycle/run`, `/a2a/lifecycle/jobs/{id}`) in the router, in a block
  deliberately SEPARATE from the fixed `/ops/a2a` orchestration namespace.
- Add the three routes to the `CONTRACT_ROUTES` inventory.

## Outcome

The lifecycle routes are served and inventoried, gated by the same bearer
middleware as every data route; the fixed five-verb `/ops/a2a` surface is
unchanged. The contract-route bearer guard passes (every inventory prefix is a
gated API prefix).

## Notes

None.
