---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S03'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# Acquire the seat lock at serve boot via an OS lock primitive with dead-pid and stale-heartbeat takeover, fail-loud conflict naming the running seat, and the sanctioned exemptions (--port 0 implying no seat, plus an explicit --no-seat flag) declared at the flag site

## Scope

- `engine/crates/vaultspec-api/src/lib.rs`

## Description

- Create `engine/crates/vaultspec-api/src/seat.rs`: `acquire_seat` takes an OS exclusive file lock (`fs4`) on `seat.lock` under the app home; `SeatGuard` holds it for the process lifetime and the kernel releases on any death, making dead-pid takeover automatic.
- On a live conflict, `SeatBusy::Held` carries pid/port read tolerantly from the seat discovery file; serve fails loud naming the running seat and both escape hatches.
- Wire acquisition into serve boot BEFORE heavy work; `--port 0` implies exemption and the new `--no-seat` flag (declared in `engine/crates/vaultspec-cli/src/main.rs`) is the explicit dev hatch; a missing home degrades to an unseated WARN, never a refusal to serve.

## Outcome

Seat law enforced at boot with fail-fast conflict and automatic takeover; seat unit tests (exclusivity within a home, busy-names-identity, release-on-drop) pass.

## Notes

`fs4` (maintained fs2 fork) chosen over the ADR's named-lock sketch: same OS primitives, simpler API, kernel-release-on-death gives takeover for free.
