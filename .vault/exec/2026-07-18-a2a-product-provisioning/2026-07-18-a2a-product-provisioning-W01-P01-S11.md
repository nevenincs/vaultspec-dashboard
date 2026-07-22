---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-22'
step_id: 'S11'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
  - "[[2026-07-18-a2a-product-provisioning-adr]]"
---

# Verify through production APIs that one TUF-authenticated complete real generation activates only through the sealed transaction, the fixed receipt survives reopen, fallback unpublished and legacy state remain inert, dashboard credentials and bootstrap recovery preserve actor and access authority, and cross-process lock exclusion and child cleanup stay bounded

## Scope

- `engine/crates/vaultspec-product/src/provisioning/s11_chain.rs`
- `engine/crates/vaultspec-product/src/provisioning/composition.rs`
- `engine/crates/vaultspec-product/src/provisioning.rs`
- `engine/crates/vaultspec-release-fixtures/src/lib.rs`
- `engine/crates/vaultspec-product/src/materializer.rs`
- `engine/crates/vaultspec-product/src/materializer/tests.rs`

## Description

2026-07-19, original scope (`engine/crates/vaultspec-product/tests/product_authority.rs`, since corrected — see Scope above and the 2026-07-22 note below):

- Add the `product_authority` integration test exercising the production API
  against real files, credential material, an on-disk receipt, and a real second
  process.
- Prove manifest rejection: unpinned identity, target mismatch, digest drift, and
  floating `latest` each fail closed, while a capsule and release set built from
  the committed lock's pins verify.
- Prove atomic receipt activation leaves an active receipt with no interruption
  marker, dashboard-only capability creation with bootstrap retention, gateway
  read-only attach-control access plus separate worker-IPC minting, three
  distinct credential files, and owner-restricted permissions (`0600` under
  Unix). (Superseded: S175/`cc19b87926` later removed Rust worker-IPC minting
  outright — `CredentialRole` now has exactly two variants and `worker-ipc.cred`
  is Python-gateway-owned, its absence asserted negatively at five sites. The
  D6 line then cross-platformed the permission-hardening half: Windows now
  hardens the empty file's DACL to the exact protected three-principal list
  BEFORE any secret byte, the Windows counterpart `0600` had none of at the
  time this bullet was written.)
- Prove cross-process install-lock exclusion by re-invoking the test binary as a
  separate process that holds the real lock, observing the parent read the lock
  as busy with the child's advisory owner identity, then confirming the freed
  lock is acquirable after the child releases.

2026-07-22, what the integrated proof became: the sealed-activation chain
traverses ephemeral role keys → a real signed TUF repository →
`verify_distribution_with_unsealed_root` → an opaque `VerifiedDistributionRelease`
→ `ProvisioningTransaction::begin_self_install` → a real generation populated
from the verified archive → prepare/commit → the fixed journal settles →
`observe_active_release` selects it. It lives IN-CRATE by architect ruling (ADR
`0d99417c41`, `docs(adr): record that release construction is deliberately not
public (D1)`): fixture construction needs `pub(super)` canonicalization
algorithms that are private BY DESIGN, and `publish_active_receipt` stays
`pub(crate)` with exactly two production callers — widening either to relocate
the proof "would trade a real seal for a test's address." A 12-test composition
matrix (`composition.rs`) then proves crossings between layers that no single
layer's own tests can observe.

## Outcome

**This does NOT discharge D8.** D8's release matrix is an ACCEPTANCE matrix over
INSTALLED ARTIFACTS — all five targets, every applicable channel: clean and
offline install, relocation, default ACP execution, cold gateway and lazy
worker, singleton and concurrent ensure, authenticated control, compatible
foreign attach, tamper detection, drain, migration, update, rollback,
interrupted-update recovery, owner-matching stale-record recovery,
consistency-group restoration, repair, removal, channel payload parity. Nothing
in this campaign touches a single line of it; it remains OUTSTANDING and
unstarted. What is satisfied is D8's LAST CLAUSE only: real production code,
real files, real processes, no fakes, mocks, stubs, patches, skips, or
expected-failures.

DELIVERED. The integrated chain (`c75fb9cafb`) and composition matrix commits
(`e641d3c5e2`, `db694928bf`, `0a6b500242`, `fb27db3d99`, `eb98099f03`,
`6946c80168`, `fb3abcf257`) reached this final gate, independently reproduced at
closeout: `cargo test -p vaultspec-product -p vaultspec-release-fixtures -p
vaultspec-distribution-authority` — 311 passed, 0 failed, 0 ignored across every
target; `cargo clippy -p vaultspec-product -p vaultspec-release-fixtures -p
vaultspec-distribution-authority --all-targets -- -D warnings` exit 0, zero
warnings.

### Cited refusal/proof index

Every citation below was verified by reading the function body, not by matching
the name; that process caught two wrong citations, one of them the index
author's own, both corrected here (see Notes).

**Distribution link** (`vaultspec-distribution-authority/src/{tests.rs,tests_adversarial.rs}`)
— all load-bearing singles: expired role metadata `expired_timestamp_metadata_is_refused`
· missing snapshot role `missing_snapshot_role_metadata_is_refused` · mixed-version
splice `mixed_version_role_metadata_is_refused` · non-canonical cohort
`non_canonical_cohort_is_refused` · unexpected target name
`metadata_level_unexpected_target_name_is_refused` · cohort/archive digest
mismatch `cohort_archive_digest_mismatch_is_refused` · tampered archive bytes
`tampered_selected_archive_bytes_are_refused` · metadata rollback vs persisted
datastore `persistent_datastore_rejects_metadata_rollback` · root rotation +
revoked keys `persisted_root_rotates_sequentially_and_revoked_root_keys_are_refused`
· latest-known-time regression `latest_known_time_regression_is_refused` ·
product-root name substitution
`product_root_name_substitution_is_refused_before_verification` · partial
datastore fail-closed
`partial_live_datastore_fails_closed_and_partial_next_is_recovered` · malformed
complete datastore `malformed_complete_datastore_fails_closed` · member-digest
substitution `publication_refuses_member_digest_substitution` · archive
substituted post-assembly
`publication_refuses_archive_substituted_after_cohort_assembly` · extra
platform payload `staged_bundle_refuses_extra_platform_payload` ·
retained-archive same-handle mutation
`retained_archive_revalidation_detects_same_handle_mutation` · non-portable
cohort paths `publication_refuses_nonportable_cohort_paths`. Platform twins:
cross-process VERIFICATION-lock exclusion
`operating_system_lock_excludes_a_real_child_process` — separate `#[cfg(unix)]`
(`tests.rs:540`) and `#[cfg(windows)]` (`tests.rs:609`) bodies, one per
platform, each load-bearing on its own OS.

**Manifest layer** (`vaultspec-product/{tests/product_authority.rs,
src/manifest/tests.rs}`): capsule-vs-lock ACP digest drift
`manifest_rejects_digest_drift` (load-bearing single — the only direct
assertion of this comparison) · capsule target mismatch
`manifest_rejects_target_mismatch` (load-bearing single, and structurally
unreachable through the chain so nothing can back it up) · packaging coherence
vs the real lock, POSITIVE `valid_capsule_and_release_verify_against_the_real_lock`
· unpinned identity `manifest_rejects_unpinned_identity` · floating "latest"
selector `manifest_rejects_floating_latest_selector` plus an assertion inside
the unpinned-identity test — multi · installed-file digest drift,
cohort-member digest drift, `candidate_cannot_self_authorize_component_lock_or_alias_paths`,
`symlink_payload_is_rejected_before_hashing` in `src/manifest/tests.rs`.

**Receipt / journal** (`vaultspec-product/src/receipt/tests.rs`): publication
refused with ZERO mutation, four cases via
`publisher_refuses_ambiguous_or_mismatched_images_without_mutation` · exact
init-residue refusal
`first_install_refuses_a_different_exact_init_residue_without_mutation` ·
fixed-journal reopen FAILURE side `mutation_error_retains_the_exact_journal_handle`
· fixed-journal reopen SUCCESS side exercised by every successful-publish test
via `publish_active_receipt` (`publish.rs:845,992`) — multi, heavily · Windows
write/delete lease until drop
`successful_read_retains_windows_write_delete_lease_until_drop` · hard-linked
JOURNAL alias (the journal file itself, not a generation alias)
`hard_link_alias_is_rejected` `#[cfg(unix)]` +
`preexisting_windows_hard_link_alias_is_rejected` `#[cfg(windows)]` — platform
twins · permissive Windows journal ACL
`permissive_windows_journal_acl_is_rejected` · empty journal never selects
`empty_journal_never_selects_and_one_initial_slot_is_exactly_bound` · S171
failure preserves both attempts
`real_s171_failures_preserve_both_attempts_and_retry_to_success`.

**Process / subprocess bounds** (`vaultspec-product/src/`) — all load-bearing
singles: `migration/tests.rs::bounded_runner_kills_on_wall_clock_timeout` ·
`::bounded_runner_kills_on_output_cap_breach` ·
`::bounded_runner_reports_a_non_zero_exit` ·
`process.rs::terminate_tree_kills_the_owned_process_and_descendants` ·
`recovery/tests.rs::planner_covers_every_phase_and_commit_state` (pure table
test — exhaustive over the state machine, executes no recovery, touches no
filesystem) · `locking/tests.rs::gateway_is_refused_before_touching_the_lock` ·
`::installer_acquires_and_releases_on_drop` ·
`::quarantine_matches_owner_and_requires_death`.

**Composition — the crossings** (`vaultspec-product/src/provisioning/composition.rs`),
12 tests plus `d8_lock_holder_process` (hidden child helper). Every one a
load-bearing single by construction — each asserts a crossing no single layer
can observe: `the_unmutated_harness_installs_and_settles` (control; asserts
Settled AND descriptor RETIRED) ·
`a_manifest_link_refusal_leaves_the_journal_clean_and_the_descriptor_armed`
(the ordering contract's failure side — previously asserted by nobody) ·
`a_generation_swapped_between_verification_and_commit_is_refused` ·
`a_second_install_against_an_owned_product_cannot_rotate_ownership` ·
`a_verification_cannot_run_while_a_product_is_bound` ·
`expired_metadata_refuses_and_writes_no_receipt` (verification FAILS) ·
`a_foreign_target_cohort_is_refused_at_the_install_boundary_not_as_target_mismatch`
(verification SUCCEEDS, product refuses) ·
`the_receipt_selected_generation_resists_substitution_and_alias` ·
`bootstrap_is_refused_once_a_receipt_has_settled` ·
`a_malformed_credential_token_is_refused_rather_than_read` ·
`an_interrupted_bootstrap_is_classified_by_phase_and_never_auto_completes` ·
`the_install_lock_excludes_a_real_second_process_without_queueing` (the INSTALL
lock — distinct from the distribution crate's VERIFICATION lock; the only
cross-process proof it has).

**The three carried fixtures — all three stay, nothing removed:**
`valid_capsule_and_release_verify_against_the_real_lock` (a POSITIVE assertion;
a refusal matrix cannot discharge a positive) · `manifest_rejects_digest_drift`
(restored in `eb98099f03`; its doc comment records that the composition case
uses the same drift as an INDUCING INPUT while asserting the CROSSING, so
neither discharges the other) · `manifest_rejects_target_mismatch`
(unreachable through the chain, confirmed by building it both ways; under the
correct framing that is EXPECTED, not suspicious).

## Notes

- Closeout note, 2026-07-22: the exec-record verification independently
  reproduced the whole cited index against source rather than trusting the
  supplied citations, and it caught two wrong ones, one of them the index
  author's own: `assert_publication_refuses_without_mutation` is a private
  HELPER (`receipt/tests.rs:292`) whose actual owning test is
  `publisher_refuses_ambiguous_or_mismatched_images_without_mutation`
  (`receipt/tests.rs:362`); and `write_journal_range_and_reopen`
  (`src/receipt.rs:772`) is a PRODUCTION FUNCTION, not a test — the correct
  citation for the fixed-journal reopen failure side is
  `mutation_error_retains_the_exact_journal_handle`. Both corrections are
  reflected in the cited index above.
- Fixtures are derived from the committed component lock parsed by the
  production parser, never copied from a run's output, so a drift between the
  test pins and the real lock fails the build rather than passing silently.
