---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S40'
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
     The S40 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Preserve public POST /ops/a2a/run-start as one of five control verbs in the fixed six-member dashboard whitelist while performing downstream POST /v1/runs prepare and commit variants, minting only bounded prepare-returned roles, and cancelling the reservation plus revoking on failure and ## Scope

- `engine/crates/vaultspec-api/src/routes/ops/a2a.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Preserve public POST /ops/a2a/run-start as one of five control verbs in the fixed six-member dashboard whitelist while performing downstream POST /v1/runs prepare and commit variants, minting only bounded prepare-returned roles, and cancelling the reservation plus revoking on failure

## Scope

- `engine/crates/vaultspec-api/src/routes/ops/a2a.rs`

## Description

- Keep public `POST /ops/a2a/run-start` as one of the five control verbs in the fixed six-member dashboard whitelist while it drives the downstream two-phase `POST /v1/runs`.
- Build the prepare-stage body from engine-owned fields (stripping message, actor tokens, and reservation id), then validate the sibling's prepared envelope in full (api version, stage, worker state, provider eligibility, run admission).
- Extract and bound the prepare-returned reservation id, gateway lease id, and required-role set (non-empty, capped, unique, agent-id charset) before minting.
- On any failure, cancel the sibling reservation with a bounded retry and revoke the local bundle so neither side is left holding a half-started run.
- Redact the discovery record's `service_token` in `Debug` so an `A2aServiceInfo` can never print a secret.

## Outcome

Run-start remains a single whitelisted control verb over a strictly-validated two-phase prepare/commit that mints only the bounded prepare-returned roles and unwinds cleanly (reservation release + bundle revoke) on failure. Verified against the committed implementation; the discovery-token Debug redaction landed in commit `6cb2d28726`. Gate: `cargo build -p vaultspec-api` clean, touched-scope tests pass (including `build_run_start_validates_and_omits_actor_tokens`, `refusals_revoke_but_ambiguous_transport_failures_retain_and_retry_tokens`, and the route-inventory contract), clippy `--lib -D warnings` clean, fmt clean.

## Notes

The two-phase run-start core was implemented in earlier committed work; this record closes the step after verifying whitelist preservation, envelope validation, role bounding, and the release/revoke failure paths, and after adding the discovery-token Debug redaction. The redacted field is `serde(skip)` — never populated from the secret-free discovery record — so the change is defensive hardening rather than a fix for a live leak.
