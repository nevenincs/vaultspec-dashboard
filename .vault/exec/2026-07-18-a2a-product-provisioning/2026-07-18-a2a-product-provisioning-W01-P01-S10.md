---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S10'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Enforce installation transaction locking only for installer and copied-updater authority, require lock-first mutation ordering and owner-matching stale-state quarantine, and forbid the gateway from acquiring or waiting on the install lock

## Scope

- `engine/crates/vaultspec-product/src/locking.rs`

## Description

- Add `InstallLock` in `locking.rs` over an `fs4` OS-exclusive lock, with an
  `InstallLockGuard` that releases on drop (or process death) so a crash never
  strands the lock.
- Encode lock-first authority in the type system: `acquire` takes an `Actor`, and
  an `Actor::Gateway` request is refused with `LockError::GatewayForbidden`
  before the lock file is even touched — the gateway can neither acquire nor wait
  on it.
- Record advisory owner + pid in an unlocked sidecar file so a busy caller and
  the stale-state quarantine path can read the holder identity even while the
  lock file itself is OS-locked and unreadable on Windows.
- Implement `quarantine_owner_matched_stale`, permitting quarantine only when the
  stale state's owner matches and the recorded process is proven dead via a
  scoped `sysinfo` refresh (`process_is_alive`).

## Outcome

An installer acquires and releases the lock; a second holder is refused while
held; the gateway is refused before touching the lock; and stale-state
quarantine is granted only for an owner match plus a provably-dead pid,
refusing a foreign owner or a live process.

## Notes

On Windows an OS-exclusively-locked file cannot be read by another handle, so the
holder identity is kept in an unlocked sidecar (mirroring the existing seat
discovery-file pattern) rather than inside the lock file.
