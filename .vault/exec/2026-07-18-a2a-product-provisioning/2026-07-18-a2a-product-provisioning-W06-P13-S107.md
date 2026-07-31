---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-30'
modified: '2026-07-30'
body_schema: 'body-v1'
body_hash: 'sha256:cc2db133c6fc2c3ac429eb83cc6e988fc7c126f1e0159e48a3bd892c118578fa'
step_id: 'S107'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Create a production-artifact certifier that opens published archives, validates complete receipts and payloads, and executes installed commands

## Scope

- `engine/crates/vaultspec-product/src/bin/product_certify.rs`

## Description

- Add the certifier binary as a second tool target in the product crate,
  mirroring the existing builder shell: parse, dispatch, classify into stable
  exit codes, with every authority left in the library.
- Open a published archive by proving it against the sibling `.sha256` every
  published archive ships, digesting the file through a bounded streaming read
  under a fixed archive ceiling.
- Stage the artifact with the same extraction each product-owned installer
  performs for its shape, under both an output cap and a wall clock.
- Verify the staged tree through the shipped installed-tree authority, under a
  component lock compiled into the certifier rather than read from the candidate,
  so a candidate can never authorize itself.
- Execute installed commands with both streams drained on their own threads under
  a shared byte cap and a wall clock, killing the whole spawned process group on
  either breach so a command that forks helpers cannot hold the drain open.
- Model outcomes three-valued and never collapsed: certified, evidence
  unavailable (typed, with its own exit code), or failed. A case that cannot
  reach real evidence fails closed; it never passes and never skips.
- Carry a fixed, bounded case roster with a listing verb and per-case selection.
- Retain the two captured streams separately, so a command's machine-readable
  report stays decodable even when that command also logs.
- Dispatch the bundled runtime's real service verbs rather than its version or
  help surface. A construction-only check walks the command surface without
  entering any verb body, so a frozen-closure defect survives it and first
  surfaces at real product run; success is read from the decoded report, because
  those verbs encode run state in their exit code and a healthy stopped service
  exits non-zero.
- Split the tool along its own seams once it reached the module-size gate: the
  entry keeps the invocation, the outcome vocabulary, the roster, and the shared
  helpers, while artifact staging, bounded command execution, the
  network-isolation precondition, and the cases each own a module with their
  tests. The modules carry explicit paths so they stay in the tool's own
  directory instead of becoming sibling binaries.

## Outcome

The certifier runs end to end. Driven against a real locally staged archive it
proved the sibling digest, extracted with the host extraction tool, and reported
every wired case as evidence-unavailable with its typed reason and exit code 3 —
no silent pass anywhere. Twenty-seven unit tests pass, including real subprocess
breaches: a child that outruns its wall clock and a child that floods its output
cap are both killed and reported, a child writing to both streams has them
retained separately, an absent program is classified as unavailable evidence
rather than a failure, and the streaming digest agrees with the whole-file digest
of the same bytes. Output that carries no decodable report — the shape a
frozen-closure defect presents as — is proven never to read as a healthy state.

The roster carries seven further cases added alongside this one. Each is split
into a driver over the product state authority, so the driver is exercised
locally against real OS locks, real concurrent contenders, real credential
files, and a really-reaped process, while the case itself first binds to the
real installed components — a runtime case reasons about the installation a
published artifact establishes, so it may never certify against product state
alone.

## Notes

- No published product archive exists yet, so no case has been driven against a
  real released artifact. That is the certifier behaving correctly rather than a
  gap in it: every case reports evidence unavailable. The remaining
  certification rows in this phase stay open until a real artifact exists.
- Two lifecycle capabilities later certification rows target — removal and
  immutable repair — currently return a refusal from the product authority
  itself, so no honest case can be written against them yet.
- The crate was mid-reshape by a concurrent lane while this landed; the
  certifier consumes only the lock parser and the installed-tree verifier, both
  of which survive that reshape, and the workspace gate is green after it.
- One pre-existing environment quirk, unrelated to this work: the update
  transaction acceptance binary cannot be launched by the test harness on
  Windows because its filename trips the installer-detection elevation
  heuristic. Copied to a neutral filename the same binary passes.
