---
tags:
  - '#audit'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-20'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# `a2a-product-provisioning` audit: `W01 P01 S01 registration review`

Status: PASS

## Scope

Audited `W01.P01.S01` workspace registration, lockfile entry, new
dependency-free crate scaffold, Step Record, and feature-index update against
the accepted ADR, research, reference, and L3 plan. Pre-existing frontend and
RC-UX changes were excluded.

## Findings

No critical, high, or medium findings.

### feature-index-refresh | low | Review scaffolding makes the generated feature index temporarily stale

The index correctly includes the S01 execution record and every document that
existed when it was regenerated. This audit is a later sixth feature document,
so the index requires one final regeneration. This is review-process staleness,
not an S01 implementation defect.

## Recommendations

- Regenerate the `a2a-product-provisioning` feature index after persisting this
  audit.
- Proceed without executor revision.

## Verification

- `vaultspec-product` resolves as workspace version `0.1.4`, Rust edition 2024,
  with one library target and zero dependencies.
- The workspace dependency is path-only and follows the existing internal-crate
  convention.
- `Cargo.lock` changes only by adding the dependency-free package entry.
- The crate inherits workspace metadata and lints, including
  `unsafe_code = "forbid"`.
- No S02 dependencies or S05 module exports leaked into S01.
- Cargo metadata, focused check and test, warning-denied Clippy, workspace format,
  `just dev lint all`, and `git diff --check` passed independently.
- Plan validation reports only the intentional plan-wide `PLAN022` warning.

## `W01 P01 S02` dependency review

Status: PASS

No critical, high, medium, or low findings were identified. The declaration
reuses the existing compatible serialization, SHA-256, file-lock, and Unix
signal versions, adds the smallest safe process-inspection and Windows process
group surfaces, and leaves serialization byte caps as explicit implementation
invariants.

Source inspection confirmed that `command-group` creates the Windows child
suspended, assigns it to a Job Object before resumption, and exposes whole-job
termination through a safe public API. Dependency-internal system calls do not
breach the product crate's workspace-wide unsafe-code prohibition. Targeted
dependency trees confirm Windows activates `command-group` without `nix`, Unix
activates direct `nix` 0.29 without `command-group`, and macOS resolves the
expected Core Foundation and IOKit process-inspection closure.

The lock-only `nix` 0.27 edge belongs to `command-group`'s inactive Unix
implementation and is never active alongside direct `nix` 0.29 on a supported
target. `sysinfo` requires Rust 1.95, below the workspace's Rust 1.96 floor.
No ACL mutation dependency or later product contract was introduced.

Focused Windows and Linux checks, tests, warning-denied Clippy, formatting,
target-specific feature trees, duplicate inspection, dependency policy,
repository lint, and scoped diff validation passed independently. The focused
crate currently has zero tests, which is appropriate for this declaration-only
step.

## `W02 P04` seated-lifecycle review

Status: APPROVED

### Scope

Reviewed the seated-lifecycle attachment work: the ten steps `S27`, `S28`,
`S29`, `S32`, `S33`, `S34`, `S45`, `S46`, `S47`, and `S48`, landed as commits
`c9745f2526` (code) and `a982834105` (execution records), plus the review
follow-up `bc6461c9a6`. `S30` and `S31` (the `/ops/a2a` discovery cutover) were
deliberately excluded, held off a concurrent session's uncommitted run-start
idempotency WIP in `routes/ops/a2a.rs` to avoid clobbering it. Other sessions'
concurrent working-tree changes were excluded.

### Findings

No critical or high findings. The security classes that shipped a high in every
prior phase of this campaign were all clean here.

- No attach-token leak: `ResolvedEndpoint` carries a redacting `Debug`, the
  token only feeds `ControlClient`, and every projection (boot log, CLI,
  stream facts, handshake) emits endpoint/pid/generation/ownership only.
- Foreign gateways are never mutated: `guard_owned_mutation` refuses the
  foreign-attachable and foreign-immutable branches with no spawn, and both CLI
  `stop`/`remove` gate through it; proven live by the foreign-immutability test.
- Guard branching is correct (the prior cold-state high): cold/absent permits,
  owned-live permits, owned-stale returns stale-unproven, foreign refuses, and
  an authorize check (receipt + ownership) is required in every permit branch.
  No entropy is minted in this diff.
- Wire contract clean: the agent tier is seeded degraded-honest in the shared
  engine-query helper and always present; the API overlay only flips to
  available on a real classification; no hand-built envelopes.
- Resource bounds clean: the owned gateway is spawned stdio-nulled into its own
  process group / job object and terminated on a bounded graceful-to-force
  deadline; the control client carries connect/read timeouts; reconcile runs on
  a blocking pool and is panic-tolerant.
- Test integrity clean: the `S34` capsule proofs drive real loopback sockets, a
  real reaped dead pid, and the capsule's own bundled interpreter, and skip
  with a stated reason only when the capsule environment variable is absent.

### medium (remediated) | per-response agent-tier resolution did unmemoized blocking fs

The response envelope funnel resolved the agent tier and the handshake on every
served response, fanning out to roughly seven blocking filesystem reads
(paths derived twice, discovery JSON read three times, receipt read two to three
times) on the async runtime, unmemoized while the sibling core and rag version
probes are memoized. Remediated at `bc6461c9a6`: a single-pass
`compute_agent_snapshot` derives paths once and reads the receipt and discovery
once, building both projections from the read state, behind a one-second-TTL
`resolve_agent_snapshot` memo. The TTL is far below the discovery-freshness
window, so a gateway going down still degrades promptly. Verified: build, format,
library clippy, and the four touched-scope filters (18/0) green; the follow-up
commit is a single pathspec file.

### handoff-reference-path | low | Foreign discovery path is read unvalidated

`ForeignAttachable` reads `discovery.handoff_reference` as an unvalidated path
from a foreign-authored discovery file. The machine-local trust boundary makes
it acceptable (no leak of our secrets), but a path bound would harden it.
Tracked as a non-blocking follow-up.

### sigkill-orphan | low | Hard kill of the dashboard can orphan the owned gateway

A hard SIGKILL of the dashboard bypasses `Drop`, so the owned gateway can be
orphaned; the process-group / job-object containment mitigates this, and the
graceful and signal paths are covered. Tracked as a non-blocking follow-up.

## Recommendations

- Proceed; the medium is remediated at `bc6461c9a6` and the two lows are tracked
  as non-blocking follow-ups.
- Complete `S30`/`S31` once the concurrent `routes/ops/a2a.rs` run-start WIP
  commits, dual-resolving (product-controller authenticated discovery preferred,
  service-file plus machine-bearer fallback) and proving the live `/ops/a2a`
  edge end-to-end before ticking, so the discovery cutover hardens the working
  team-run edge rather than regressing it.
- Regenerate the `a2a-product-provisioning` feature index after persisting this
  audit.

## Verification

- Review scope enumerated from `c9745f2526` and `a982834105`; the memo
  remediation confirmed at `bc6461c9a6` (+175/-65, single pathspec file).
- The ten in-scope steps landed green at commit time: api library 870 passed,
  the four touched-scope filters (`a2a_lifecycle`, `a2a_runtime_identity`,
  `route_inventory`, `bearer_gate`) 18/0, clippy `--all-targets -D warnings`,
  and format all clean.
- The `S34` real-capsule proofs ran (not skipped): the capsule's own interpreter
  was extracted, a real owned process spawned, and bounded owned-tree
  termination and real-manifest entrypoint resolution proven.
- At remediation time the full library carried one unrelated failure and
  `--all-targets` one unrelated lint, both attributed by independent inspection
  to concurrent untracked working-tree WIP (`routes/ops/a2a_tests.rs` run-start
  replay; `vaultspec-product/src/generation.rs` unneeded-return) and provably not
  the reviewed change, whose scope matches no run-start or generation symbols.

## `W01.P01.S04` complete release-set schema review

Status: PASS AFTER TWO REVISION CYCLES.

The first review rejected a declarative cohort digest with no recomputable
preimage and a complete file table that would have required the installed
manifest to digest itself. The second review rejected an underspecified
external descriptor serialization plus path, migration, and zero-size evidence
bounds. Those rejected snapshots remain useful evidence for why structural
schema validity alone was insufficient.

The accepted `2.0` member contract removes both cycles. Each target member
carries a common cohort id and an exact ordered five-target roster but no cohort
digest. The closed external `CohortDescriptor` binds the five raw member-manifest
SHA-256 digests in canonical target order. Its receipt-bound cohort digest is
SHA-256 over exactly its RFC 8785 JSON Canonicalization Scheme UTF-8 bytes, with
no byte-order mark or trailing bytes. The release manifest is the sole installed
file-table exclusion and its raw bytes are instead bound by candidate/cohort
authority and later the active receipt.

The schema requires independently trusted component-lock comparison and binds
the dashboard, updater, component manifest, capsule archive, installed-tree
evidence, runtimes, protocol, state range, license evidence, software bill of
materials, and every other immutable installed regular file. It closes the
gateway version to `v1`, rejects floating migration selectors, enforces the
producer's path and 80,000-file bounds, and rejects zero-byte principal
artifacts.

Independent final review found no critical, high, or medium finding. JSON,
Draft 2020-12 meta-schema, representative member and descriptor, adversarial
ordering/digest/version/path/migration/size cases, and diff checks passed. The
reviewed schema SHA-256 is
``2215407E43A7639C8BA800BE963D8200760833967A1720A47D20E1B03BCA5233``.

This closes S04 only. S06 must enforce trusted-byte and cross-field joins; S08
must bind member and cohort digests into a separately durable active receipt;
S166 must build all five unique target members and emit the descriptor. No
release or target certification is authorized by this schema step.

## `W01.P01.S06` complete release-set verifier review

S06 now separates raw candidate input from an opaque product authority and
constructs a non-cloneable verified release value only after the member,
component lock, external five-target cohort, installed generation, capsule,
runtime, entrypoint, artifact, inventory, and installed-tree facts join.
External callers cannot manufacture the expected target or digest anchors from
candidate bytes.

The first formal review withheld the implementation for five material reasons:
semantic capsule and tree files were reopened without rebinding them to the
initial scan, raw public expected digests permitted self-authorization, stable
entrypoint programs were not proved present, capsule `2.0` accepted migration
heads other than `0008`, and reread/fanout bounds were incomplete. The revision
binds every semantic reread to its first size/digest/mode observation, compares
complete initial and final generation snapshots including full Windows
`FILE_ID_INFO` root identity, makes authority inputs opaque, proves both
entrypoints with executable tree evidence, fixes migration compatibility, and
bounds growth and directory discovery.

Independent known vectors pin the cohort JCS and A2A tree preimages without
calling mirrored test logic. Real-filesystem cases cover missing and extra
files, same-size drift, growth, aliases, missing gateway and standalone MCP
entrypoints, non-executable evidence, artifact drift, cohort skew, and
candidate-lock substitution. Focused tests passed 10/0, the product library
passed 48/0, test compilation passed, and formatting/diff checks were clean.
Two independent final reviews found no critical, high, or medium finding.

This closes S06 as a complete verified snapshot, not as receipt activation.
S162 must retain the exact unpublished-generation authority through S08 receipt
durability under the S10 lock. S64/S65 remain responsible for substantive
license and software-bill-of-materials completeness, and S166 must validate all
five actual member documents before publication.

## `W01.P01.S10` installation-authority review

Status: PASS

S10 now joins a crash-released operating-system lock to one fixed, bounded
owner claim and retains the product root, transaction directory, lock, claim,
bytes, owner, process, and start-time identities for the whole guard lifetime.
The gateway is rejected before lock access. Recovery requires the same owner
and a positively dead or different process instance; zero, inaccessible, or
otherwise inconclusive evidence remains busy.

The initial formal review withheld the implementation for an implicit escape
from the workspace unsafe prohibition, path-based Unix authority, binary
process proof, swallowed cleanup failures, and a no-op subprocess helper. D9
accepted one narrow Windows-only FFI wrapper. The revision made that exception
compile-visible, added explicit release and bounded Drop diagnostics, replaced
the helper with a real assertion, enforced current-owner `0700` Unix state, and
introduced tri-state process observation. Manual review and re-review found two
remaining highs: an enumerated zero start time still authorized recovery, and
Unix operations retained a parent handle without using it descriptor-
relatively. The final revision routes zero through a real OS probe and anchors
all Unix create/open/stat/link/unlink operations to the retained handle through
safe exact `rustix` APIs.

The existing seated lifecycle caller was also a required review revision. It
now uses fallible release on every exit, accepts stale-discovery removal only on
success or `NotFound`, holds the guard through startup, and reports a bounded
degraded result if release is incomplete. A real Windows share-denial test
proves failed discovery removal prevents startup.

Windows and Linux target checks, strict wrapper Clippy, strict Linux product
Clippy, four unit tests, fourteen named real lock/process integration tests,
the API success and failure-path tests, formatting, and diff checks passed. The
complete
S11 test binary later passed 23/23. Independent final reviews reported no
critical, high, medium, or low finding in either S10 production or the API
integration. S10 closes the transaction authority, not receipt activation:
S08 and S162/S163 remain required before S11 and complete product activation can
close.

## `W01.P01.S167` fixed receipt-journal review

Status: RESOLVED. Original review verdict: REVISION REQUIRED.

### windows-hard-link-alias | high | A pre-existing Windows hard-link alias does not fail closed

The Windows retained-handle validation rejects reparse points and identity
changes, but unlike the Unix branch it never requires a single link. Therefore
an `active-receipts.v1` file that already has another hard-link name can pass the
guarded sync, close, no-follow reopen, proof resolution, and settled selection.
The Windows test proves only that the retained share lease blocks mutation after
selection; it creates a hard-link alias successfully while the selected result
is live and does not prove rejection of an alias that predates the read. This
contradicts D10 and the S167 Step, which require aliases to fail closed. The
documented S168 parent-directory residual does not amend that explicit S167
acceptance condition.

## Recommendations for `W01.P01.S167`

- Require and revalidate a Windows retained-file link count of exactly one at
  every identity/size validation boundary, with a real pre-existing-hard-link
  rejection test, before accepting S167.
- If safe S167 code cannot observe the link count, revise the governing
  architecture and hard-chain ordering explicitly rather than treating an
  alias-acceptance gap as an implementation note.

### `windows-hard-link-alias` remediation

Remediation status: PASS. The D9 wrapper now queries `FILE_STANDARD_INFO`
through the exact retained file handle and returns only a copied `u64` link
count. The private FFI uses an aligned, exactly sized `MaybeUninit` output,
checks the Win32 result before initialization, and exposes no pointer, raw
handle, pathname operation, or receipt policy. Its real-filesystem test observes
the retained handle move from one link to two and back to one.

The receipt reader now requires exactly one Windows link in the same retained-
handle validation that checks file identity, type, size, and reparse status.
That validation runs on initial open, after synchronization, on no-follow
reopen, after the bounded read, and whenever guarded state is borrowed. A real
pre-existing-hard-link test now fails before selection. The live-alias test also
proves that a later hard link invalidates the next state access while retained
share leases deny writes and deletion through every name. A borrowed state
cannot outlive the read object or its handles, and `ActiveReceipt` remains
non-cloneable with no owned authority extraction path.

The wrapper unit test passed 1/1, the focused receipt tests passed 22/22, strict
wrapper all-target Clippy passed, and scoped diff checking was clean. Strict
product-library Clippy initially reached the reviewed code but remained red on
the unrelated concurrent `generation.rs` `needless_return` finding; no S167 or
D9 wrapper warning was reported. Final verification isolated that pre-existing
lint with `-A clippy::needless-return`: strict S167 product Clippy passed, all 68
product library tests passed, and both affected crates passed an
`x86_64-unknown-linux-gnu` compile check.

## `W01.P01.S168` retained directory-authority review

Status: PASS after revision.

### component-grammar | high | The initial safe validator admitted Win32-reserved names

The first implementation rejected empty names, dot components, separators,
alternate data streams, prefixes, NUL, and overlong UTF-16. It still admitted
control characters, reserved punctuation, trailing dots or spaces, and DOS
device basenames before an extension. Those aliases could make the safe
single-component claim disagree with Win32 namespace behavior.

The revision rejects the full approved set before FFI, including case-insensitive
`CON`, `PRN`, `AUX`, `NUL`, `COM1` through `COM9`, and `LPT1` through `LPT9`.
Independent follow-up review also identified Microsoft's compatibility spellings
with superscript digits: `COM¹`, `COM²`, `COM³`, `LPT¹`, `LPT²`, and `LPT³`.
The final invariant UTF-16 comparison rejects those basenames before extensions
without locale-sensitive folding. Real tests exercise both safe child methods
against every class and create, reopen, compare, and remove valid Unicode and
non-reserved lookalike names.

### native-error-loss | medium | Unmapped NTSTATUS values lost their original identity

The initial conversion replaced an out-of-range native mapping with a generic
integer error. The revision uses `RtlNtStatusToDosError` for mapped failures and
retains the exact hexadecimal NTSTATUS in an owned diagnostic when the mapping
returns `ERROR_MR_MID_NOT_FOUND` or cannot fit a Win32 error. A real conversion
call verifies the unmapped path without replacing native code.

### write-share-evidence | medium | The first competing-open probe used a non-conflicting access bit

Windows permitted a competing open that requested only `FILE_WRITE_ATTRIBUTES`
while the authority shared reads. The test now requests
`GENERIC_WRITE | FILE_WRITE_ATTRIBUTES`, which includes directory mutation
authority. The competing open fails during retention and succeeds after drop.
Real rename, delete, and ancestor-substitution operations prove the delete-share
boundary independently.

The final unsafe review found no raw handle, pointer, native buffer, generic
flag, arbitrary path, recursive delete, or product policy in the safe API.
`NtCreateFile` receives only stack-bounded pointers whose referents outlive its
synchronous call. A successful returned handle transfers exactly once into
`File`; failure converts the returned NTSTATUS rather than consulting stale
last-error state. Each safe result validates the retained handle for directory
type, directory attribute, zero reparse tag, live delete state, and nonzero
full-width identity. Cleanup consumes immediately after successful disposition;
failure returns the same owned authority and source error.

All 10 native tests, strict all-target Clippy, Windows and Linux target checks,
formatting, scoped diff checking, and the forbidden-test-technique scan passed.
No critical, high, medium, or low finding remains open.

## `W01.P01.S169` retained unpublished-generation authority review

Status: PASS after two revision cycles.

S169 binds non-`Clone` `LockedProduct<'lock>` to the verified installation
guard and retains the product-root, generation-parent, and receipt-parent
(app-home) directory authorities. Successful creation adds the retained
unpublished-generation authority under the unique mutable product loan. Active
selection derives only from S167's separately retained fixed-journal reader;
the count is bounded to exactly eight nonactive generations, and discard
consumes only its joined authority.

### post-create-authority-loss | medium (remediated) | Validation and cleanup failure could lose the created authority

The first formal review returned NOT PASS C0/H0/M1. Retained post-create
validation or reopen failure could bypass cleanup, and the prior cleanup helper
dropped authority if exact retained cleanup failed. The repair constructs the
token before validation, routes all later failure through one consuming
finalizer, returns `Refused` after successful removal, and returns boxed
`Retained(PoisonedGeneration)` with the exact child authority and unique product
loan when removal fails. Real nonempty-retention and empty-removal regressions
exercise the production finalizer.

### unix-created-state-gap | medium (remediated) | Successful mkdirat could leave residue before exact child authority existed

The second formal review returned NOT PASS C0/H0/M1. Unix `mkdirat` could
succeed before `open_child` or `fstat` failed, bypassing the token/finalizer and
falsely returning `Refused` with a final-name residue. The repair captures a
parent-relative no-follow snapshot of device, inode, directory type, owner, and
permission bits; accepts the retained descriptor only when its full snapshot
matches; and otherwise performs only full-snapshot-checked parent cleanup.

Successful cleanup returns `Refused`. Missing or unacceptable initial state,
name loss, substitution, type/owner/mode drift, nonempty residue, or unlink
failure returns boxed `IndeterminateGenerationCreation`, retaining
`&mut LockedProduct`, product and parent authority, name, path, and combined
diagnostics without a retry, recovery, publication, or activation conversion.
Real Unix empty, nonempty, substituted-name, and permission-drift regressions
exercise this production created-state finalizer.

Unix cleanup is parent-relative and full-snapshot checked within the
cooperative same-euid/install-lock model. The POSIX `statat` to `unlinkat`
sequence retains a hostile-peer TOCTOU boundary and is not handle-exact. Windows
continues to use the S168 retained-handle relative child and consuming exact
empty-directory primitive. No raw handle, cloneable authority, recursive
deletion, caller-selected active generation, lint allowance, or unsafe surface
was introduced.

Final independent re-review reported PASS C0/H0/M0/L0. The separate Unix
architecture audit also reported PASS C0/H0/M0/L0.

Verification:

- Native product check and strict library Clippy passed with no lint allowance.
- Focused native generation tests passed 12/12; all native product library tests
  passed 79/79.
- The locked Linux `--lib --tests` target check passed and compiled all four
  Unix-only regressions without executing them.
- Strict Linux-target Clippy reached only the pre-existing, out-of-scope
  `receipt.rs:685` `let _ = identity_handle` `let_unit_value` blocker and
  reported no `generation.rs` finding.
- Formatting, scoped diff, forbidden-shape, dependency-cleanup, and
  no-unsafe-expansion checks passed.

## `W01.P01.S170` lifetime-bound release-verification review

Status: PASS.

S170 now verifies a release set only through a borrow of the exact retained
`UnpublishedGeneration<'product, 'lock>`. `ReleaseVerificationInput` no longer
accepts a candidate generation path, identifier, or member-manifest bytes. The
verified value is non-`Clone`, non-serializable, and lifetime-bound to the
retained generation, its unique mutable product loan, and the verified
installation guard.

The first bounded full scan locates exactly one member manifest by its
independently trusted digest. Only then does the verifier parse the located
bytes and require the declared manifest path to identify that same file. The
component-lock, external exact-five-target cohort, complete file inventory,
capsule, tree evidence, and installed bytes retain their existing independent
joins.

The stored final snapshot binds the canonical root and root identity, every
directory identity, and every file identity, link count of exactly one, size,
digest, and normalized executable mode. Empty directories and the member
manifest participate. `revalidate_for_activation` validates retained generation
authority before and after a fresh complete scan, then compares that scan with
the stored final snapshot.

Opaque, read-only `VerifiedReceiptFacts` retains every non-constant D10 payload
fact for S172 while keeping fields and construction private. The active
generation is borrowed from the exact retained token. Prior-seat grammar and
creation time receive explicit validation. Those facts are frozen with the
type-closed channel, ownership boolean, and consistency counter. S170 does not
construct or publish an active journal. Fixed schema, envelope sequence, proof
quorum, first-journal installation, durable publication, and recovery remain
S171/S172 work.

The scan remains explicitly bounded and final-component no-follow. Windows
checks restricted DACLs and same-handle full-width identity plus link count for
each file. Its retained generation lease prevents root substitution. Unix
retains descriptor and named-identity checks under the cooperative
same-euid/install-lock model. Child reads remain pathname-sensitive and make no
claim against a hostile same-account process that ignores the product lock.

Final independent review reported PASS C0/H0/M0/L0 on diff
`3b73aae1a5acb19b7b5847a87b20c231039fea51`.

Verification:

- Focused native manifest tests passed 18/18; all native product library tests
  passed 87/87.
- Native strict product Clippy, native product check, formatting, and scoped
  diff checking passed.
- The locked Linux `--lib --tests` target check passed and compiled the Linux
  tests without executing them on Windows.
- Strict Linux-target test Clippy stopped only at the pre-existing,
  out-of-scope `receipt.rs:685` `clippy::let_unit_value` finding. The run passed
  with only that lint exempted and reported no `manifest.rs` finding.

## `W02 P04` S30/S31 dual-resolve delta review

Status: APPROVED

Reviewed the S30/S31 delta that landed after the seated-lifecycle APPROVED
verdict: `59d140d2ed` (dual-resolve the `/ops/a2a` run edge), `e3d1b450d7`
(clippy type-alias plus the S34 foreign-handoff test to the hardened contract),
and the docs-only `6b61a7fb0b`. Files: `routes/ops/a2a.rs`, `a2a_stream.rs`,
`routes/a2a_lifecycle.rs`, `lib_tests/a2a_runtime_identity.rs`. No critical or
high findings.

- Fail-closed, no unauthenticated downgrade: `a2a_endpoint_dual` returns the
  product endpoint only on an available, parseable-port resolution, which
  `resolve_gateway` yields solely for owned-live or foreign-attachable; stale,
  incompatible, untrusted, or absent discovery falls through to the prior
  service-file plus owner-restricted handoff, itself authenticated. No path
  downgrades to an unauthenticated attach.
- No new token leak: the available branch moves the attach token straight into
  the loopback transport bearer (loopback Authorization only), identical to the
  prior handoff bearer; an unparseable port drops the token unused; the relay
  reader reads the credential once per thread, not per frame.
- Regression clean: with the product absent (current reality) both surfaces are
  byte-for-byte the prior behavior; run-start idempotency (the striped
  `A2A_RUN_START_LOCKS`, acquired before transport resolution) is untouched; the
  relay claim-producer and ring/gap/degrade single-reader-per-run are preserved.
- The S34 test change is a legitimate spec-property assertion, not a weakening:
  it still asserts the ADR-D4 property (a foreign resident is left immutable,
  nothing spawned) and would still fail on a real regression (a spawn-over-foreign
  or treat-foreign-as-owned verdict, or anything spawned); the sub-verdict shifted
  only because the product crate hardened the handoff trust to a real owner-ACL
  check a tempdir cannot satisfy on Windows.

### live-edge basis

The live UP-path end-to-end (presets to run-start to run-status to active-runs to
relay) was accepted on the behavior-preservation basis: the resident gateway was
down mid-session and the product install is absent, so the product-preferred path
is never taken in current reality and both surfaces fall through to the exact
prior authenticated path, which cannot regress the edge verified live earlier in
the session. The `live_loopback` real-socket test proves the fallback path
end-to-end, and a real product-gateway UP-path cannot exist until the install
layout is built in a later phase.

### s34-readonly-attach-coverage | low | Foreign read-only-attach sub-path no longer directly exercised on Windows

The S34 proof no longer directly exercises the foreign-attachable read-only-attach
sub-path on Windows, because it is environment-gated by the real owner-ACL check;
immutability is still proven and the read-only-attach behavior is covered by the
`resolve_gateway` unit behavior. Informational, non-blocking.

### Verification

- Gate green at review time: api library 872 passed, touched-scope 61/0
  (including `live_loopback_discovers_health_then_round_trips_active_runs` and the
  fixed foreign-immutability proof), clippy `-p vaultspec-api --lib -D warnings`
  clean (the earlier out-of-scope generation lint cleared by the product refactor).
- The earlier per-response filesystem-read MEDIUM is resolved by the
  one-second-TTL agent-snapshot memo landed at `bc6461c9a6`; the type-alias here
  is a trivial, correct refactor of that cache type.

## `W02 P05` settlement-route review

Status: APPROVED

Reviewed the attach-control terminal-settlement route (S41/S152/S153/S154):
`1de7af945e` (code) + `fd1a687ecc` (rustfmt-only fix to a2a_run_leases.rs) +
`31fd789bbf` (exec records). The cross-carried S40/S160 methods in
a2a_run_leases.rs (another lane's in-flight commit_reserved_run/maintain/v3) were
out of scope. No critical/high/medium findings.

- Auth fail-closed by construction: the handler takes `AttachControlAuth`
  (`FromRequestParts`) first, so it runs before the JSON body is read and the
  handler body is unreachable unless auth passes; failure is 401.
- Constant-time credential verify: `Credential::verify` iterates the full fixed
  64-hex secret length, XOR-accumulates, folds the length compare, no early
  return - no length/prefix timing oracle.
- Right credentials rejected: only the attach-control file is read; machine
  bearer, worker-IPC, and missing/malformed headers all 401 (all four classes
  asserted, attach-control accepted).
- Routing: /internal is out of `API_PREFIXES` (bearer_gate passes it through, as
  the gateway holds no machine bearer and self-authenticates) and out of the
  six-verb whitelist; S154 chains `INTERNAL_PREFIXES` into the SPA-fallback guard
  so a misrouted callback returns 404 JSON+tiers, never a silent SPA 2xx (the
  dangerous "gateway believes it settled" path is closed).
- settle_terminal: terminal-gated (non-terminal → 422 before any DB touch,
  INPUT_REQUIRED retained), idempotent (repeat → AlreadyTerminal), settles by
  run_id AND verifies the callback lease_id against the stored gateway_lease_id
  (mismatch or None-bound → LeaseMismatch, settles nothing), revokes exactly the
  persisted hashed bundle (cross-run isolation proven), no raw token read/stored/
  logged.
- Wire/bounds: success + error envelopes carry tiers; a 1 MiB DefaultBodyLimit
  bounds the callback body; the v2 migration is additive/ledgered.
- Tests drive the production router + real AppState + real bootstrapped
  CredentialStore + real SQLite repo, no mocks, resolving the token before/after
  to prove revocation substantively.

### settlement-error-observability | low | A swallowed DB error is reported as "no lease" with no signal

The `spawn_blocking` settlement result collapses both a task panic and a
rusqlite error into `Unknown` → a 200 `{settled:false, "no lease for run"}` that
logs nothing, conflating "operation failed" with "no lease exists". A transient
DB failure would leave the hashed bundle live until its bounded expiry with no
operator signal. Crash-safety still holds (bounded expiry + reconciliation +
the 200-always design), so it is non-blocking, but a `tracing::warn!` on the
error/panic arm is a worthwhile follow-up. Assigned as a quick fix.

### attach-cred-read-per-callback | low | verify_attach_control reads the credential file per callback

`verify_attach_control` does a filesystem read of the attach-control credential
on each callback. Low-frequency (one per terminal run), so acceptable; noted only
if that path ever becomes hot. Informational.

### Verification

- Auth matrix, routing, settle_terminal correctness, wire/bounds, and test
  integrity all confirmed by source inspection against the committed diff; gate
  was green at commit time (build + `a2a_terminal_settlement`/`a2a_settlement`
  4/0 + clippy `--lib -D warnings` + fmt).

## `W01 P01 S171` Windows first-journal installation review

Status: APPROVED

Reviewed the complete Windows-authority delta against the pre-S171 baseline
`2331f89237`, including the earlier draft swept into external consolidation
commit `78b860947f` and the final reviewed follow-up. Frozen source hashes were
`141C40FADFB6E82146FAE4D89A6CF228E3223EF2E22FB746188F56C9E69C39D3`
for `lib.rs` and
`5E5AB239E0DC1E9E717ADE46E82139FDE01EC94ABC4D997ABB3011297E79CF39`
for `os.rs`.

Formal result: PASS C0/H0/M0/L0.

- The only native replace wrapper is private and calls `MoveFileExW` with
  exactly `MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH`; pointer
  lifetimes, UTF-16 bounds, NUL termination, and immediate error capture are
  correct.
- The source is existing-only, synchronized under strict sharing, and joined
  repeatedly by full identity, size, one-link, type, reparse, and delete state.
- Bounded components, canonicalized same-directory paths, retained and named
  parent identity, and source/destination names are revalidated immediately at
  the native boundary.
- The consuming parent transition preserves continuous exact authority while
  permitting the native child mutation, then recovers and revalidates the full
  exclusive parent before interpreting the outcome.
- Windows does not permit an existing destination handle to remain open during
  replacement. The code closes it only at the final boundary, preserves its
  validated snapshot, and on native failure returns an authority only after an
  exact named reacquisition match. It never claims namespace stasis from a
  failed native return.
- Successful installation returns the recovered exclusive parent and a strict
  read-only installed authority that denies write and delete sharing for S172's
  exact reread.
- Typed before-move, failed-move, success-unverified, parent-recovery, native
  error, snapshot, and reacquisition evidence remain recoverable without
  exposing raw handles or another unsafe operation.

Verification:

- Native tests passed 21/21 on the confirmed NTFS `C:` volume; doctests passed.
- All-target check, strict library/test Clippy with warnings denied, formatting,
  and scoped diff checking passed independently.
- No fake, mock, stub, patch, monkeypatch, skip, or xfail shortcut was present.
- Source hashes remained frozen across executor, architecture-owner, and
  independent-review runs.

The wrapper explicitly does not claim protection from a hostile same-user
writer during the move-compatible transition window. S172 must exactly reread
the installed bytes before publication. S173 remains required for real
virtual-machine power-cut certification; the S171 process tests do not claim
power-loss proof.
