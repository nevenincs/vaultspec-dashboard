---
tags:
  - '#audit'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
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
