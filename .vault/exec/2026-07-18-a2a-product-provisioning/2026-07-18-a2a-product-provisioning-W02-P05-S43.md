---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S43'
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
     The S43 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Prove two concurrent runs for one role revoke independently and no raw token enters records, output, logs, receipts, or discovery and ## Scope

- `engine/crates/vaultspec-api/src/authoring/actor_tokens.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Prove two concurrent runs for one role revoke independently and no raw token enters records, output, logs, receipts, or discovery

## Scope

- `engine/crates/vaultspec-api/src/authoring/actor_tokens.rs`

## Description

- Confirm the committed acceptance test proves two concurrent runs for one role actor mint distinct random secrets, that revoking exactly one bundle's hash leaves the concurrent same-role run resolving, and that no raw secret reaches records, Debug output, or persistence.
- Apply clippy hygiene to that test (slice-from-ref over a cloned single-element array).

## Outcome

S43's acceptance is proven by the committed `concurrent_same_role_runs_revoke_independently_and_never_persist_a_raw_secret` test: distinct-purpose same-role issuance yields distinct random secrets, `revoke_hashes` of one bundle leaves the other resolving, Debug redacts the raw token, and an on-disk row dump finds only the token hash. Verified green earlier this session.

## Notes

The acceptance test already existed in the tree from a prior session's work. A near-identical duplicate was mistakenly added on top of it and then removed (commits `6535704db7` add, `791e1a5dd7` remove); the only lasting delta from that round trip is clippy `std::slice::from_ref` hygiene on the canonical test. A full-crate re-run at close time was blocked by an unrelated live `vaultspec-product` module-split refactor; the S43 test itself was confirmed passing before that churn.
