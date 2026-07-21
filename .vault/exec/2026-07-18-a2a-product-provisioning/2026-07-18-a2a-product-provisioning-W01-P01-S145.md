---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S145'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Run a producer-consumer contract workflow that emits the real A2A desktop capsule manifest and target archive, then validates both with the dashboard production parser

## Scope

- `.github/workflows/a2a-product-contract.yml`
- `engine/crates/vaultspec-product/src/bin/a2a_contract_check.rs`
- `engine/crates/vaultspec-product/tests/a2a_contract_check.rs`

## Description

- Add a bounded dashboard-side contract checker that byte-matches its build-embedded committed component lock, consumes one detached producer capsule manifest and one closed target, and delegates contract validation to the production product parser.
- Open inputs no-follow through retained platform authority, bound path, byte, target, and diagnostic sizes, and keep archive and activation authority explicitly unavailable.
- Prove compatible and incompatible detached manifests, substituted locks, unknown operands, oversized files, symlinks, and nonblocking Unix FIFO refusal through the production executable and real filesystem objects without duplicating parser logic.
- Keep the workflow and Step open until the pinned A2A producer emits contract `2.0`, its target archive passes the producer verifier, and the dashboard workflow consumes that real exact-commit output.

## Outcome

OPEN / EXTERNALLY GATED. The bounded dashboard consumer executable is implemented and independently source-reviewed after two filesystem-boundary revision cycles. The Windows suite passes 166 product unit tests and every integration target, including six checker subprocess tests, with zero failures or ignored tests; all-target warning-denied clippy and formatting pass. The checker explicitly reports the archive unverified and activation unauthorized. It does not certify the currently pinned producer or complete S145.

## Notes

The committed dashboard lock pins an A2A revision that emits capsule contract `1.0`, while the dashboard production parser requires exact contract `2.0`. A later compatible producer exists but is not authorized by the current lock. Selecting and pinning that cross-repository revision remains explicit producer-consumer authority work; the checker exposes the mismatch rather than weakening either contract.

Native Unix execution of the FIFO proof remains required in CI. The local Linux-target compilation attempt stopped before crate compilation because the required `x86_64-linux-gnu-gcc` cross toolchain is unavailable; both `libsqlite3-sys` and `aws-lc-sys` reported that same environment gate.
