---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S163'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
  - '[[2026-07-20-a2a-generation-authority-adr]]'
  - '[[2026-07-18-a2a-product-provisioning-research]]'
---

# S163 exact-root and semantic-descendant authority proof

## Scope

Vaultspec Dashboard is distributed as one immutable release set containing the
dashboard and its Agent-to-Agent (A2A) services. An unpublished generation is
the candidate release directory before its receipt becomes active. Exact-root
authority means the installer keeps an operating-system handle to that specific
directory, not merely its path or copied metadata. S163 proves that authority
survives through activation. Within the cooperative same-user and installation-
lock threat model, cleanup never authorizes deletion of a different path occupant.

This is an internal execution and evidence record. For published installation,
startup, operational diagnostics, support reporting, and source-development
instructions, use the project README sections **Prerequisites and installation**,
**Start the dashboard**, **When a capability is unavailable**, **Status and
license**, and **Contributing**.

S163 closes two architecture gaps: pathname cleanup based on copied metadata and
cross-scan descendant identity treated as durable authority. The accepted
generation-authority architecture decision record (ADR) and product-provisioning
research contain the governing rationale and constraints. Both are linked in
this record's related-document metadata.

## Contract mapping (reference)

| Contract                  | S163 meaning                                                                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact root authority      | The retained generation root, product-derived parent relationship, and installation guard remain live and are revalidated before and after semantic scanning.                      |
| Semantic descendants      | Nested regular files compare by normalized path, ownership or access policy, single-link state, size, digest, and release mode; copied child identity is not cross-scan authority. |
| Closed directory topology | Every non-root directory must be the ancestor of an accepted regular file; namespace-only empty subtrees are refused.                                                              |
| Scan-local child identity | File identity binds same-handle reads and alias rejection. Directory identity detects persistent substitution during one scan. Neither becomes cross-scan authority.               |
| Authorized cleanup        | Exact retained child authority plus named revalidation may remove an empty generation within the cooperative threat model. Without retained authority, any residue is preserved.   |

## Implementation and proof (explanation)

| Area                            | Implementation                                                                                                                                                                                                              | Real-behavior proof                                                                                                                                                                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Generation creation and cleanup | Removed snapshot-and-pathname deletion after a successful Unix create that fails to establish exact child authority. The finalizer now retains the product loan, reports an indeterminate result, and performs no mutation. | Empty, substituted, permission-drifted, and actual child-process partial-writer residues survive without deletion authority. Exact retained empty discard removes only its generation. File, directory, and Unix symlink collisions fail closed. |
| Resource bounds                 | Kept abandoned generations in the normal inventory rather than adding a residue store or unbounded handle set.                                                                                                              | Eight nonactive generations are accepted and the ninth is refused at the declared bound. Both new child-process proofs cap runtime at ten seconds, suppress output, and kill plus reap on timeout.                                               |
| Semantic activation snapshot    | Retained exact canonical root identity while moving descendant cross-scan equality to the complete semantic observation.                                                                                                    | Same-content, same-policy file replacement is accepted. Byte, normalized release-mode, unsafe access-control-list (ACL) policy, root, and topology drift fail closed. Hard-link and unsafe-object checks remain active.                          |
| Empty topology                  | Derived the allowed directory set from accepted regular-file parent paths.                                                                                                                                                  | Empty root children and empty leaves beside populated siblings are refused.                                                                                                                                                                      |
| Unix portability                | Restored the Unix-only locking helper's module visibility after authority-module decomposition.                                                                                                                             | The complete package passed under Rust 1.96.0 in a real Debian amd64 container, including all Unix-only authority tests.                                                                                                                         |

## Outcome

S163 is complete. The product now distinguishes retained mutation authority from
bounded semantic verification: the exact generation root remains capability-bound,
and immutable descendants remain byte-and-policy-bound. No copied identity or later
pathname observation alone authorizes deletion.

Independent review passed after remediation with zero critical, high, medium,
or low findings. The required snapshot submodule is force-tracked despite the
repository's broad case-insensitive `MANIFEST` ignore pattern.

The real private-finalizer tests are the portable production-seam proof. A
production fault hook would violate the test rules. Process-global descriptor
exhaustion is nonportable and not isolated. A filesystem race would be
nondeterministic.

## Verification

- Native Windows: 95 library tests, 5 desktop-gateway tests, 5 generation-authority
  tests, 4 lifecycle-ownership tests, and 23 product-authority tests passed; 132 total,
  with no ignored tests.
- Real Linux: Rust 1.96.0 on Debian amd64 passed 96 library tests, 5 desktop-gateway
  tests, 7 generation-authority tests, 4 lifecycle-ownership tests, and 23
  product-authority tests; 135 total, with no ignored tests.
- Strict package Clippy with warnings denied, Rust formatting, the zero-baseline
  module-size gate, and `just dev lint all` passed.
- Scoped Vault frontmatter, link, placeholder, and plan checks passed. The global Vault
  check retains three unrelated pre-existing schema errors and existing warnings.

## Notes

The Ubuntu 24.04 image pull could not authenticate through Docker Desktop's credential
helper, so it produced no test evidence. The cached Debian amd64 image supplied the
real Linux execution instead.

The package's older S18 lifecycle artifacts print pre-existing no-capsule messages on
machines without a staged capsule. They report passing tests but are not counted as
S163 proof and were not introduced or weakened by this step.
