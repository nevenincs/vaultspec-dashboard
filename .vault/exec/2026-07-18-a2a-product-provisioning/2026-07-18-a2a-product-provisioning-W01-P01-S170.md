---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S170'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Verify a release set only through a borrow of the retained unpublished-generation authority, make the verified release set lifetime-bound to that exact generation, and retain its final filesystem snapshot plus complete receipt facts through activation

## Scope

- `engine/crates/vaultspec-product/src/manifest.rs`

## Description

- Require `VerifiedReleaseSet::verify` to borrow the exact retained
  `UnpublishedGeneration<'product, 'lock>` instead of accepting a candidate
  generation path, identifier, or member-manifest bytes.
- Revalidate the retained generation and installation guard before verification
  work and after the final filesystem scan.
- Locate exactly one member manifest by its independently trusted digest during
  the first bounded scan. Admit its declared path only after reading those
  located bytes, then require the path to match.
- Preserve the existing joins to trusted component-lock bytes, the external
  exact-five-target cohort, the complete installed inventory, the capsule
  manifest, and installed-tree evidence.
- At S170 completion, retain the final canonical root and root identity, every
  directory identity, and every file identity, link count, size, digest, and
  normalized executable mode. Include empty directories and the member manifest.
  S163 later refines the cross-scan interpretation described under Notes.
- Keep `VerifiedReleaseSet<'generation, 'product, 'lock>` non-`Clone`,
  non-serializable, and lifetime-bound to the retained unpublished generation.
- Retain the complete non-constant D10 receipt facts in opaque, read-only
  `VerifiedReceiptFacts`. Keep its fields and construction private, and borrow
  the active generation from the retained token.
- Validate prior-seat grammar and creation time, and freeze those facts with the
  type-closed channel, ownership boolean, and consistency counter.
- Expose `revalidate_for_activation` so S172 can revalidate the retained
  generation and complete final snapshot at the publication boundary.
- Add real filesystem regressions for digest-first discovery, declared-path
  mismatch, invalid receipt context, aliases, substitution, permission and
  access-control list (ACL) drift, empty-directory drift, and borrow release
  before exact discard. S163 later adds semantic-replacement and empty-directory
  refusal evidence.

## Outcome

S170 now makes release verification a lifetime-bearing authority chain. The
verified value cannot outlive or replace its retained unpublished generation,
and it carries the exact filesystem and receipt facts required by S172.

The first scan discovers the member manifest only through independently trusted
digest authority. Candidate-declared path data becomes relevant only after that
discovery and must identify the same file. At S170 completion, the stored final
snapshot covered the root, directory inventory, and every regular file,
including the member manifest. Activation-boundary revalidation compared a
fresh complete scan with that stored snapshot while retaining the generation
and installation guard.

Final independent review passed with C0/H0/M0/L0 on diff
`3b73aae1a5acb19b7b5847a87b20c231039fea51`.

## Notes

The verifier remains bounded to 32 path segments, 100,000 directories, 100,000
payload files plus the member-manifest discovery allowance, and 8 GiB of
expanded bytes. Manifest, cohort, component-lock, capsule, and tree-evidence
reads retain their narrower input limits. Paths must use the portable grammar,
and every installed object must be a regular non-link file or directory.

Regular files use final-component no-follow opens. One opened handle supplies
the identity, link count of exactly one, size, and mode observations before and
after hashing or bounded rereads. Windows also applies restricted discretionary
access control list (DACL) checks to the root and every child object.

The platform claim remains deliberately cooperative. The Windows retained lease
prevents generation-root substitution. Unix detects persistent generation-root
substitution through its retained descriptor and named identity while the
installation guard serializes cooperating writers. Child reads remain
pathname-sensitive on both platforms and do not claim protection from a hostile
same-account process that ignores the product lock.

S163 later reconciles this snapshot contract through the accepted
generation-authority decision. Exact cross-scan authority remains on the root.
Descendants compare by a closed semantic inventory, copied child identities are
scan-local evidence, and namespace-only empty directories are refused. The
original S170 review hash and verification counts below cover the pre-refinement
implementation; S163 carries the later implementation and review evidence.

S170 adds no journal writer or activation transition. S171 and S172 own fixed
schema, proof quorum, first-journal installation, durable publication, and
recovery. The completed S172 path constructs and publishes from the retained
verified value and invokes activation-boundary revalidation without rebuilding
receipt context.

Verification completed:

- `cargo test --manifest-path engine/Cargo.toml -p vaultspec-product manifest::tests --lib --locked`: all 18 focused tests passed.
- `cargo test --manifest-path engine/Cargo.toml -p vaultspec-product --lib --locked`: all 87 native library tests passed.
- Native strict `cargo clippy --manifest-path engine/Cargo.toml -p vaultspec-product --lib --tests -- -D warnings`: passed without a lint
  allowance.
- Native `cargo check -p vaultspec-product --lib --locked`: passed.
- `cargo check --target x86_64-unknown-linux-gnu -p vaultspec-product --lib --tests --locked`: passed and compiled the Linux tests without executing
  them on Windows.
- Strict Linux-target test Clippy stopped only at the pre-existing,
  out-of-scope `receipt.rs:685` `clippy::let_unit_value` finding. A rerun with
  only that lint exempted and all other warnings denied passed with no
  `manifest.rs` finding.
- `cargo fmt --manifest-path engine/Cargo.toml --all -- --check` and scoped
  `git diff --check` passed.
