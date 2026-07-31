---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-30'
modified: '2026-07-30'
body_schema: 'body-v1'
body_hash: 'sha256:fbc64161a9e30870e908076f7bbfc4809cea8d833fc0c67447df9585d8a5d1be'
step_id: 'S16'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Implement active-receipt-only lifecycle transitions that reject candidate or rolling-back records bind every start and mutation to the verified complete release set and preserve cold state foreign attach mutable data and standalone-MCP ownership

## Scope

- `engine/crates/vaultspec-product/src/lifecycle.rs`

## Description

- Add a receipt-bound verification of an installed generation beside the install-time
  double scan, reusing the one scanning, location, and inventory authority.
- Locate the member manifest by the receipt's digest rather than by any path the tree
  declares.
- Require the installed component lock to digest to the receipt's value before it is
  parsed, so a lock supplied only by the installed tree cannot authorize itself.
- Cover every installed file through the manifest's own inventory with no missing and
  no extra member.
- Authorize a start or ensure only by that proof, returned as a non-cloneable value a
  caller must hold to have anything to launch.
- Extend the guarded-mutation seam so a relaunch carries the same obligation, while
  repair and removal stay reachable for a tree that no longer verifies.
- Prove the whole set against real installed trees: an authorized start, an
  undeclared installed file, a lock the receipt does not vouch for with a positive
  control beside it, and a refused relaunch next to a permitted repair.

## Outcome

Delivered. Several clauses were already satisfied and were left untouched with their
existing proofs: the controller reads only the fixed active-receipt journal, so a
retired side-file receipt - the only record shape that could ever carry a staged or
rolling-back state - is inert; cold installed state is a first-class readiness rather
than a degradation; a live foreign resident is never displaced or mutated; mutable data
survives every transition; and the standalone component entrypoint stays inspectable but
outside every start, adopt, stop, drain, and cleanup path.

The open clause was the binding itself. Start was a flat typed refusal and mutations
stopped at the settled receipt plus the ownership capability, so nothing proved that the
generation the receipt selects is the generation about to run. That proof now exists and
is what start is authorized by. The relaunch case is included because it runs the
release's code again; repair and removal are deliberately excluded, since gating them on
a clean verification would strand precisely the install that needs them - that carve-out
is stated at the seam rather than left implicit.

## Notes

- Scope note: the verification itself lands beside the existing installed-tree
  verification rather than in the lifecycle module, because a second scanner in the
  lifecycle module would have been a second authority over the same bytes. The lifecycle
  module owns the capability type and the two authorization doors.
- Shared-tree collision, second occurrence: a concurrent agent committed while these
  files were staged, so this Step's code landed inside that agent's plan-bookkeeping
  commit. Content verified present in the resulting tree; history was not rewritten.
- Gate evidence was captured before a concurrent lane began reshaping the component pin
  in the shared manifest module: ten lifecycle tests green on Windows with no platform
  gating, and formatting clean for the touched crates. The crate does not currently
  compile in the working tree, and every error names that lane's in-flight fields.
- One test was deliberately rewritten away from a permission-dependent file
  substitution: overriding a read-only bit to corrupt an installed file made the refusal
  attributable to a mode change as much as to the digest. Verifying the same real tree
  against a foreign expectation, with a positive control beside it, isolates the
  property being asserted.
