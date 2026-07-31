---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-30'
modified: '2026-07-30'
body_schema: 'body-v1'
step_id: 'S164'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Verify the receipt-selected generation against the receipt-bound release-set and component-lock digests plus every installed file digest before starting and never trust a lock supplied only by the candidate tree

## Scope

- `engine/crates/vaultspec-api/src/routes/a2a_lifecycle.rs`

## Description

- Replace the seated reconcile's flat cold-start refusal with a proof-then-start path
  that runs under the held installation guard.
- Prove the receipt-selected generation before a program path exists: member manifest
  located by the receipt's digest, component lock digested against the receipt's value
  before it is parsed, complete inventory over every installed file, and the frozen
  runtime's declared subtree, entrypoint, and file count.
- Resolve the launch program out of that proof and re-validate its segments against the
  generation root at the spawn seam.
- Start the frozen runtime's foreground service verb with the product-owned environment,
  retaining the process so seated shutdown terminates what it started.
- Move the discovery classification feeding the mutation gate to AFTER lock
  acquisition, and make the guarded reader take the guard as a type-state witness.
- Add the typed gateway-running refusal and its conflict wire kind.

## Outcome

Delivered, with one clause proven a layer down. The start path now derives every fact it
acts on from the settled receipt rather than from the tree it is about to run, so a
staged, substituted, incomplete, tampered, or self-authorized generation produces no
proof and therefore no program - it stays inert without a special case anywhere. The
component lock is the sharp end: it is read from its fixed path and must digest to the
receipt's value BEFORE it is parsed, so a lock present only in the candidate tree can
never vouch for the tree that carries it.

Folded in with it is a real ordering defect. The verdict that authorizes a mutation was
read before the installation lock was acquired and then used to authorize an effect
running under it. Gateway spawn and discovery republication are serialized by that lock,
so a pre-lock observation of nothing running can survive an entire updater swap and then
authorize a mutation against a gateway that is by then live. The read now happens under
the guard, and the guarded reader takes the guard as a parameter so the ordering is
compiler-checked rather than remembered.

The same gate was also indifferent to which operation it was authorizing, so a live owned
gateway permitted repair and removal - operations that rewrite or delete the files it is
executing from, which Windows refuses outright for a running image. Those two now refuse
with a new typed refusal while stop, restart, update, and rollback continue to address a
running gateway deliberately.

## Notes

- WIRE-CONTRACT EVENT, called out rather than smuggled: the closed refusal set gains one
  member, surfaced as a conflict with its own kind token. It is a closed-set addition, so
  a client that branches on the set sees a new arm rather than a changed meaning. The
  alternative - reusing the unverifiable variant with a detail string - would have hidden
  a distinct, actionable cause behind free-form text.
- Follow-up left deliberately undone: the command-line side added its own equivalent
  refusal in an earlier commit. Now that the shared guard owns the refusal, that one is
  redundant and should be deleted in favour of it - not in this Step.
- Gate evidence: the product and API libraries both compile, formatting is clean for both
  crates, and the API library suite is green. The product test target cannot be executed
  right now - the component reshape lane is mid-migration in the shared fixtures and
  several integration tests still consume the retired lock shape - so the lifecycle
  regression matrix added here compiled and passed before that migration began and has
  not been re-run since.
- A concurrent lane introduced a further discovery verdict while this Step was gating.
  Its documented intent maps onto the op-sensitive branch added here, but the arm is
  deliberately not written from this lane: that variant is another lane's in-flight work
  and two authors in one match is how a conflict is manufactured.
- Shared-index collision, in the other direction this time: the commit carrying this work
  swept up files another lane had already staged in the shared index. Subsequent commits
  use an explicit pathspec on the commit itself, which ignores the index entirely.
