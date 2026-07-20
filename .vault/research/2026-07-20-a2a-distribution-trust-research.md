---
tags:
  - '#research'
  - '#a2a-distribution-trust'
date: '2026-07-20'
modified: '2026-07-20'
related:
  - "[[2026-07-20-a2a-provisioning-authority-research]]"
  - "[[2026-07-18-a2a-product-provisioning-adr]]"
---

# `a2a-distribution-trust` research: `authenticated offline distribution records and key continuity`

## Problem and scope

The product verifier deliberately has no public constructor for
`TrustedReleaseAuthority`. This prevents a candidate generation from copying its own
target, member, cohort, component-lock, and capsule claims into expected values. That
seal is effective, but no production source currently supplies the authority. The only
constructor is a test fixture.

The committed component lock authenticates the selected A2A source and capsule inputs,
but it does not authenticate a complete five-target release cohort or a newer candidate.
A prior active receipt authenticates the installed release, not a future one. Planned
cohort assembly, channel adapters, and updater descriptors do not yet define a trust
root.

This research compares authenticated distribution metadata designs that can be fetched
with the product artifacts and then verified offline. It covers authenticity, key
continuity, rollback and freeze resistance, deterministic records, Rust integration,
channel consumption, and the zero-paid-code-signing constraint. It does not replace
Windows Authenticode, Apple Developer ID, or package-manager ownership.

## Findings

### Requirements

- The verifier begins from an out-of-band root embedded in a product-owned Rust helper.
- Candidate bytes never supply their own trusted key, digest, target, or release policy.
- One canonical record binds the exact five-member cohort and each target archive.
- Verification works from a fully fetched local directory without network access.
- Root and release-key rotation have a defined continuity rule.
- Persisted metadata detects rollback, freeze, mix-and-match, and clock regression.
- All metadata, signatures, targets, retained state, and subprocess work have explicit
  size, count, time, and output bounds.
- Shell and PowerShell installers do not reimplement canonicalization or cryptography.
- Metadata authenticity is described separately from operating-system code signing.

### Repository evidence

`TrustedReleaseAuthority` is consumed only inside manifest verification, while its fields
remain private. `VerifiedReleaseSet::verify` also requires private verification and
activation contexts. Fixed receipt publication remains private. These are correct seals,
not missing visibility modifiers.

`a2a-component.lock.json` is read by tests but is not embedded by production. The active
receipt carries member, component-lock, and cohort digests, but no production conversion
creates authority for a newer candidate. S166 will emit the cohort digest; the channel
adapter and updater-descriptor steps remain open. None currently authenticates their
inputs.

### Option A: public raw descriptor

A descriptor containing target, member digest, cohort digest, component-lock bytes, and
capsule root would make the API callable. Without authentication, a candidate can produce
the same descriptor. File permissions and the installation lock protect mutation ordering;
they do not establish distribution provenance. Reject this option.

### Option B: direct Ed25519 or Minisign record

Direct Ed25519 gives small keys and exact offline verification. `ed25519-dalek` exposes
strict verification that rejects weak-key and signature edge cases. Minisign adds a
portable signing CLI, prehashed files, key identifiers, and a signed trusted comment.

Both authenticate bytes, but neither defines root-role continuity, thresholds, metadata
expiry, persistent rollback state, consistent snapshots, or separate release roles.
Vaultspec would need to invent that update-security protocol. Reject either as the sole
activation trust root. They remain possible implementations of keys inside a standard
metadata framework.

### Option C: Sigstore bundle

Sigstore keyless signing and GitHub artifact attestations provide strong build identity
and transparency evidence without a long-lived project signing key in continuous
integration. A bundle can carry the certificate, signature, transparency evidence, and
signed time needed for offline verification.

Sigstore identity proves which workflow signed an artifact; it does not by itself define
the product's release monotonicity, downgrade authorization, or retained installed-state
policy. Offline verification also needs a current Sigstore trust root, whose own updates
use TUF. Use Sigstore as supplemental release provenance, not the sole activation root.

### Option D: The Update Framework

TUF defines an out-of-band root, threshold roles, sequential root rotation authorized by
both old and new roots, versioned and expiring metadata, target hashes and sizes,
consistent snapshots, and client-side rollback/freeze state. These are the exact policies
missing from a raw signature.

The `tough` Rust client supports TUF 1.0, a filesystem transport for already-fetched
metadata and targets, explicit metadata/root-update limits, a persistent datastore,
expiration enforcement, and target streaming. Its datastore retains root, timestamp,
snapshot, targets, and latest-known-time state and applies version and clock-regression
checks. Version 0.24.0 is current in the July 2026 registry and does not require the HTTP
feature for filesystem verification.

This adds asynchronous and cryptographic dependencies. Isolate them in one distribution-
authority crate and one small verifier/helper executable. Product, updater, and installer
consumers use that implementation; scripts never parse TUF.

Recommend this option.

## Recommended trust topology

Use one TUF repository per Vaultspec release stream with `consistent_snapshot` enabled.
The initial root is embedded in the product-owned release verifier. The repository exposes
six primary targets: one canonical cohort record and five target-specific complete product
archives.

The canonical cohort record uses the already accepted RFC 8785 JSON Canonicalization
Scheme contract. It binds the exact five target triples, their member-manifest digests,
the component-lock bytes and digest, release identity, dashboard/updater identities,
capsule contract, protocol range, state range, and applicable license and software-bill-
of-materials evidence. TUF target metadata independently binds the byte length and SHA-256
digest of the cohort record and every archive.

The repository's signing policy must be achievable for the current single-maintainer
project without pretending that two independent maintainers exist:

- Root keys remain encrypted and offline. Root metadata requires two signatures from two
  separately stored root keys. This ceremony occurs only for root or role rotation, not
  every release.
- Targets metadata uses one separately held release key behind a protected release
  environment and explicit approval. A later multi-maintainer project may raise this
  threshold without changing the consumer protocol.
- Snapshot and timestamp keys are separate release-automation credentials. They cannot
  replace root or targets authority.
- Free GitHub/Sigstore attestations accompany published targets as audit evidence but do
  not satisfy TUF roles.

No private key, seed, passphrase, or unsigned root is stored in the repository, product
tree, logs, cache artifacts, or test fixtures. Establishing production keys and signing
the initial root is an explicit release-operations prerequisite. Test repositories use
separate clearly non-production keys and real TUF verification; they do not certify a
production root.

## Offline and channel flow

Release automation first verifies all five complete archives, emits the canonical cohort,
and creates targets metadata. The protected signing phase signs targets, snapshot, and
timestamp metadata and publishes every intermediate root required for rotation. The
published bundle includes metadata and targets but no private material.

The shell installer, PowerShell installer, MSI adapter, Scoop adapter, WinGet adapter, and
copied updater all delegate to the same Rust verifier. They supply only a staged bundle,
product-derived trust-state directory, and canonical target triple. The verifier loads the
embedded root, uses filesystem transport, enforces safe expiration and resource limits,
persists accepted metadata versions, and returns an opaque verified distribution
authority. No script receives trusted raw digests.

"Fetched online, installed offline" is supported while signed metadata remains valid.
Disabling expiry would abandon freeze protection and is rejected. A disconnected client
cannot learn about a revocation published after its bundle was fetched; no offline design
can make that claim. Package-manager hashes and transaction authority remain additional
channel evidence, not replacements for TUF.

## Provisioning integration

The distribution crate constructs a non-cloneable `VerifiedDistributionRelease` only
after TUF verification and exact target selection. The product provisioning transaction
consumes or uniquely borrows that authority, the installation guard, the exact
unpublished-generation authority, and pending dashboard-credential authority. It then
constructs the private manifest inputs, verifies the complete installed tree, and commits
the fixed receipt.

The bootstrap transaction descriptor retains the signed metadata identity and pending
credential digests, not raw authority selected by a caller. Receipt publication derives
the bootstrap-ownership fact from pending credential authority. A failure preserves every
exact authority required for retry or safe cleanup.

The receipt and TUF datastore must persist the accepted release/metadata versions needed
for downgrade policy. Ordinary updates reject older trusted versions. An explicit rollback
operation may select a retained prior generation only through receipt-bound rollback
authority; it does not cause the client to forget its highest trusted metadata versions.

## Verification gates

- Verify real TUF repositories through filesystem transport with strict metadata and root-
  update limits.
- Prove wrong root, insufficient threshold, expired metadata, version rollback, removed or
  mixed roles, target substitution, size drift, digest drift, wrong target, and unexpected
  target names fail closed.
- Persist and reopen root, timestamp, snapshot, targets, and latest-known-time state.
- Prove sequential dual-authorized root rotation and reject skipped or singly authorized
  roots.
- Prove a complete fetched bundle verifies without network access and an expired one does
  not.
- Prove shell and PowerShell invoke the same bounded helper rather than parsing metadata.
- Prove a verified distribution authority cannot be cloned, serialized, or constructed
  from candidate values and is consumed by provisioning.
- Keep real Sigstore/GitHub attestation verification as a release audit gate, separate from
  activation authority.

## Risks and prerequisites

- Production key generation, custody, recovery, and the initial signed root require an
  explicit maintainer ceremony outside the repository. Coding cannot manufacture this
  authority honestly.
- A one-person targets threshold cannot resist compromise of that release key. Root
  separation permits recovery but does not retroactively protect clients that installed
  malicious, still-valid targets metadata.
- Metadata expiry creates an operational duty to publish timely timestamp/snapshot
  metadata and an honest failure mode for old offline bundles.
- `tough` adds a substantial dependency closure. The isolated crate must pass license,
  vulnerability, target-matrix, binary-size, and resource-bound review before adoption.
- TUF authenticates distribution metadata and bytes. It does not remove SmartScreen or
  Gatekeeper warnings and is not Windows Authenticode, Apple Developer ID, or notarization.
