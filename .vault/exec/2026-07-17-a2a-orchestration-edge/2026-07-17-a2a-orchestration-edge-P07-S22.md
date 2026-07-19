---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S22'
related:
  - "[[2026-07-17-a2a-orchestration-edge-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace a2a-orchestration-edge with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S22 and 2026-07-17-a2a-orchestration-edge-plan placeholders are machine-filled by
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
     The Reconcile six-member edge vocabulary and record the implemented hardening in the current reference and audit trail and ## Scope

- `engine/crates/vaultspec-api/src/lib.rs`
- `.vault/reference/`
- `.vault/audit/` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Reconcile six-member edge vocabulary and record the implemented hardening in the current reference and audit trail

## Scope

- `engine/crates/vaultspec-api/src/lib.rs`
- `.vault/reference/`
- `.vault/audit/`

## Description

- Define the current gateway contract as five control verbs plus bounded active-run discovery, with the per-run SSE route separate.
- Record stable run-id retry, gateway authentication, indexed discovery, byte budgets, single polling ownership, and authoritative reconciliation in the current reference.
- Correct live engine comments, prospective product-plan wording, sibling package and CLI descriptions, and live acceptance descriptions.
- Remove execution-step provenance from source comments while preserving the invariant it described.
- Preserve completed historical execution narratives and unrelated product-provisioning architecture.

## Outcome

Current normative and live descriptive surfaces now use one six-member whitelist vocabulary and state the implemented authority and resource boundaries. Final audit dispositions and document checks are recorded by S23 after adversarial review.

## Notes

The reference previously contained a correct active-run addendum alongside an older exact-five workstream and obsolete metadata-scan bounds. The reconciliation replaces only current normative drift; completed historical artifacts remain untouched.
