---
tags:
  - '#adr'
  - '#a2a-distribution-trust'
date: '2026-07-20'
modified: '2026-07-20'
related:
  - "[[2026-07-20-a2a-distribution-trust-research]]"
  - "[[2026-07-18-a2a-product-provisioning-adr]]"
---

# `a2a-distribution-trust` adr: `TUF-rooted offline distribution authority` | (**status:** `accepted`)

## Problem Statement

The product verifier correctly prevents a candidate generation from constructing its
own `TrustedReleaseAuthority`. No production source currently supplies the independent
target, cohort, component-lock, and release digests needed to construct that authority.

The committed component lock authenticates selected build inputs, but it does not
authenticate a published five-target cohort or a future candidate. An active receipt
authenticates the installed release, not the next release. File ownership and the
installation lock protect local mutation ordering; they do not establish distribution
provenance.

The product therefore needs an authenticated update-metadata root that works after a
bundle has been fetched and disconnected from the network. It must preserve key
continuity, reject rollback and freeze attacks, and supply opaque authority to the
sealed provisioning transaction.

This decision refines D8's artifact-level release gate and D10's private activation
construction. It does not supersede the product-provisioning, generation-authority,
dashboard-packaging, or distribution-channel decisions.

## Considerations

- Candidate bytes cannot supply a trusted key, digest, target name, or release policy.
- Verification must operate from a complete local directory without network access.
- The five platform archives advance as one release cohort, not as independent updates.
- Root and online signing-key rotation require explicit continuity and recovery rules.
- Persisted client state must detect metadata rollback, freeze, mix-and-match, and clock
  regression across process restarts.
- Metadata, targets, signatures, versions, retained state, subprocess output, and wall
  time require product-owned bounds.
- Shell and PowerShell installers must not implement canonicalization, signature
  verification, hash policy, expiry policy, or role selection.
- The current project has one maintainer. Key separation must be honest about that human
  topology rather than implying independent maintainers.
- Metadata authentication and operating-system code signing solve different problems.
  The accepted zero-paid-code-signing posture remains in force.

## Considered options

- **Unsigned bootstrap or updater descriptor - rejected.** Owner-private storage and the
  install lock cannot distinguish installer metadata from candidate-authored metadata.
- **Direct Ed25519 or Minisign release record - rejected as the trust root.** A direct
  signature authenticates bytes but leaves root continuity, role separation, expiry,
  rollback state, consistent snapshots, and recovery as a project-specific protocol.
- **Sigstore bundle as the activation root - rejected.** Sigstore supplies valuable
  workflow identity and transparency evidence, but it does not define the product's
  release monotonicity, downgrade authority, or retained client state.
- **Package-manager hashes as the activation root - rejected.** They are useful channel
  evidence but do not provide one portable trust contract across self-install, MSI,
  Scoop, WinGet, macOS, and Linux channels.
- **The Update Framework 1.0 with an isolated Rust verifier - chosen.** TUF supplies
  out-of-band root trust, threshold roles, sequential root rotation, expiring versioned
  metadata, consistent snapshots, target sizes and hashes, and client rollback state.

## Constraints

- The implementation uses TUF 1.0 through `tough` version `0.24.0`. The dependency and its
  asynchronous runtime remain isolated in one distribution-authority crate and one
  bounded helper executable.
- The verifier uses filesystem transport only. Network acquisition belongs to the
  channel or release layer and completes before verification begins.
- The initial trusted root is embedded in the product-owned helper. Neither the staged
  bundle nor a script may replace or override it.
- `consistent_snapshot` remains enabled. Expiry enforcement cannot be disabled for
  offline installation.
- The repository exposes exactly six primary TUF targets: one canonical cohort record
  and five target-specific complete product archives. Unexpected target names fail
  closed.
- The cohort record uses the accepted RFC 8785 JSON Canonicalization Scheme. It binds
  the exact five target triples, their member-manifest digests, component-lock bytes and
  digest, release identity, dashboard and updater identities, capsule contract,
  protocol and state ranges, licenses, and software bill of materials.
- TUF target metadata independently binds the exact byte length and SHA-256 digest of
  the cohort record and each archive.
- Metadata length, target length, target count, delegated-role count, root-update count,
  download bytes, datastore bytes, verification time, helper output, and subprocess
  lifetime have fixed product constants. Candidate metadata cannot raise a bound.
- The persistent datastore is owner-private and product-derived. Update, repair,
  rollback, and ordinary reinstall cannot reset its highest accepted versions or
  latest-known time.
- The sealed manifest, generation, and fixed-receipt parents are stable. This decision
  supplies their missing upstream distribution authority; it changes none of their
  local filesystem or journal semantics.
- Production key generation, custody, recovery, initial root signing, and verifier-root
  embedding form a release prerequisite. Test keys cannot satisfy that prerequisite.

## Implementation

**D1: One TUF repository defines a release stream.** The repository uses TUF 1.0 and
`consistent_snapshot`. Its root metadata defines root, targets, snapshot, and timestamp
roles. Every published bundle includes all metadata and target bytes required for
filesystem-only verification, including every intermediate root required for rotation.

**D2: Six primary targets form one authenticated release.** One RFC 8785 canonical
cohort record binds the five platform members. The other five targets are the complete
target-specific archives. The verifier selects exactly one archive from the trusted
cohort and the product's closed target enum. It rejects extra primary targets,
duplicates, omissions, cross-target substitution, or a cohort/archive mismatch.

**D3: One isolated Rust boundary performs verification.** A dedicated
distribution-authority crate contains `tough 0.24.0` and exposes only bounded safe product
types. A linked Rust caller receives an opaque, non-cloneable, non-serializable
`VerifiedDistributionRelease` or bounded diagnostics. A small helper consumes a staged
local bundle, product-derived trust-state directory, and canonical target, then consumes
that opaque authority internally while performing its requested product operation. The
helper returns bounded status only; no capability or trusted raw digest crosses the
process boundary.

The helper loads the embedded root, verifies metadata and target roles through
filesystem transport, enforces expiry and all resource bounds, and persists accepted
state. It never returns caller-trusted raw digests. Shell, PowerShell, MSI, Scoop,
WinGet, and copied-updater consumers delegate to this helper. Scripts perform no TUF,
signature, canonicalization, or hash-policy logic.

**D4: Persistent state carries update continuity.** The owner-private datastore retains
trusted root, timestamp, snapshot, targets, metadata versions, and latest-known time.
The verifier reopens this state for every install or update and refuses version rollback,
clock regression, expired metadata, missing roles, mixed versions, and inconsistent
snapshots.

An explicit product rollback may select a receipt-bound retained generation. It does not
lower TUF's highest accepted metadata versions or latest-known time. Clearing this state
is not an update or repair operation; it requires the explicit full-data removal policy.

**D5: Distribution authority feeds sealed provisioning.** The provisioning transaction
consumes or uniquely borrows `VerifiedDistributionRelease`, the retained installation
guard, exact unpublished generation, and pending dashboard-credential authority. It
derives the private `TrustedReleaseAuthority` from the verified cohort and selected TUF
target, then performs complete generation verification and fixed-receipt publication.

The bootstrap transaction descriptor records signed metadata identity and pending local
authority. It does not accept raw expected digests chosen by a caller. A failed
publication retains the exact authorities required for bounded retry or authorized
cleanup.

**D6: Signing roles match the real maintainer topology.** Root metadata uses two
separately stored, encrypted, offline root keys with a two-signature threshold. Both are
controlled through one documented maintainer ceremony; this is storage and role
separation, not two-person governance. Root keys sign only initial root, root rotation,
or role and threshold changes.

Targets metadata uses one separate protected targets key and one-signature threshold.
Its release environment requires explicit approval. Release automation cannot substitute
snapshot or timestamp authority for targets authority. Snapshot and timestamp each use
their own automation key. A root rotation is sequential and must satisfy both the old
root threshold and the new root threshold.

No production private key, seed, or passphrase enters the repository, product tree,
ordinary continuous-integration environment, logs, cache artifacts, or test fixtures.
Production release publication remains blocked until the initial key ceremony is
completed and independently reviewed.

**D7: Offline verification remains honest.** A fully fetched bundle can install without
network access while its signed metadata remains valid. Expired metadata fails closed.
An offline client cannot learn about a revocation published after its bundle was fetched,
and the product makes no claim otherwise.

**D8: Sigstore and operating-system signing remain separate.** Sigstore or GitHub
artifact attestations accompany releases as supplemental workflow and transparency
evidence. They do not satisfy TUF roles and do not construct activation authority.

TUF metadata signing authenticates release metadata, bytes, roles, and continuity. It
is not Windows Authenticode, Apple Developer ID, notarization, SmartScreen reputation,
or Gatekeeper approval. This decision introduces no paid code-signing service and does
not weaken platform warnings or channel requirements.

## Rationale

TUF supplies the missing protocol rather than only a cryptographic primitive. Its root
continuity, separate roles, expiry, consistent snapshots, and persistent client state
match the product's candidate-independent authority requirements.

Filesystem transport preserves the required fetched-online, installed-offline flow.
The isolated `tough` boundary prevents dependency and policy spread through the product
crate, updater, and platform scripts. One opaque verified value composes with D10's
private receipt construction without exposing raw trust anchors.

The six-target model authenticates the release as one cohort while retaining exact
per-platform archive hashes and sizes. RFC 8785 canonicalization reuses the accepted
cohort identity contract instead of creating another byte representation.

The key topology accepts the single-maintainer reality. Two separately stored root keys
protect rare root changes and recovery, while one protected targets key keeps ordinary
releases operable. This separation reduces common-mode exposure but does not pretend to
provide independent-human approval.

## Consequences

- First install and update gain one candidate-independent authority source shared by all
  supported channels.
- Offline bundles remain verifiable without script cryptography or runtime network
  access, subject to signed metadata expiry.
- Rollback, freeze, mix-and-match, target substitution, and clock regression become
  explicit fail-closed states backed by persistent client data.
- Release bundles grow to include TUF metadata, the cohort target, and rotation history.
- `tough 0.24.0` adds a material cryptographic and asynchronous dependency closure. The
  isolated crate and helper require license, vulnerability, size, target-matrix, and
  resource-bound review.
- Release operations gain recurring timestamp and snapshot duties plus protected targets
  signing. Expired metadata creates an intentional availability failure.
- Root-key custody, backup, recovery, and rotation become operational responsibilities.
  Loss of the root threshold can prevent safe future rotation.
- A one-key targets threshold cannot resist compromise of that key. Root separation can
  recover future trust but cannot undo a malicious release already accepted by clients.
- Sigstore evidence improves auditability without becoming activation authority.
- TUF does not remove SmartScreen or Gatekeeper friction. The zero-paid-code-signing
  posture remains honest and unchanged.
- The product-provisioning D8 and D10 contracts become implementable without changing
  their artifact-level certification or fixed-journal semantics.

## Amendment (2026-07-21): free open-source scope — unsigned release, ceremony is not a prerequisite

The maintainer has scoped this project as a small, free, open-source effort with no
code-signing of any kind: neither paid operating-system code signing (already refused by
the dashboard-packaging zero-paid-signing posture) nor self-managed release signing.
Under this scope:

- The initial and supported release path is the existing UNSIGNED cargo-dist channel
  (GitHub Releases plus product installers, Scoop, WinGet, and cargo-binstall),
  consistent with the dashboard-packaging and distribution-channels decisions.
- The TUF-rooted authenticated-update authority defined by this ADR — and implemented in
  `vaultspec-distribution-authority` and `vaultspec-release-verify` — is RETAINED IN CODE
  but DEFERRED as an optional future enhancement. It is NOT a release gate. The D6 key
  ceremony is therefore NOT a prerequisite for shipping, and no production root need be
  embedded to publish a release.
- Electing TUF-authenticated updates later requires only generating free, self-managed
  keys and signing a root — no certificate authority, no purchase, no recurring cost. The
  D1–D8 design stands ready for that future election unchanged.
- Honest consequence: users receive unsigned artifacts (ordinary "unknown publisher"
  SmartScreen and Gatekeeper warnings) and update through normal open-source channels
  without cryptographic update verification. This is accepted for the project's scale.

This amendment refines only the release-gating interpretation of D6 and D8 for the
current scope. It supersedes none of the cryptographic design, which remains valid and
buildable if the project later elects signed updates.
