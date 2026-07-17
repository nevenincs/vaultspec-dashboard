---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-17'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# `authoring-surface` `W04.P09` summary

Wave W04 closed the two epic follow-ons: reader section links (S31, S32) and the plan-tick rollback inverse (S33). All three steps are complete, each reviewed and APPROVED. The wave verdict: both follow-ons are functionally closed — a followed wiki-link fragment scrolls to its heading, a section link is copyable and round-trippable, and a plan tick now has an honest, sibling-safe rollback inverse.

- Modified: `frontend/src/app/viewer/MarkdownDocView.tsx` (S31), `frontend/src/app/viewer/MarkdownReader.tsx` (S32), `engine/crates/vaultspec-api/src/authoring/rollback.rs` (S33), `engine/crates/vaultspec-api/src/authoring/transitions.rs` (S33), `engine/crates/vaultspec-api/src/authoring/direct_write.rs` (S33 tests), `engine/crates/vaultspec-api/src/authoring/mod.rs` (S33)
- Created: `engine/crates/vaultspec-api/src/authoring/rollback_inverses.rs` (S33)

## Description

S31 — reader scroll-to-fragment on wiki-link follow. A followed wiki-link that carries a fragment scrolls the reader to the target heading using the block-identity slugs already stamped on headings, so intra- and cross-document deep links land on the right section. Review APPROVED.

S32 — copy-section-link verb. The heading comment affordance gained a copy-section-link verb emitting a round-trippable stem-plus-anchor wiki-link through the shared copy-link descriptor family, so a section is addressable by a link that navigates back to it. Review APPROVED. Two LOW findings were fixed and two ceilings were accepted as deliberate scope boundaries.

S33 — plan-tick rollback inverse. Retired the W01.P01 rollback-unavailable gate for plan ticks: `SetPlanStepState` joined the invertible operation set, and the inverse is the OPPOSITE set-plan-step-state (check↔uncheck) against the same plan node and canonical step id — never a whole-document preimage restore. That makes the old clobber structurally UNREACHABLE (a preimage restore would rewrite the whole plan body and revert every other step ticked since; the state-flip touches only the target step). Proven both by generation tests (the produced inverse is a set-plan-step-state opposite, never a body write) and a real-core test that ticks two steps, applies the inverse of one, and shows the sibling tick surviving. The inverse machinery was extracted into a new bounded `rollback_inverses` module to keep the grandfathered `rollback.rs` and `direct_write.rs` at or under their module-size baselines (move-only, no behavior change). Review APPROVED. One LOW was accepted as deliberate conservatism — the plan-tick inverse is preimage-independent for correctness but the eligibility gate still requires a present source preimage (fail-closed, consistent with every kind) — with a coupling comment added at the `generate_rollback` source-preimage unwrap noting that any future exemption must also make that unwrap conditional.

## Verification

- S31/S32: frontend lint gate green; reader render and affordance behavior reviewed and approved.
- S33: module-size ratchet clean (`scan-module-size.mjs` exit 0, no baseline changed); `just dev lint` Rust gate — `cargo fmt --check` clean, `clippy --all-targets` exit 0; the plan-tick rollback tests pass against the real core (3 generation, 1 transitions eligibility guard, 3 direct-write plan-tick including the consolidated round-trip/sibling-safe/idempotent test); full rollback suite (17) passes with no regression.
- Every review finding across the phase is resolved or explicitly accepted before closeout.
