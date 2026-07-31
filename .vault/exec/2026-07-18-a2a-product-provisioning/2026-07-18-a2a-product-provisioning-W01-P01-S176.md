---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-30'
modified: '2026-07-30'
body_schema: 'body-v1'
body_hash: 'sha256:597458481c89a6f8fdc67f3af9a2643d04f4dfdf867be5dddb5b9ea11e155ac1'
step_id: 'S176'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Implement sealed provisioning and active-release facades that consume the verified release under the unsigned-channel authority (TUF retained-in-code, deferred, not a release gate), exact installation-lock and unpublished-generation authority, plus pending or existing ownership proof, derive private manifest and receipt facts, publish only through the fixed journal, expose non-authorizing settled observation, and preserve every exact authority across bounded retry or recovery

## Scope

- `engine/crates/vaultspec-product/src/provisioning.rs`
- `engine/crates/vaultspec-product/src/lib.rs`
- `engine/crates/vaultspec-product/src/manifest.rs`
- `engine/crates/vaultspec-product/src/manifest/authority.rs`
- `engine/crates/vaultspec-product/src/receipt.rs`
- `engine/crates/vaultspec-product/src/receipt/publish.rs`
- `engine/crates/vaultspec-release-verify`

## Description

- Derive the settled receipt's channel fact from the sealed install provenance the
  transaction carries, replacing the self-install literal in the first-install drive.
- Open the Windows Installer, Scoop, and WinGet channels through their own adapter
  doors on the sealed transaction, alongside the existing self-install door.
- Prove the channel fact in all four directions against the settled fixed journal.
- Drop the dead-code allowances whose stated reason - awaiting a production adapter
  authority - the wired transaction had already discharged, in the channel adapters,
  the provenance getter, the install-release seam, and the bootstrap-ownership proof.
- Restate the provisioning module contract: adapter-gated, unsigned-channel
  authorization, and one refusal where an update door would otherwise be a second
  drive to a receipt.
- Name the sealed installation modules in the crate documentation.
- Correct the release verifier's refusal rationale and remove the stale claim that a
  missing provisioning consumer is what withholds its success.

## Outcome

Delivered. Most of this Step was already satisfied by the sealed-transaction work that
closed the integrated authority proof, and that working code was left alone: the
transaction is non-cloneable and non-serializable, verifies the installation guard
against the product scope before creating any authority, derives every path from the
product paths with no path operand, borrows the exact unpublished generation, assembles
the trusted release authority inside the private manifest boundary, commits only through
the crate-private fixed-journal publisher, retains the pending credential proof on every
failure, and reads its summary back out of the settled journal rather than assembling it
from values it happened to hold. The bounded active-release observation is likewise in
place and is what the API, command line, lifecycle, and recovery surfaces already read.

One real defect was open. The first-install drive named the self-install channel as a
literal while carrying arbitrary sealed provenance, so a transaction opened by a
manager-owned adapter would settle a receipt labelled self-install - precisely the
substitution the governing decision forbids, and the label later mutation authority is
gated on. The fact now comes off the provenance, and because the three manager channels
previously had no way to open a transaction at all, each gained its own adapter door;
their provenance mints are consequently live rather than dead code.

The unsigned-channel clause reads as a prohibition on this facade imposing a signing
precondition, and it holds: nothing in the provisioning, manifest, or receipt path
requires signed distribution metadata, and the integrated proof runs the whole chain
under an unsealed root. Ownership proof is complete in both forms - a first install can
only assert ownership creation by presenting a live retained credential proof that
revalidates at the activation boundary, and an update can only carry the fact out of a
prior settled receipt.

## Notes

- Shared-tree collision: a concurrent agent committed while these files were staged, so
  this Step's eleven files landed inside that agent's packaging commit rather than under
  their own message. Content is intact and verified against the commit's diff; history
  was not rewritten to separate them.
- Gates were scoped to the touched crates because the shared tree was red in another
  agent's in-flight work - an unfinished non-exhaustive match in the updater and a
  product certifier binary that does not currently compile. Formatting passed
  workspace-wide; lint and tests passed for the product and release-verifier crates,
  204 library tests and every integration target green.
- One production ergonomic remains outside this Step: the only public first-install
  drive still takes its release facts from the verified distribution capability, so an
  unsigned channel has no fact source of its own yet. Inventing one would mean choosing
  a new trust anchor, which is a decision rather than an execution; the composition-time
  digest direction the product-provisioning decision sets out is where it belongs.
- Interaction with the component reshape owned by a later Step: the first-install feed
  and the private release authority still carry a capsule root, and the complete
  verification still joins a capsule manifest. Those were left exactly as found. The
  channel-fact change is orthogonal to them and touches no capsule field.
