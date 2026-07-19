---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S06'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Verify complete release-set bytes through opaque product authority

## Scope

- `engine/crates/vaultspec-product/src/manifest.rs`

## Description

- Parse the committed component lock, A2A capsule contract `2.0`, release-set
  member contract `2.0`, and external five-member cohort contract `1.0` with
  closed field shapes and explicit byte, cardinality, path, and expanded-tree
  bounds.
- Separate candidate bytes from an opaque `TrustedReleaseAuthority`; external
  callers cannot construct expected target, member, cohort, component-lock, or
  capsule-root authority from candidate input.
- Join the independently trusted component lock and cohort digest to the raw
  member manifest, exact five-target roster, installed component lock, capsule
  manifest, dashboard, updater, runtimes, licenses, software bill of materials,
  archive, tree evidence, and every declared immutable regular file.
- Scan the complete generation twice, retain the root identity in each
  snapshot, reject aliases and special files, and rebind every semantic reread
  to the first size, digest, and normalized mode observation.
- Require both stable A2A entrypoint programs to exist in the installed-tree
  evidence with executable mode, and close compatibility to gateway `v1` and
  migration head `0008`.

## Outcome

The parser now produces a non-cloneable `VerifiedReleaseSet` only after all
candidate, trusted-byte, cohort, filesystem, artifact, runtime, entrypoint, and
tree joins succeed. It is explicitly not standalone activation authority:
receipt commit must additionally retain the S162 unpublished-generation
authority and the global installation lock.

The first formal review rejected public raw trust anchors, unbound pathname
rereads, missing entrypoint joins, permissive migration heads, and growth and
directory-fanout bounds. The revised implementation closed each finding. Two
independent final reviews reported no critical, high, or medium finding.

Verification completed on the revised tree:

- focused manifest tests: 10 passed, 0 failed;
- complete `vaultspec-product` library tests: 48 passed, 0 failed;
- `cargo check -p vaultspec-product --tests`: passed;
- manifest formatting and diff checks: passed;
- non-strict scoped Clippy: no `manifest.rs` warning; strict Clippy remains
  blocked only by the unrelated pre-existing `generation.rs` warning.

## Notes

- S162 must supply retained generation authority through complete receipt
  durability; the final rescan does not replace that later lifetime guarantee.
- S64 and S65 own substantive license and software-bill-of-materials coverage;
  S06 verifies every declared evidence file and byte/digest join without
  claiming content certification it does not perform.
- A2A Unicode archive paths remain fail-closed against S04's ASCII release-path
  contract until S13/S64 reconcile the producer and product-composition rules.
- S11 still owns complete v2 external integration fixtures and S166 still owns
  emission and verification of all five actual member manifests.
