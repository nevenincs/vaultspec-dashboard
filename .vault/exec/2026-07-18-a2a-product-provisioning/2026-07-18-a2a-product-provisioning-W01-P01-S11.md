---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S11'
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
     The S11 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Verify manifest rejection, atomic receipt activation, dashboard-only capability creation, gateway read-only access, credential separation, permission restriction, and cross-process lock exclusion with real files, processes, and locks and ## Scope

- `engine/crates/vaultspec-product/tests/product_authority.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Verify manifest rejection, atomic receipt activation, dashboard-only capability creation, gateway read-only access, credential separation, permission restriction, and cross-process lock exclusion with real files, processes, and locks

## Scope

- `engine/crates/vaultspec-product/tests/product_authority.rs`

## Description

- Add the `product_authority` integration test exercising the production API
  against real files, credential material, an on-disk receipt, and a real second
  process.
- Prove manifest rejection: unpinned identity, target mismatch, digest drift, and
  floating `latest` each fail closed, while a capsule and release set built from
  the committed lock's pins verify.
- Prove atomic receipt activation leaves an active receipt with no interruption
  marker, dashboard-only capability creation with bootstrap retention, gateway
  read-only attach-control access plus separate worker-IPC minting, three
  distinct credential files, and owner-restricted permissions (`0600` under
  Unix).
- Prove cross-process install-lock exclusion by re-invoking the test binary as a
  separate process that holds the real lock, observing the parent read the lock
  as busy with the child's advisory owner identity, then confirming the freed
  lock is acquirable after the child releases.

## Outcome

All eleven acceptance cases pass with no fakes, mocks, stubs, or skips; the
cross-process case spawns and reaps a genuine second OS process holding the real
lock.

## Notes

Fixtures are derived from the committed component lock parsed by the production
parser, never copied from a run's output, so a drift between the test pins and
the real lock fails the build rather than passing silently.
