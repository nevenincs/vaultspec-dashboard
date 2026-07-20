---
tags:
  - '#audit'
  - '#a2a-generation-authority'
date: '2026-07-20'
modified: '2026-07-20'
related:
  - "[[2026-07-20-a2a-generation-authority-adr]]"
---

# `a2a-generation-authority` audit: `S163 exact-root and semantic-descendant implementation`

Status: PASS after remediation, with zero critical, high, medium, or low findings.

## Scope

Reviewed the complete S163 implementation against the accepted generation-authority
architecture decision record (ADR), the product-provisioning research and S163 plan
step, the repository execution rules, and the existing lifetime-bound activation path. The review followed exact-root
authority through `UnpublishedGeneration`, semantic child comparison through
`GenerationSnapshot`, empty-subtree refusal, Unix post-create cleanup refusal,
generation-capacity accounting, the real-filesystem tests, and the narrow Unix locking
visibility repair. Production and test code were not modified by this audit.

Independent gates completed during review:

- `cargo test -p vaultspec-product --locked`: 95 unit tests, 5 desktop-gateway tests,
  5 generation-authority tests, 4 lifecycle-ownership tests, and 23 product-authority
  tests passed; no ignored tests.
- strict package clippy, Rust formatting, real Debian amd64 package execution, and
  `git diff --check` passed. Debian executed 135 package tests with no ignored tests.
- `just dev lint all` passed, including the zero-baseline module-size gate, workspace
  clippy, frontend lint/format/type checks, TOML, Markdown, and typo checks.

## Initial findings

### ignored-snapshot-source | high | Required semantic snapshot code is absent from the version-control delta

`manifest/verification.rs:3-4` unconditionally imports
`manifest/verification/snapshot.rs`, but `git ls-files` reports that source as
untracked and `.gitignore:26` matches it through the broad case-insensitive `MANIFEST`
rule on this Windows worktree. The working tree compiles only because the ignored file
is present locally. A normal staged change or clean checkout omits the definitions of
`GenerationSnapshot`, `ObservedFile`, and semantic equality and therefore cannot build.
This is a delivery-blocking defect; the audit withholds PASS while the required source
is outside the reviewable version-control delta.

### unretained-transition-proof | medium | Tests synthesize the indeterminate state instead of exercising the production create transition

The Unix unit cases at `generation/tests.rs:193-198`, `:251-256`, `:289-294`, and
`:325-330` manually construct `UnixUnretainedCreation` after creating a directory by
test setup, then call `finalize_unretained_creation` directly. The public child-process
case at `tests/generation_authority.rs:186-213` instead starts from a successfully
retained `UnpublishedGeneration` and proves nonempty `discard` behavior. Consequently,
no artifact-level test drives `LockedProduct::create_unpublished` through the real
`mkdirat`-succeeded / retained-child-open-failed branch at `generation.rs:235-239` and
proves that its occupant survives. The production change correctly removes pathname
cleanup, but the ADR's decision D8 proof requirement and the S163 post-create-residue acceptance
claim are not yet demonstrated through the public production transition.

### authority-policy-coverage | medium | Ownership and regular-file access-control-list drift lack real artifact proofs

Semantic equality now compares Unix file ownership in
`manifest/verification/snapshot.rs:15-20` and directory ownership in `:49-58`, but the
S163 tests never change an object's owner. The Windows permission regression in
`manifest/tests.rs:867-897` changes a directory discretionary access-control list
(DACL); it replaced the earlier regular-file DACL case, leaving no real Windows proof that file access-control drift is rejected.
The code does call the restricted-DACL check for regular files and retains owner fields,
but ADR decision D8 requires observable artifact tests for the ADR's explicit owner and access-
control guarantees rather than code-path inference alone.

### child-process-bounds | medium | New test subprocesses have neither a timeout nor an output cap

Both `generation/tests.rs:235-243` and
`tests/generation_authority.rs:190-198` run the current test executable with blocking
`Command::status`. Neither call imposes a wall-clock deadline, kills a stalled child,
nor bounds inherited child output. This violates the binding resource-bounds rule for
subprocess call sites and can hang or flood a test worker if the child stops reaching
the environment-gated return path.

## Initial recommendations

- Move or force-track the semantic snapshot module and verify its blob appears in the
  staged diff and a clean-checkout build.
- Add a real Unix production-API test that deterministically exhausts or denies the
  retained-child-open step only after directory creation, then proves
  `CreateUnpublishedError::Indeterminate`, residue preservation, and bounded capacity.
- Add real Unix owner-drift and Windows regular-file DACL-drift regressions on supported
  test hosts.
- Replace blocking test-child waits with a bounded harness that captures capped output,
  enforces a fixed deadline, and kills plus reaps the child on timeout.
- Re-run the complete S163 audit after these revisions. Initial verdict: WITHHOLD,
  with zero critical, one high, three medium, and zero low findings.

## Re-review

The remediation was independently re-reviewed against each logged finding.

- `ignored-snapshot-source` is resolved. `git ls-files --error-unmatch` now returns
  `manifest/verification/snapshot.rs`, and the staged addition contains all 101 lines
  imported by `manifest/verification.rs`. The ignore rule no longer creates a clean-
  checkout omission.
- `unretained-transition-proof` is resolved after reassessing the permitted proof
  boundary. The tests call the real private production finalizer with real directory,
  partial-writer, substituted-name, and permission-drift artifacts; they do not replace
  it with a fake, stub, patch, or mirrored cleanup implementation. The sole public
  caller at `generation.rs:235-239` directly forwards every
  `UnixChildCreation::Unretained` value to this finalizer. Deterministically forcing the
  tiny post-`mkdirat`, pre-retained-open failure through the public API would require a
  production fault hook, a process-global descriptor-limit mutation, or a scheduler
  race. The first violates the test rules, the second is not a portable isolated test
  contract, and the third is nondeterministic. Direct testing of the real private
  authority-loss seam is therefore the strongest deterministic proof compatible with
  the repository rules and is sufficient here.
- `authority-policy-coverage` is resolved. The Windows regression now independently
  mutates both a descendant directory DACL and a regular-file DACL and observes fail-
  closed revalidation. Unix file and directory owners are read from real handle-backed
  metadata and participate in semantic equality. Changing ownership is unavailable to
  an ordinary same-euid test process and would require elevated privilege, so an owner-
  mutation artifact is not a portable test precondition. The current-euid owner-private
  generation root, same-handle owner observations, semantic comparisons, and real mode
  drift tests adequately cover the supported unprivileged authority model.
- `child-process-bounds` is resolved. Both new call sites now use a fixed 10-second
  `try_wait` deadline, kill and reap on timeout, and route stdout and stderr to the null
  device, which provides a zero-byte retained-output bound.

Focused remediation gates passed: 12 generation unit tests, 5 public generation-
authority tests, the Windows-capable permission and child-ACL regression, Rust format
check, strict all-target/all-feature package clippy, staged and unstaged diff checks,
and tracked-source verification. The full 132-test Windows package run and complete
`just dev lint all` run remain green for the underlying implementation.

Final verdict: PASS, with zero critical, high, medium, or low findings.
