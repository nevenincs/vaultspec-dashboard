---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S161'
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
     The S161 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Run durable A2A lease reconciliation during seated boot and bounded maintenance without delaying dashboard readiness on a temporarily unavailable compatible gateway and ## Scope

- `engine/crates/vaultspec-api/src/boot.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Run durable A2A lease reconciliation during seated boot and bounded maintenance without delaying dashboard readiness on a temporarily unavailable compatible gateway

## Scope

- `engine/crates/vaultspec-api/src/boot.rs`

## Description

- Add a durable A2A lease reconciliation to the seated-boot path, running after the receipt-owned gateway reconcile.
- Revoke every run-scoped token bundle whose bounded lifetime elapsed while the dashboard was down via the lease repo's `expire_elapsed`, then prune terminal rows via `maintain`.
- Run the reconciliation on a `spawn_blocking` task so the local SQLite work never sits on the async runtime; report the count of revoked elapsed leases when non-zero.
- Keep the reconciliation gateway-independent: it touches only the local lease store, so a temporarily unavailable compatible gateway can neither delay it nor block readiness.

## Outcome

Seated boot now tears down leases whose window elapsed across a restart, closing the durable half of run-lease reconciliation, while gateway-authoritative run-status reconciliation of still-unresolved leases stays on the per-request path (S160), which degrades honestly when the sibling is down. Landed in commit `17c4b432fe`. Gate: `cargo build -p vaultspec-api` clean, touched-scope tests 31/31 pass, `cargo clippy -p vaultspec-api --lib -- -D warnings` clean, `cargo fmt --check` clean.

## Notes

The added logic is thin glue over lease-repo methods already covered by unit tests (`expire_elapsed` revoking elapsed reserved/active leases; retention `maintain` bounded pruning) and the terminal-settlement acceptance suite (`an_expired_lease_stops_resolving_and_the_sweep_revokes_it`, `reserved_leases_revoke_on_restart_while_committed_leases_survive`). A dedicated boot-harness test was not added: `serve` is a full listener entrypoint with no isolation seam, and extracting the two-call glue would be tautological over the methods it invokes. The reconciliation is deliberately best-effort on both calls (an error degrades rather than aborts the seat), matching the adjacent gateway-reconcile posture.
