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

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace a2a-product-provisioning with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S10 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Enforce installation transaction locking only for installer and copied-updater authority, require lock-first mutation ordering and owner-matching stale-state quarantine, and forbid the gateway from acquiring or waiting on the install lock and ## Scope

- `engine/crates/vaultspec-product/src/locking.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
