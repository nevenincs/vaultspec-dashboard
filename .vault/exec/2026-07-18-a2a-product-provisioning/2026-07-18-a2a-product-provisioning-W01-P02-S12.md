---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S12'
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
     The S12 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Define typed install, ensure, start, stop, restart, repair, update, rollback, remove, doctor, readiness, and refusal contracts and ## Scope

- `engine/crates/vaultspec-product/src/protocol.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Define typed install, ensure, start, stop, restart, repair, update, rollback, remove, doctor, readiness, and refusal contracts

## Scope

- `engine/crates/vaultspec-product/src/protocol.rs`

## Description

- Add `protocol.rs` defining the ten typed `LifecycleOp` variants (install,
  ensure, start, stop, restart, repair, update, rollback, remove, doctor) with
  `is_read_only` and `requires_ownership` classifiers.
- Define the one shared `Readiness` model (`Uninstalled` / `InstalledStopped` /
  `GatewayReady { worker }`) where a cold worker is still service-ready, and the
  `WorkerState` enum.
- Define the closed, serde-tagged `Refusal` set so a decision is never a
  free-form string.

## Outcome

The lifecycle vocabulary is transport-free and round-trips on the wire; every
receipt-bound mutation is flagged as ownership-requiring, and a cold worker does
not collapse readiness to a degradation.

## Notes

None.
