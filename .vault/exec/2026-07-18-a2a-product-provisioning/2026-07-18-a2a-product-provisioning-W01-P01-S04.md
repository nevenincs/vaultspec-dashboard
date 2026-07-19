---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S04'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Define the complete release-set member and five-target cohort contracts

## Scope

- `schemas/release-set-manifest.json`

## Description

- Replace the incomplete draft with the closed `2.0` release-set member
  contract.
- Bind dashboard, updater, trusted component-lock join, A2A manifest, capsule
  archive, installed-tree evidence, runtimes, protocol, migration range,
  licenses, software bill of materials, and every immutable installed file.
- Exclude only the member manifest from its own file table and require its raw
  bytes to be independently bound by candidate/cohort authority and the active
  receipt.
- Define the closed external five-member cohort descriptor and its exact RFC
  8785 canonical JSON digest preimage without embedding a circular cohort
  digest back into member manifests.
- Enforce the ordered five-target roster, non-floating identities, portable
  path and resource bounds, positive artifact sizes, and strict object shapes.

## Outcome

The schema now provides a recomputable, non-self-referential product identity
for each target and for the complete five-target cohort. Draft 2020-12
meta-schema validation, representative member and cohort validation, adversarial
boundary cases, diff hygiene, and independent code review passed. The reviewed
schema SHA-256 is
`2215407e43a7639c8ba800be963d8200760833967a1720a47d20e1b03bca5233`.

## Notes

This is intentionally incompatible with the earlier unshipped `1.0` draft.
S06 must implement the cross-field, installed-byte, trusted-lock, collision,
and member-to-cohort joins; S166 must aggregate all five member digests and
emit the canonical cohort descriptor before publication. Completing S04 alone
does not authorize a target artifact or release.
