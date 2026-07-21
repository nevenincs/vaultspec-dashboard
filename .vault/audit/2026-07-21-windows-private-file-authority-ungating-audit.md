---
tags:
  - '#audit'
  - '#windows-private-file-authority'
date: '2026-07-21'
modified: '2026-07-21'
related:
  - '[[2026-07-20-windows-private-file-authority-adr]]'
  - '[[2026-07-20-a2a-provisioning-authority-adr]]'
  - '[[2026-07-21-windows-private-file-authority-audit]]'
---

# `windows-private-file-authority` audit: `approved D6 un-gating review`

## Scope

Independent review and re-check of the D6 un-gating slice: commits `44e96af13d`
(implementation), `6930cc67de` and `624aa7b012` (test flips), `af0457f0d6`
(style), `ea826cddbb` (revisions), and ADR addendum `48178c63c2`, evaluated
against the a2a-provisioning-authority D5-D8 boundary and the amended
windows-private-file ADR.

## Findings

### windows-recovery-untested | high | initial review found no Windows mirror of the recovery tests

Initial verdict was REQUIRED REVISIONS with three findings. The
highest-severity one: the Windows credential-bootstrap recovery path was
untested — no Windows mirror of the recovery tests existed, and every Windows
test bootstrapped only once on a fresh product, never exercising recovery
from an interrupted or pre-existing state.

### credentials-directory-narrowing-unrecorded | medium | design deviation from the retained-handle constraint had no ADR record

`RetainedCredentialDirectory`'s copied-observation design deviates from the
decision's retained-handle constraint (a copied identity or ACL list cannot
replace a retained handle), and at initial review that deviation carried no
ADR record explaining or bounding it.

### locking-comment-inaccurate | low | false race-safety claim in locking.rs

`locking.rs` carried a comment claiming "race-safe relative child traversal"
that did not match the code's actual behavior, which operates on absolute
paths.

### revisions-landed | low | all three findings resolved

Both recovery tests were un-`cfg`'d from Windows-only stubs into single
cross-platform bodies and live-proven on real NTFS: one drives
`open_descriptor` → `recover()` → `open_recovery_in` → `PrivateFileRecovery`,
the other proves idempotent directory re-hardening. The inaccurate comment
was corrected to state the absolute-path reality. The ADR addendum (commit
`48178c63c2`) now records the bounded credentials-DIRECTORY narrowing (files
unaffected), the `WRITE_DAC` sharing-collision reason for it, the
cooperative-same-user threat-model soundness argument, and plan step
`W01.P01.S177` as the vehicle for any future strengthening.

### final-verdict-approved | low | independent re-run reproduced all claimed evidence

**FINAL VERDICT: APPROVED.** The reviewer independently re-ran the targeted
recovery tests (2/2), the full `vaultspec-product` suite (252/252), and
`just dev lint rust` (exit 0). The reviewer's own TOCTOU analysis: per-op
re-observation is fail-closed-after-the-fact, not preventive, but sound under
the decision's cooperative-same-user threat model because every credential
file keeps its own independent retained-handle hardening regardless of
directory-level state.

### runtime-bugs-found-and-fixed | low | two bugs surfaced and fixed during implementation

An unprotected pre-created credentials directory was fixed by making
protected-DACL establishment idempotent. A held-handle `WRITE_DAC` sharing
violation was fixed by removing the long-lived directory handle in favor of
the per-operation observation design that the ADR addendum now records.

### scope-boundaries-held | low | adjacent gates and follow-ons confirmed untouched or tracked

Layer C's retirement parent-durability refusal survives typed and
rollback-scoped, tracked as plan step `W01.P01.S177` rather than resolved
inline. `handoff.rs`'s D4 gate is untouched by design. The aggregate
`just dev lint all` run is blocked only by a pre-existing `README.md:144`
MD028 violation owned by the release workstream, unrelated to this slice.

## Recommendations

- No further action required for this slice; the final verdict is APPROVED
  and the ADR addendum closes the only recorded design gap.
- Track the Windows parent-directory durability question through plan step
  `W01.P01.S177`, not as an inline widening of this decision.
- The pre-existing `README.md:144` MD028 lint failure is out of scope here;
  route it to the release workstream that owns `README.md`.
