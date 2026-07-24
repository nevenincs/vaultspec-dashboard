---
tags:
  - '#adr'
  - '#a2a-product-provisioning'
date: '2026-07-24'
modified: '2026-07-24'
related:
  - '[[2026-07-18-a2a-product-provisioning-research]]'
  - '[[2026-07-18-a2a-product-provisioning-reference]]'
  - '[[2026-07-18-a2a-product-provisioning-adr]]'
  - '[[2026-07-20-a2a-generation-authority-adr]]'
  - '[[2026-07-20-a2a-distribution-trust-adr]]'
  - '[[2026-07-20-a2a-archive-materialization-adr]]'
  - '[[2026-07-18-a2a-product-provisioning-plan]]'
---

# `a2a-product-provisioning` adr: `consume the dashboard-bundled a2a runtime: the frozen onedir replaces the fetched capsule` | (**status:** `accepted`)

## Problem Statement

The a2a repository's accepted `dashboard-bundled-runtime` record (2026-07-24)
pivots a2a away from being an installable product: a2a now ships clean gateway
source, a wheel, and an in-repo PyInstaller **onedir** freeze recipe with a
service-management CLI (`serve`, `setup`, `start`, `stop`, `status`,
`restart`). The capsule apparatus — capsule assembly, archive projection,
inventories, closure verification, evidence chains, the capsule manifest
schema, multi-target packaging, and the capsule CI workflow, roughly 33,000
lines — is deleted from that repository. The record explicitly directs that
dashboard-side documents describing capsule consumption be reversed here.

This record performs that reversal. It is low-risk by construction: the
dashboard's capsule-consume path was never wired live. `product-release.yml`
has zero runs and its `A2A_CAPSULE_BASE_URL` is an empty fail-closed
placeholder, so no live contract breaks; only authored-but-unexercised surface
is retired.

## Considerations

- There is exactly one consumer of a2a — this dashboard — and it is a build
  system plus a lifecycle manager. The a2a record assigns the dashboard
  ownership of the target matrix, signing posture, bundling, and management via
  the CLI verbs.
- The runtime contract is frozen and distribution-shape independent: the
  discovery record schema, owner-ACL bearer handoff, and the authenticated
  health, readiness, drain, and shutdown verbs behave identically from source
  and from the frozen binary. Everything the lifecycle plane codes against
  survives.
- The 2026-07-18 parent record rejected freezing a2a into an executable for
  exactly one named reason: worker and provider contracts re-exec
  `sys.executable` with module and snippet arguments. The a2a record resolves
  that blocker at its single seam (one frozen-aware command authority that
  renders "re-exec myself with a subcommand"). The rejection's premise is
  discharged, not overruled.
- The composite release unit remains the dashboard's deliverable: one product
  tree per target (dashboard executable, external updater, bundled a2a
  runtime, member manifest, licenses, SBOM), verified and activated through
  the existing generation, receipt, and journal authorities. What changes is
  only the SHAPE and PROVENANCE of the a2a component.
- The target roster is the four-triple set (Apple Silicon macOS, Arm64 Linux,
  x86-64 Linux, x86-64 Windows) per the 2026-07-22 amendment recorded in the
  distribution-trust record.
- The 2026-07-21 free-open-source amendment stands: releases are unsigned; the
  TUF authority remains retained-in-code, deferred, and not a release gate.
- PyInstaller onedir output must satisfy the generation-authority tree rules:
  every non-root directory must be an ancestor of at least one regular file,
  and links/reparse objects are refused. The freeze recipe must emit no empty
  directories and no symlinks into the immutable generation; any such state
  belongs in the mutable app home.

## Considered options

- **Accept the bundled-runtime contract; the dashboard builds the frozen
  onedir per target from the pinned a2a source — chosen.** One consumer, one
  build system, no cross-repo artifact fetch, no second product.
- **Keep the capsule consume path — rejected.** The producer side is deleted;
  the consume path was a fail-closed placeholder serving a product shape that
  will not ship.
- **Consume a2a as a wheel resolved into a Python environment (uv) at install
  or first run — rejected.** Reintroduces system-interpreter, mutability, and
  offline problems both repositories' records already rejected; leaves
  interpreter and closure guarantees outside product ownership.
- **Fetch pre-frozen binaries from an a2a release — rejected.** a2a no longer
  publishes product artifacts; the a2a record assigns target-matrix and
  bundling ownership to the dashboard. A cross-repo binary fetch would recreate
  the never-wired capsule fetch under another name.
- **Keep the full release-time ceremony (TUF authority, product-owned
  installers, external updater, composite certification, cohort digest) —
  rejected by owner (2026-07-24).** Under the unsigned free-open-source scope
  and with no capsule product, the release ceremony has no consumer. The
  runtime lifecycle does, and it is kept; see the Amendment below.

## Constraints

- The onedir is opaque to dashboard business logic. The dashboard invokes the
  frozen binary's CLI verbs and reads the frozen runtime contract; it never
  imports Python packages or interprets the onedir's internal layout. This is
  the same opacity constraint the capsule carried, re-homed onto the onedir.
- The freeze build must be pinned and reproducible inside the release
  pipeline: exact a2a commit, locked environment (`uv sync --locked`), the
  in-repo PyInstaller spec, and the in-repo build entry. No floating versions,
  no `latest`, no runtime resolution — the existing lock policy survives with
  a smaller subject.
- Component-level trust moves from pre-pinned runtime digests to
  composition-time digests: the dashboard's member manifest `file_digests`
  covers every onedir file exactly as it covers every other installed regular
  file. There is no longer a separate capsule manifest to cross-verify.
- The `a2a_component` reshape of `schemas/release-set-manifest.json` is a
  reviewed contract event (wire-contract rule), not an incidental edit.
- Freezing adds a known failure class (hidden imports, data files). The a2a
  record contains it with the in-repo spec plus a smoke gate that boots the
  frozen binary's dispatch paths; the dashboard pipeline runs that smoke gate
  before composition.
- Parent stability: the generation-authority, archive-materialization, and
  fixed-journal (D10) authorities are implemented and stable; they are
  consumed unchanged. The distribution-trust record is already deferred by its
  own amendment and is untouched.

## Implementation

**D1: The a2a component is a dashboard-built frozen onedir.** Each composite
release-set member bundles a PyInstaller onedir directory built by the
dashboard's release pipeline per target from the pinned a2a source, adjacent
to the dashboard executable. Its files are ordinary admitted release files:
regular files with release modes, digest-covered by the member manifest,
materialized and verified by the existing generation machinery. The private
CPython interpreter lives inside the onedir; no separate CPython, Node, or ACP
component pins exist at the dashboard's component-lock level.

**D2: The capsule consume path is reversed.** Removed or retired: the
`A2A_CAPSULE_BASE_URL` fetch step and its cross-repo TBD contract in
`.github/workflows/product-release.yml`; the capsule-manifest parsing
authority surface (`engine/crates/vaultspec-product/src/manifest/authority.rs`,
the `a2a_component.capsule_manifest` join); the producer-consumer capsule
contract proof (`.github/workflows/a2a-product-contract.yml`,
`engine/crates/vaultspec-product/src/bin/a2a_contract_check.rs`,
`engine/crates/vaultspec-product/tests/a2a_contract_check.rs`); and the
capsule-specific certification rows. `packaging/a2a-component.lock.json`
shrinks from the base-closure digest set (per-target CPython, Node, ACP) to a
source pin: repository, exact commit, release identity, and freeze-recipe
entry identity. The `a2a_component` block of the release-set manifest schema
reshapes accordingly.

**D3: The release pipeline builds, smokes, and composes.** Per target the
pipeline checks out the pinned a2a commit, restores the locked build
environment, invokes the in-repo PyInstaller build entry, runs the frozen
dispatch smoke gate, and hands the resulting onedir to `product_build` as an
ordinary build source alongside the dashboard and updater binaries. There is
no cross-repo artifact fetch and no runtime network dependency; the composed
tree remains offline-complete.

**D4: Management rides the CLI verbs over the frozen contract.** The lifecycle
plane (parent D3–D7) manages the bundled runtime exclusively through the
frozen binary's `serve`/`setup`/`start`/`stop`/`status`/`restart` surface and
the unchanged discovery record, bearer handoff, and authenticated health,
readiness, drain, and shutdown verbs. Ownership, foreign-attach,
receipt-bound mutation, and drain-before-stop semantics are unchanged.

**D5: The runtime survives; the release ceremony does not (as amended
2026-07-24).** KEPT, unchanged in semantics: the dashboard's own cargo-dist
release orchestration and its delivery channels (GitHub Release archives,
Scoop, cargo-binstall); the a2a service lifecycle over the frozen CLI verbs
(ownership, drain, foreign-attach, discovery, bearer handoff,
health/readiness/shutdown); and the on-machine runtime authorities —
generation-root authority, sealed materialization, double-scan verification,
installation receipts in the fixed two-slot journal, and the Windows authority
boundary — re-homed to first-run provisioning per the Amendment. CUT: the
TUF distribution authority and its verifier crates, the product-owned shell
and PowerShell installers, the composite MSI, the copied external updater,
the composite certification wave, and the cohort-digest plus
release-set-member cross-binding ceremony. The archive-materialization note
that "the nested A2A capsule ZIP remains one opaque regular product file"
narrows to: the onedir's files are ordinary admitted release files with no
nested-archive special case.

**D6: Supersession semantics.** This record AMENDS, and does not wholly
supersede, the 2026-07-18 parent: D1's capsule composition clause (private
CPython + Node + ACP capsule) is replaced by the built onedir, and its
"freeze — rejected" option is discharged by the a2a-side command authority;
D2's WiX "component fragment for every capsule file" reads "for every bundled
file"; D8's capsule-contract certification rows retire while the
artifact-level certification gate stands. The generation-authority and
distribution-trust records are untouched. The archive-materialization record
is narrowed as stated in D5. No dashboard record is superseded as a whole,
which is why no supersession is recorded in frontmatter: the `vault adr
supersede` verb expresses whole-document replacement only.

## Rationale

The only consumer of a2a asked for a binary with lifecycle verbs, and the a2a
repository now provides exactly that shape. The dashboard's capsule-consume
machinery pointed at a producer that no longer exists and was never wired
live, so reversing it deletes risk rather than capability. The one recorded
argument against freezing was a named, seam-local blocker that the a2a record
resolves at that seam. Everything expensive and correctness-critical on the
dashboard side — composition, semantic verification, receipts, the journal,
installers, channels — is independent of the a2a component's internal shape
and survives verbatim with a smaller trust surface: one source pin plus
composition-time file digests instead of a second manifest chain.

## Consequences

- Cross-repo release coordination simplifies from an artifact contract to a
  source pin plus a build entry. A stale or missing capsule can no longer
  block a release; a broken freeze build can, and it fails in the dashboard's
  own CI where it is diagnosable.
- The dashboard release pipeline takes on the Python freeze toolchain per
  target: PyInstaller runs on each target runner, and the hidden-import/data-
  file failure class arrives with it, contained by the in-repo spec and the
  smoke gate.
- Release artifacts still bundle a private interpreter; artifact size and
  antivirus-scanning concerns persist. Onedir (not onefile) avoids
  self-extraction latency and the harsher antivirus heuristics.
- `packaging/a2a-component.lock.json` and the release-set manifest schema
  change shape — reviewed contract events with engine + GUI owners, and the
  quality-gates lock/schema validation job re-scopes with them.
- The a2a-product-provisioning plan requires structural reshaping: capsule
  fetch/contract steps retire, compose and certification steps rewrite to the
  built-onedir path, and lifecycle/journal/CI steps stand. The reshape map is
  produced separately and applied through the plan CLI.
- If a2a's freeze recipe ever emits empty directories or links, generation
  verification refuses the tree — by design. The constraint flows upstream to
  the recipe, not downstream into a verifier exception.

## Amendment (2026-07-24): prune the release ceremony, keep the runtime lifecycle (owner decision)

The owner has scoped the split between what this release drive ships and what
it deletes. The dividing line is CONSUMER, not machinery age: release-time
ceremony that only a signed, multi-channel capsule product would consume is
cut; runtime machinery that the unsigned release still exercises on the
user's machine is kept.

**CUT (release-time ceremony — no consumer under the unsigned, no-capsule
scope):**

- The TUF distribution authority: `engine/crates/vaultspec-distribution-authority`
  and `engine/crates/vaultspec-release-verify` leave the tree (they were
  already deferred-not-a-gate; now they are pruned, superseding the
  retained-in-code posture of the distribution-trust amendment for this
  repository's tree).
- The product-owned installers `packaging/install.sh` and
  `packaging/install.ps1`, and the composite MSI: delivery REVERTS to the
  cargo-dist generated installers and archives.
- The copied external updater (`engine/crates/vaultspec-updater`): self-update
  REVERTS to cargo-dist's axoupdater.
- The composite certification wave and the cohort-digest plus
  release-set-member cross-binding ceremony of the 2.0 manifest schema.

**KEPT (runtime, consuming the unsigned release on the user's machine):**

- The a2a service lifecycle through the frozen CLI verbs
  (`serve`/`setup`/`start`/`stop`/`status`/`restart`), with ownership, drain,
  and foreign-attach semantics unchanged.
- The per-target PyInstaller onedir build, bundling, and the CLI-verb smoke
  gate in the release pipeline.
- Installation receipts, sealed provisioning, the generation-root authority,
  sealed materialization, double-scan verification, the fixed two-slot
  receipt journal, and the Windows authority boundary.

**Where the kept runtime machinery now runs — first-run provisioning.** With
the product installers cut, no install-time step composes or verifies
anything: delivery places files, nothing more. The generation, receipt, and
verification authorities therefore re-home to FIRST-RUN (and per-upgrade)
provisioning: on launch, the seated dashboard locates the bundled a2a payload
delivered alongside it, materializes it through the sealed materializer into
an app-home generation, double-scan verifies it against the shipped payload
manifest, publishes the active receipt in the two-slot journal, and only then
manages the service lifecycle. A minimal per-target payload manifest (file
digests over the bundled payload, emitted at build time and shipped in the
archive) SURVIVES as the verification input; what is cut is the cohort and
member cross-binding ceremony around it, not the digest manifest itself.

**Open flag for the owner — binary-only delivery channels.** First-run
provisioning is complete and offline for FULL-ARCHIVE channels: a directly
downloaded GitHub Release archive and the Scoop zip both place the payload
next to the binary. It is ORPHANED for binary-only placements: cargo-dist's
generated shell/PowerShell installers historically place declared binaries
only, and `cargo-binstall`/`cargo install` place or build only the
executable — under those channels the payload never arrives and first-run
provisioning has no source. Before any of those channels is presented as
carrying the a2a capability, one of three resolutions must be elected: (a)
prove (not assume) that the dist archive `include` payload survives the dist
installers' placement; (b) let binary-only channels degrade the agent tier
honestly with remediation pointing at the full archive; or (c) elect a
checksum-pinned first-run fetch, accepting the first-run network dependency
this record's parents rejected. Until elected, binary-only channels are
documented as dashboard-only.

**Consequence deltas.** The prune is an ADR-directed deletion lane, not a
0.1.5 gate. The receipt-journal code paths are load-bearing again, so their
Linux test failures are defects to fix, never tests to retire. The
quality-gates release-inputs job re-scopes to the source pin, the freeze
build, the smoke gate, and the payload manifest.
