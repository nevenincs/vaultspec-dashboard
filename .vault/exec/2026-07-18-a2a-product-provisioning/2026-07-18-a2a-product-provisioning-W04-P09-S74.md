---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-30'
body_hash: 'sha256:bd2f29ed25dbf257eb30d1a68fdde6175404b0e9d3f733ceeb3d751ceaeee5bb'
step_id: 'S74'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Install, verify, receipt, update, and remove the complete macOS and Linux product tree from the product-owned shell installer

## Scope

- `packaging/install.sh`

## Description

- Kept the placement and verification the earlier pass had already delivered: install from a composed local tree or from a checksum-verified release archive, then hand the placed tree to the shipped verifier rather than restating any trusted digest in shell.
- Added the two operations the Step names that did not exist: update and a receipt-aware removal, both delegated to the product's own bounded authority.
- Made update delegate to the product's receipt-gated self-update path, so the swap happens outside the running seat under the installation lock and the retained prior generation survives for rollback, then re-verify the tree the updater activated. A refusal reported as a successful exit is now surfaced as a failure instead of being read as success.
- Made removal stop the running app, ask the product authority to drop its owned generations, receipt, and credentials while preserving user data, and only then delete the tree. A never-launched tree owning nothing is the one tolerated refusal; every other refusal aborts with the tree left in place rather than stranding state the authority still owns.
- Added honest receipt reporting: the installer reads receipt state from the same authority, states it, and never claims a receipt exists, including when the read itself fails.
- Refused to clobber an existing installation, since replacing a live tree behind the updater's back would bypass the installation lock and discard the generation a rollback needs.
- Bounded the one network operation with a connect timeout, a wall-clock ceiling, and a size cap, with no retry loop, and fixed two constructs that would have aborted the script under its own error-exit setting.
- Removed the plan and Step identifiers the earlier pass had embedded in the script's header and comments.

## Outcome

The installer owns the whole lifecycle the Step names, and every product decision inside it is delegated to the shipped bounded authority rather than reimplemented in shell.

## Notes

Verification was a real control-flow probe, not a syntax check: every operation path was executed against a stub product binary standing in for the shipped one, covering no operation selected, two operations selected, a bad source, a fresh install, a refused re-install, receipt present, receipt absent, receipt unreadable, a refused update, a successful update, removal of a never-launched tree, a repeated removal, and a hard removal refusal. The last case was asserted to leave the tree on disk.

This is control-flow evidence, not end-to-end evidence. A real install of a real composed tree is not exercisable yet: composition depends on the reshape of the runtime build source owned by another lane. Neither the target platforms nor a real product binary were available on this machine.
