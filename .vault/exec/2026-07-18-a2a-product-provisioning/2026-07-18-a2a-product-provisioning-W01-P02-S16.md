---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S16'
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
     The S16 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Implement receipt-gated lifecycle transitions while preserving cold installed state, foreign attach, mutable data, and complete release-set authority and ## Scope

- `engine/crates/vaultspec-product/src/lifecycle.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Implement receipt-gated lifecycle transitions while preserving cold installed state, foreign attach, mutable data, and complete release-set authority

## Scope

- `engine/crates/vaultspec-product/src/lifecycle.rs`

## Description

- Add `lifecycle.rs` with `LifecycleController` binding the receipt, credential,
  discovery, process, and protocol contracts into one authority.
- Gate receipt-bound mutations on the active receipt AND an ownership capability
  that verifies against the stored one; refuse a foreign-adopted install (no
  retained ownership) and treat the attach credential as insufficient.
- Implement the pure, total `plan_transition` state machine preserving cold
  installed state and refusing every non-install op on an uninstalled product,
  plus `resolve_attach` that never mutates a foreign resident.
- Fold in the P01 review items: route capsule loading through
  `CapsuleManifest::parse_and_verify` (`load_verified_capsule`) and sweep
  orphaned receipt temp files at `initialize`.

## Outcome

Uninstalled refuses every mutation but install; a receipt-bound stop is refused
without the ownership capability and with the attach credential, and allowed
with the correct one; the transition planner preserves cold state; a
foreign-adopted install cannot be mutated.

## Notes

None.
