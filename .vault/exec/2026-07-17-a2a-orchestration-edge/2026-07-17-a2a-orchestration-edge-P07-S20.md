---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S20'
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
     The S20 and 2026-07-17-a2a-orchestration-edge-plan placeholders are machine-filled by
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
     The Move A2A discovery and health off async workers and make actor-token issuance idempotent, failure-revoked, and retention-bounded and ## Scope

- `engine/crates/vaultspec-api/src/routes/ops/a2a.rs`
- `engine/crates/vaultspec-api/src/authoring/actor_tokens.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Move A2A discovery and health off async workers and make actor-token issuance idempotent, failure-revoked, and retention-bounded

## Scope

- `engine/crates/vaultspec-api/src/routes/ops/a2a.rs`
- `engine/crates/vaultspec-api/src/authoring/actor_tokens.rs`

## Description

- Require a validated stable run id before brokered token issuance.
- Offload discovery, health, status preflight, SQLite token lifecycle, and forwarding as one blocking operation.
- Serialize starts through a fixed 64-stripe table and avoid fresh issuance when the sibling already owns the run id.
- Rotate random purpose-keyed credentials in place, reclaim expired or revoked rows, and enforce a 4,096-row hard ceiling.
- Revoke refused or confirmed-absent attempts while retaining credentials when a lost response may hide an accepted durable run.
- Split the broker tests from production code so every touched module remains below the 1,500-line gate.

## Outcome

The broker no longer blocks Tokio workers before offload and token persistence is bounded across retries and failures without making secrets deterministic or recoverable. Actor-token lifecycle tests passed 8 of 8, `cargo check -p vaultspec-api` passed, and all touched modules satisfy the size gate. The final combined broker test command is recorded in the P07 review evidence.

## Notes

Adversarial integration found that unconditional cleanup after a dropped POST response could revoke authority for a run the sibling had accepted. Confirmation now occurs under the same stripe: a found run retains credentials and recovers the idempotent response, a definitive absence cleans up, and an unavailable confirmation retains only the bounded expiring purpose rows.
