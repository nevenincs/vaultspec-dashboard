---
tags:
  - '#plan'
  - '#a2a-product-provisioning'
date: '2026-07-18'
modified: '2026-07-20'
tier: L3
related:
  - '[[2026-07-18-a2a-product-provisioning-adr]]'
  - '[[2026-07-18-a2a-product-provisioning-research]]'
  - '[[2026-07-18-a2a-product-provisioning-reference]]'
  - '[[2026-07-20-a2a-generation-authority-adr]]'
  - '[[2026-07-20-a2a-distribution-trust-adr]]'
  - '[[2026-07-20-a2a-provisioning-authority-adr]]'
---

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the
       related: field above.
     - The related: field carries the AUTHORISING documents
       (ADR, research, reference, prior plan) for every Step in
       this plan. Steps inherit this chain; per-row reference
       footers do not exist.
     - NEVER use [[wiki-links]] or markdown links in the
       document body. -->

<!-- RETIRED: S08, S162 -->

# `a2a-product-provisioning` plan

## Description

Ship the dashboard and the A2A desktop profile as one pinned, receipt-bound, offline-complete, transactionally updated product across all five targets and every supported channel.

Implement the dashboard-owned half of the accepted A2A product provisioning architecture. The accepted ADR, research report, and reference packet authorize this plan; the accepted A2A desktop-profile ADR and its implementation plan define the producer-side capsule boundary.

The A2A repository owns `schemas/desktop-capsule-manifest.json`, deterministic target capsules, migration and gateway entrypoints, the caller-owned standalone MCP entrypoint, and the downstream `/v1/runs` prepare/commit contract. The dashboard owns the exact A2A commit and artifact-digest lock, the complete release-set manifest, bootstrap ownership capability, attach-control credential, lifecycle job plane, dedicated run-token lease repository, fixed six-member `/ops/a2a/{verb}` whitelist of five control verbs plus bounded active-run discovery, attach-control-authenticated internal terminal-settlement route, external updater, product trees, installers, channel metadata, UI, and release gate. Worker IPC remains gateway-created and confined to gateway-worker traffic. The dashboard consumes the capsule as an opaque versioned artifact and rejects mismatch, floating identity, or runtime dependency resolution.

This is an L3 plan because six ordered subsystem waves and two coordinated repositories require multi-session execution and hard release gates. L4 is not selected because no external project-management artifact was supplied, and the plan does not invent one. Every implementation and certification test uses production code with real files, locks, sockets, processes, databases, capsules, installers, or package managers; fakes, mocks, stubs, patches, skipped cases, and mirrored business logic are outside the acceptance contract.

## Steps

The six Wave blocks below are the canonical L3 execution structure. Update Step checkboxes only through the plan CLI between execution runs so append-only identifiers and completion state remain auditable.

## Wave `W01` - establish product authority and lifecycle substrate

Define the dashboard-owned release-set, receipt, credential, lock, process, and bounded job contracts while the A2A repository delivers its desktop capsule and state boundary; every later wave depends on this authority substrate.

### Phase `W01.P01` - pin and validate product identity

Dispatch to vaultspec-high-executor to establish the tracked component lock, release schema, immutable path authority, complete receipt, credentials, and installation lock.

- [x] `W01.P01.S01` - Register the reusable dashboard product-contract crate for API, CLI, updater, and release-tool consumers; `engine/Cargo.toml`.
- [x] `W01.P01.S02` - Declare bounded serialization, digest, file-lock, process, and platform dependencies for product lifecycle authority; `engine/crates/vaultspec-product/Cargo.toml`.
- [x] `W01.P01.S03` - Pin the exact A2A source commit and release identity plus emitted capsule artifact, CPython 3.13, Node 22, and ACP 0.59.0 digests without floating, latest, or runtime resolution; `packaging/a2a-component.lock.json`.
- [x] `W01.P01.S04` - Define the dashboard-owned complete release-set schema with required installed-file digests and trusted component-lock capsule-manifest capsule-archive tree-evidence dashboard updater license software-bill-of-materials and exact-five-target cohort identities; `schemas/release-set-manifest.json`.
- [x] `W01.P01.S05` - Expose only stable product contract, lifecycle, update, and build-tool modules to dashboard consumers; `engine/crates/vaultspec-product/src/lib.rs`.
- [x] `W01.P01.S06` - Parse and verify the component lock capsule manifest complete release-set installed-byte evidence and exactly five unique target cohort members while rejecting self-authorizing candidate locks unpinned identities target mismatch digest drift and floating selectors; `engine/crates/vaultspec-product/src/manifest.rs`.
- [x] `W01.P01.S07` - Derive product-owned install, generation, app-home, transaction, staging, snapshot, and updater paths without accepting client paths; `engine/crates/vaultspec-product/src/paths.rs`.
- [x] `W01.P01.S09` - Let dashboard bootstrap alone create and retain the ownership capability plus attach-control credential, permit the gateway to read attach-control for dashboard control and settlement callbacks, require the gateway to create a separate worker IPC credential used only between gateway and worker, and forbid aliases or secret-bearing discovery; `engine/crates/vaultspec-product/src/credentials.rs`.
- [x] `W01.P01.S10` - Enforce installation transaction locking only for installer and copied-updater authority bind every guard to the canonical product lock identity require lock-first mutation ordering and owner-matching stale-state quarantine and forbid the gateway from acquiring or waiting on the lock; `engine/crates/vaultspec-product/src/locking.rs`.
- [ ] `W01.P01.S145` - Run a producer-consumer contract workflow that emits the real A2A desktop capsule manifest and target archive, then validates both with the dashboard production parser; `.github/workflows/a2a-product-contract.yml`.
- [x] `W01.P01.S146` - Declare the explicit five-target by channel support matrix with payload type, installer authority, updater authority, downgrade path, rollback path, and unsupported reason; `packaging/a2a-support-matrix.json`.
- [ ] `W01.P01.S147` - Execute phase-zero clean-machine Scoop install, upgrade, real manager-owned downgrade, repair, and uninstall proofs before the Scoop channel remains supported; `.github/workflows/a2a-channel-feasibility.yml`.
- [ ] `W01.P01.S149` - Execute phase-zero clean-machine WinGet install, upgrade, real manager-owned downgrade, repair, and uninstall proofs before the WinGet channel remains supported; `.github/workflows/a2a-channel-feasibility.yml`.
- [ ] `W01.P01.S148` - Gate channel implementation and publication on the phase-zero support matrix, marking failed channels unsupported and requiring an ADR revisit instead of metadata-only certification; `packaging/a2a-support-matrix.json`.
- [x] `W01.P01.S167` - Establish the fixed two-slot receipt journal and three non-selection logical proof replicas with two alternating subrecords each, synchronize and reopen before resolving the higher valid subrecord and two-of-three proof quorum, select the highest receipt sequence only after all logical replicas normalize to retired, reject proof ties overflow ambiguity aliases and unproved damage, validate active proof bound to the journal prior envelope target preimage next sequence and intended envelope, expose a bounded no-follow reader under the verified installation guard, and add no activation writer; `engine/crates/vaultspec-product/src/receipt.rs, engine/crates/vaultspec-product/src/paths.rs, engine/crates/vaultspec-windows-authority/src/lib.rs, engine/crates/vaultspec-windows-authority/src/os.rs`.
- [x] `W01.P01.S168` - Extend the D9 Windows authority boundary with retained non-reparse directory handles, full-width directory identity, narrowly retained-handle child traversal, and exact retained-directory cleanup required by unpublished generation authority, with real Windows full-width identity reparse rejection substitution share-denial cleanup and error tests plus independent unsafe review; `engine/crates/vaultspec-windows-authority`.
- [x] `W01.P01.S169` - Bind a non-clone retained LockedProduct authority to the verified installation guard, retain product generation-parent receipt-parent and unpublished-generation filesystem identities, reject the active generation, exclusively create its final owner-private no-follow name, derive the exact maximum-eight nonactive count through the active reader, and return removed or retained poisoned authority from identity-safe bounded discard; `engine/crates/vaultspec-product/src/generation.rs`.
- [x] `W01.P01.S170` - Verify a release set only through a borrow of the retained unpublished-generation authority, make the verified release set lifetime-bound to that exact generation, and retain its final filesystem snapshot plus complete receipt facts through activation; `engine/crates/vaultspec-product/src/manifest.rs`.
- [x] `W01.P01.S171` - Extend the D9 Windows authority boundary with the sole safe same-directory first-journal installation operation backed by MoveFileExW replace-existing and write-through flags, rejecting cross-directory reparse and non-regular operands, with real certified local-NTFS tests and independent unsafe review; `engine/crates/vaultspec-windows-authority`.
- [x] `W01.P01.S172` - Construct an opaque active receipt only from a consuming unique-borrow lifetime-bound verified release set, retain the exact verified journal and Windows installation authorities on every non-success, durably publish by exact positional overwrite and synchronization of only the inactive fixed journal slot or by the D9-authorized first-install path, transition only the older proof subrecord then synchronize close reopen and validate one logical replica at a time, normalize all three to active before the first target byte, recover torn proof writes from quorum, preserve the prior for an unchanged empty or partial-invalid target, fail on any third complete envelope, and resume selection only after the intended target and all retired logical replicas exactly revalidate; `engine/crates/vaultspec-product/src/generation.rs, engine/crates/vaultspec-product/src/manifest.rs, engine/crates/vaultspec-product/src/receipt.rs`.
- [x] `W01.P01.S163` - Prove exact retained generation-root authority and semantic nested release equality, reject namespace-only empty directories, preserve unretained post-create residue without pathname deletion, and prove collisions substitutions partial writers exact discard and bounded abandoned generations fail closed with real filesystem objects; `engine/crates/vaultspec-product/src/generation.rs, engine/crates/vaultspec-product/src/generation/tests.rs, engine/crates/vaultspec-product/src/manifest/verification.rs, engine/crates/vaultspec-product/src/manifest/tests.rs, engine/crates/vaultspec-product/tests/generation_authority.rs`.
- [ ] `W01.P01.S174` - Implement the isolated TUF 1.0 distribution-authority crate and bounded helper that verify an exactly six-target offline repository from embedded-root authority through pinned tough 0.24.0 filesystem transport, persist rollback freeze root-continuity and latest-known-time state, and expose only opaque non-cloneable verified release authority to linked Rust consumers; `engine/crates/vaultspec-distribution-authority, engine/crates/vaultspec-release-verify, engine/Cargo.toml`.
- [ ] `W01.P01.S175` - Replace generic arbitrary-path credential access with ProductPaths-derived dashboard-only authority and a creation-free bounded foreign handoff reader, securely create retained ownership and attach-control files before secret bytes on Unix and Windows, remove Rust worker-IPC minting, and retain pending or existing ownership proof through durable bootstrap recovery; `engine/crates/vaultspec-product/src/credentials.rs, engine/crates/vaultspec-product/src/credentials, engine/crates/vaultspec-product/src/bootstrap.rs, engine/crates/vaultspec-product/src/lifecycle.rs, engine/crates/vaultspec-cli/src/cmd/a2a_lifecycle.rs, engine/crates/vaultspec-api/src/routes/a2a_lifecycle.rs`.
- [ ] `W01.P01.S176` - Implement sealed provisioning and active-release facades that consume TUF-verified distribution exact installation-lock and unpublished-generation authority sealed install provenance plus pending or existing ownership proof, derive private manifest and receipt facts, publish only through the fixed journal, expose non-authorizing settled observation, and preserve every exact authority across bounded retry or recovery; `engine/crates/vaultspec-product/src/provisioning.rs, engine/crates/vaultspec-product/src/lib.rs, engine/crates/vaultspec-product/src/manifest.rs, engine/crates/vaultspec-product/src/manifest/authority.rs, engine/crates/vaultspec-product/src/receipt.rs, engine/crates/vaultspec-product/src/receipt/publish.rs, engine/crates/vaultspec-release-verify`.
- [ ] `W01.P01.S11` - Verify through production APIs that one TUF-authenticated complete real generation activates only through the sealed transaction, the fixed receipt survives reopen, fallback unpublished and legacy state remain inert, dashboard credentials and bootstrap recovery preserve actor and access authority, and cross-process lock exclusion and child cleanup stay bounded; `engine/crates/vaultspec-product/tests/product_authority.rs, engine/crates/vaultspec-distribution-authority/tests/offline_repository.rs`.

### Phase `W01.P02` - control only the owned gateway

Dispatch to vaultspec-high-executor to implement the opaque capsule entrypoint client, secret-free discovery validation, authenticated readiness, process-tree ownership, and typed lifecycle state machine.

- [x] `W01.P02.S12` - Define typed install, ensure, start, stop, restart, repair, update, rollback, remove, doctor, readiness, and refusal contracts; `engine/crates/vaultspec-product/src/protocol.rs`.
- [x] `W01.P02.S13` - Validate secret-free versioned A2A discovery, live process identity, owner handoff reference, freshness, compatibility, and foreign immutability; `engine/crates/vaultspec-product/src/discovery.rs`.
- [x] `W01.P02.S14` - Broker bounded authenticated liveness, readiness, drain, shutdown, and lifecycle-entrypoint calls through the capsule contract; `engine/crates/vaultspec-product/src/control.rs`.
- [x] `W01.P02.S15` - Spawn only the manifest-declared gateway entrypoint and contain the owned process tree through bounded graceful and forced cleanup; `engine/crates/vaultspec-product/src/process.rs`.
- [ ] `W01.P02.S16` - Implement active-receipt-only lifecycle transitions that reject candidate or rolling-back records bind every start and mutation to the verified complete release set and preserve cold state foreign attach mutable data and standalone-MCP ownership; `engine/crates/vaultspec-product/src/lifecycle.rs`.
- [x] `W01.P02.S17` - Prove owner attach, foreign conflict, stale-owner recovery, credential separation, and lifecycle refusal with real processes, files, and sockets; `engine/crates/vaultspec-product/tests/desktop_gateway.rs`.
- [x] `W01.P02.S18` - Prove stop, repair, remove, data preservation, descendant cleanup, and bounded timeout outcomes against the real A2A desktop capsule; `engine/crates/vaultspec-product/tests/lifecycle_ownership.rs`.
- [x] `W01.P02.S86` - Keep the manifest-declared standalone MCP entrypoint inspectable but outside every dashboard start, adopt, stop, drain, and cleanup path; `engine/crates/vaultspec-product/src/lifecycle.rs`.

### Phase `W01.P03` - serve a race-free lifecycle job plane

Dispatch to vaultspec-high-executor to mount lifecycle status, run, and job routes whose hard-cap admission and component single-flight happen atomically.

- [x] `W01.P03.S19` - Depend on the product-contract crate and required bounded runtime features from the resident API; `engine/crates/vaultspec-api/Cargo.toml`.
- [x] `W01.P03.S20` - Own the lifecycle registry and controller inside AppState so tests and seated instances cannot share global mutation state; `engine/crates/vaultspec-api/src/app.rs`.
- [x] `W01.P03.S21` - Export the dedicated lifecycle route module without adding any orchestration run verb; `engine/crates/vaultspec-api/src/routes/mod.rs`.
- [x] `W01.P03.S22` - Serve typed lifecycle status, run, and job endpoints with one atomic check-and-reserve admission critical section, capped output, TTL retention, deadlines, and component-scoped single-flight; `engine/crates/vaultspec-api/src/routes/a2a_lifecycle.rs`.
- [x] `W01.P03.S23` - Mount and inventory the bearer-gated lifecycle routes separately from the fixed ops A2A namespace; `engine/crates/vaultspec-api/src/lib.rs`.
- [x] `W01.P03.S24` - Reserve the lifecycle prefix from SPA fallback routing so route mistakes fail visibly; `engine/crates/vaultspec-api/src/routes/spa.rs`.
- [x] `W01.P03.S25` - Register the lifecycle route acceptance suite in the API test module; `engine/crates/vaultspec-api/src/lib_tests/mod.rs`.
- [x] `W01.P03.S26` - Prove typed refusal, initial bootstrap, active-receipt mutation, at-cap atomic race rejection, and concurrent cross-operation single-flight using production routes and a real registry; `engine/crates/vaultspec-api/src/lib_tests/a2a_lifecycle.rs`.

## Wave `W02` - integrate authenticated gateway ownership and run admission

Consume the A2A desktop discovery, readiness, and lazy-worker contracts, wire the lifecycle plane into the seated dashboard, and preserve the fixed six-member run edge of five control verbs plus bounded active-run discovery; this wave depends on A2A desktop runtime identity and process ownership outputs.

### Phase `W02.P04` - attach lifecycle to the seated product

Dispatch to vaultspec-high-executor after the A2A desktop singleton and control protocol land, then start or attach only receipt-authorized gateways and serve one readiness model.

- [x] `W02.P04.S27` - Start or authenticate the receipt-owned gateway during seated boot and leave compatible foreign residents immutable; `engine/crates/vaultspec-api/src/boot.rs`.
- [x] `W02.P04.S28` - Report installed release set, owned or foreign gateway identity, protocol, state schema, and authenticated readiness in the component handshake; `engine/crates/vaultspec-api/src/handshake.rs`.
- [x] `W02.P04.S29` - Seed the agent tier on every response so absence can no longer masquerade as A2A availability; `engine/crates/engine-query/src/envelope.rs`.
- [x] `W02.P04.S30` - Replace token-bearing discovery and unauthenticated health attachment with the product controller's versioned authenticated endpoint resolution; `engine/crates/vaultspec-api/src/routes/ops/a2a.rs`.
- [x] `W02.P04.S31` - Resolve run streams through the same authenticated product endpoint and reject stale, incompatible, or untrusted discovery; `engine/crates/vaultspec-api/src/routes/ops/a2a_stream.rs`.
- [x] `W02.P04.S32` - Expose product installation, gateway, worker, provider, and admission facts without collapsing cold worker state into degradation; `engine/crates/vaultspec-api/src/routes/stream.rs`.
- [x] `W02.P04.S33` - Include the complete A2A product and ownership projection in the one-shot status command; `engine/crates/vaultspec-cli/src/cmd/status.rs`.
- [x] `W02.P04.S34` - Prove seated boot, authenticated attach, cold readiness, foreign immutability, stale recovery, and clean gateway shutdown against the real desktop entrypoint; `engine/crates/vaultspec-api/src/lib_tests/a2a_runtime_identity.rs`.
- [x] `W02.P04.S45` - Reuse the same typed product lifecycle authority for one-shot A2A status and mutation commands; `engine/crates/vaultspec-cli/src/cmd/a2a_lifecycle.rs`.
- [x] `W02.P04.S46` - Export the one-shot product lifecycle command module; `engine/crates/vaultspec-cli/src/cmd/mod.rs`.
- [x] `W02.P04.S47` - Expose bounded A2A lifecycle status and action subcommands without free-form executable or path operands; `engine/crates/vaultspec-cli/src/main.rs`.
- [x] `W02.P04.S48` - Make cold seat launch reconcile only the receipt-owned A2A gateway before opening the dashboard; `engine/crates/vaultspec-cli/src/cmd/launch.rs`.
- [ ] `W02.P04.S164` - Verify the receipt-selected generation against the receipt-bound release-set and component-lock digests plus every installed file digest before starting and never trust a lock supplied only by the candidate tree; `engine/crates/vaultspec-api/src/routes/a2a_lifecycle.rs`.
- [ ] `W02.P04.S165` - Prove unreceipted staged rolling-back substituted incomplete tampered and self-authorized generations remain inert while one active fully verified receipt can start the real desktop entrypoint; `engine/crates/vaultspec-api/src/lib_tests/a2a_runtime_identity.rs`.

### Phase `W02.P05` - admit runs before minting credentials

Dispatch to vaultspec-high-executor to preserve the fixed six-member dashboard whitelist of five control verbs plus bounded active-run discovery while implementing downstream prepare, bounded bundle mint, commit, dedicated durable lease storage, attach-control-authenticated internal terminal settlement, expiry, and restart reconciliation.

- [x] `W02.P05.S35` - Create a dedicated durable A2A run-token lease repository containing only token hashes, bundle identity, reservation identity, post-commit A2A run and thread identity, non-secret lease identity, expiry, and settlement state; `engine/crates/vaultspec-api/src/a2a_run_leases.rs`.
- [x] `W02.P05.S36` - Issue and revoke run-scoped token bundles only for the bounded server-validated required-role set returned by prepare, without storing raw secrets or revoking another run for the same actor; `engine/crates/vaultspec-api/src/authoring/actor_tokens.rs`.
- [x] `W02.P05.S37` - Carry the resolved token-hash lease identity with the authenticated principal while keeping the raw header value one-use and inaccessible to handlers; `engine/crates/vaultspec-api/src/authoring/principal.rs`.
- [x] `W02.P05.S38` - Resolve actor token hashes against the dedicated A2A run-token lease repository through principal extraction without adding client-claimable lease or run identity fields; `engine/crates/vaultspec-api/src/authoring/http/mod.rs`.
- [x] `W02.P05.S39` - Persist the token bundle in the dedicated repository only after commit returns the authoritative A2A run or thread id and bind it to the non-secret lease and reservation identities; `engine/crates/vaultspec-api/src/a2a_run_leases.rs`.
- [x] `W02.P05.S40` - Preserve public POST /ops/a2a/run-start as one of five control verbs in the fixed six-member dashboard whitelist while performing downstream POST /v1/runs prepare and commit variants, minting only bounded prepare-returned roles, and cancelling the reservation plus revoking on failure; `engine/crates/vaultspec-api/src/routes/ops/a2a.rs`.
- [x] `W02.P05.S41` - Accept POST /internal/a2a/run-terminal only from the gateway settlement component authenticated by the dashboard-created attach-control credential, confirm authoritative A2A status is durably terminal, idempotently record its run or thread plus non-secret lease identity, and then revoke exactly the persisted hashed bundle; `engine/crates/vaultspec-api/src/routes/a2a_settlement.rs`.
- [x] `W02.P05.S42` - Prove dedicated A2A lease-repository migration, reopen, expiry, idempotent settlement, and restart reconciliation without depending on authoring-session schemas; `engine/crates/vaultspec-api/src/a2a_run_leases.rs`.
- [x] `W02.P05.S43` - Prove two concurrent runs for one role revoke independently and no raw token enters records, output, logs, receipts, or discovery; `engine/crates/vaultspec-api/src/authoring/actor_tokens.rs`.
- [ ] `W02.P05.S44` - Prove dashboard run-start remains one of five public verbs, downstream prepare refusal mints nothing, invalid roles fail closed, commit failure cancels and revokes, attach-control-authenticated terminal callbacks settle once after durable A2A state, INPUT_REQUIRED retains the lease, and restart or expiry reconciliation revokes the exact bundle; `engine/crates/vaultspec-api/src/lib_tests/a2a_run_admission.rs`.
- [x] `W02.P05.S150` - Export the crate-private dedicated A2A run-token lease repository module without coupling it to authoring-session storage; `engine/crates/vaultspec-api/src/lib.rs`.
- [x] `W02.P05.S151` - Construct and retain the dedicated A2A run-token lease repository in AppState for seated routes and restart reconciliation; `engine/crates/vaultspec-api/src/app.rs`.
- [x] `W02.P05.S152` - Export the authenticated A2A terminal-settlement route module outside the public ops orchestration namespace; `engine/crates/vaultspec-api/src/routes/mod.rs`.
- [x] `W02.P05.S153` - Mount POST /internal/a2a/run-terminal with the dashboard-created attach-control credential, reject worker IPC and unrelated credentials, and avoid adding a sixth public /ops/a2a verb; `engine/crates/vaultspec-api/src/lib.rs`.
- [x] `W02.P05.S154` - Reserve the internal A2A settlement prefix from SPA fallback routing so callback mistakes fail visibly; `engine/crates/vaultspec-api/src/routes/spa.rs`.
- [x] `W02.P05.S160` - Implement bounded unresolved-lease reconciliation against authenticated authoritative A2A run status, retaining INPUT_REQUIRED, idempotently settling terminal runs, and revoking elapsed leases by expiry; `engine/crates/vaultspec-api/src/a2a_run_leases.rs`.
- [x] `W02.P05.S161` - Run durable A2A lease reconciliation during seated boot and bounded maintenance without delaying dashboard readiness on a temporarily unavailable compatible gateway; `engine/crates/vaultspec-api/src/boot.rs`.
- [x] `W02.P05.S155` - Prove attach-control callback authentication, worker IPC rejection, durable-terminal ordering, idempotency, exact hashed-bundle revocation, INPUT_REQUIRED retention, expiry, and restart reconciliation against the production repository and router; `engine/crates/vaultspec-api/src/lib_tests/a2a_terminal_settlement.rs`.

## Wave `W03` - deliver transactional external update and recovery

Implement the copied external updater, consistency snapshots, channel authority adapters, activation, rollback, and interruption recovery after the lifecycle and A2A migration contracts are stable.

### Phase `W03.P06` - make mutable state transactional

Dispatch to vaultspec-high-executor to snapshot every schema-bearing store as one consistency group, implement distinct self-install, Scoop, WinGet, and MSI authorities, invoke only the staged A2A migration entrypoint, and recover deterministic transaction state.

- [x] `W03.P06.S49` - Snapshot primary, checkpoint, every manifest-declared schema-bearing store, the complete receipt generation, and prior seat descriptor as one verified consistency group; `engine/crates/vaultspec-product/src/snapshot.rs`.
- [x] `W03.P06.S50` - Validate migration ranges and invoke only the staged A2A desktop migration entrypoint after complete quiescence; `engine/crates/vaultspec-product/src/migration.rs`.
- [ ] `W03.P06.S51` - Implement the self-install authority adapter so the copied updater creates and verifies final-name unpublished complete generations activates only by atomic complete receipt selection and retains the prior generation without a POSIX tree rename; `engine/crates/vaultspec-product/src/channels/self_install.rs`.
- [ ] `W03.P06.S52` - Require the copied external updater to acquire the install lock drain and stop the owned runtime snapshot and verify state run staged migration verify the final-name unpublished generation atomically select it only by the separately durable active receipt relaunch and probe acceptance in that order; `engine/crates/vaultspec-product/src/transaction.rs`.
- [ ] `W03.P06.S53` - Resolve interruption at every declared transaction boundary and recover staged, draining, snapshotted, activated, migrating, accepted, and rolling-back states deterministically from durable markers and complete receipts; `engine/crates/vaultspec-product/src/recovery.rs`.
- [ ] `W03.P06.S54` - Prove consistency snapshots restore real SQLite primary and checkpoint stores together and reject incomplete or unverified groups; `engine/crates/vaultspec-product/tests/snapshot_group.rs`.
- [ ] `W03.P06.S55` - Prove candidate failure restores files, all schema-bearing state, checkpoints, complete receipt generation, and prior seat while successful activation cannot leave a split release set; `engine/crates/vaultspec-product/tests/update_transaction.rs`.
- [ ] `W03.P06.S56` - Prove crash recovery from every durable transaction phase by reopening real transaction directories and receipts; `engine/crates/vaultspec-product/tests/interruption_recovery.rs`.
- [ ] `W03.P06.S156` - Implement the Scoop authority adapter by invoking only phase-zero-proven Scoop manager commands for pinned complete archives and never writing Scoop-owned apps, shims, cache, or bucket state; `engine/crates/vaultspec-product/src/channels/scoop.rs`.
- [ ] `W03.P06.S157` - Implement the WinGet authority adapter by invoking only phase-zero-proven WinGet package and version commands for the complete MSI and never writing WinGet or Windows Installer-owned files; `engine/crates/vaultspec-product/src/channels/winget.rs`.
- [ ] `W03.P06.S158` - Implement the MSI authority adapter by delegating install, upgrade, downgrade, rollback, repair, and removal to Windows Installer with candidate and retained prior product packages and never rewriting installer-owned files; `engine/crates/vaultspec-product/src/channels/msi.rs`.

### Phase `W03.P07` - run replacement outside the active release

Dispatch to vaultspec-high-executor to build the copied updater executable, owner-restricted descriptor handoff, dashboard exit sequence, relaunch, and Windows-safe replacement behavior.

- [ ] `W03.P07.S57` - Declare the target-specific external updater executable as a separate workspace package; `engine/crates/vaultspec-updater/Cargo.toml`.
- [ ] `W03.P07.S58` - Expose a testable updater runner that consumes one owner-restricted descriptor and delegates all authority checks to vaultspec-product; `engine/crates/vaultspec-updater/src/lib.rs`.
- [ ] `W03.P07.S59` - Parse the one-time owner-restricted descriptor outside the active release, acquire the installation lock before any drain or mutation, execute or recover the ordered transaction without delegating lock ownership to the gateway, redact secrets, and return bounded diagnostics; `engine/crates/vaultspec-updater/src/main.rs`.
- [ ] `W03.P07.S60` - Replace the Cargo Dist axoupdater-only flow with copy-out, owner-restricted descriptor handoff, helper launch, seat exit, and updater-observed relaunch; `engine/crates/vaultspec-cli/src/cmd/lifecycle.rs`.
- [ ] `W03.P07.S61` - Align update command help and refusal outcomes with complete self-install and package-manager transaction authority; `engine/crates/vaultspec-cli/src/main.rs`.
- [ ] `W03.P07.S62` - Verify with real executables that only the copied updater acquires the install lock, authenticated drain closes admission and resolves active runs plus checkpoints before owner-authorized gateway stop, runtime-singleton release precedes snapshot migration and swap, the gateway never acquires or waits on the install lock, descriptor replay fails, secrets remain redacted, and prior-seat recovery relaunches; `engine/crates/vaultspec-updater/tests/updater_process.rs`.
- [ ] `W03.P07.S63` - Prove Windows can replace both the dashboard and installed updater only after the seated processes exit; `engine/crates/vaultspec-updater/tests/windows_replacement.rs`.

## Wave `W04` - compose and publish the complete product

Bind pinned A2A, CPython, Node, and ACP inputs to each dashboard build, replace binary-only installers with offline-complete product artifacts, and publish only channels that preserve complete receipts and reversible authority.

### Phase `W04.P08` - assemble verified target product trees

Dispatch to vaultspec-high-executor to compose each dashboard build with the pinned A2A capsule and runtime inputs, generate digests, licenses, SBOM, manifests, and target-specific updater payloads.

- [ ] `W04.P08.S64` - Build and verify complete product trees inside dashboard-owned final-name unpublished generations from the tracked component lock A2A evidence dashboard binary updater licenses and software bill of materials; `engine/crates/vaultspec-product/src/bin/product_build.rs`.
- [ ] `W04.P08.S65` - Reject unpinned or floating inputs, A2A commit or artifact mismatch, target mismatch, missing payloads, digest drift, incomplete licenses, and release-set skew with real composed trees; `engine/crates/vaultspec-product/tests/product_build.rs`.
- [ ] `W04.P08.S66` - Acquire only build-time artifacts by exact pinned identity and stage the SPA without creating any runtime network dependency; `.github/release-build-setup.yml`.
- [ ] `W04.P08.S67` - Compose and retain the Apple Silicon macOS dashboard, updater, and A2A capsule as one verified release-set artifact; `.github/workflows/release.yml`.
- [ ] `W04.P08.S68` - Compose and retain the Intel macOS dashboard, updater, and A2A capsule as one verified release-set artifact; `.github/workflows/release.yml`.
- [ ] `W04.P08.S69` - Compose and retain the Arm64 Linux dashboard, updater, and A2A capsule as one verified release-set artifact; `.github/workflows/release.yml`.
- [ ] `W04.P08.S70` - Compose and retain the x86-64 Linux dashboard, updater, and A2A capsule as one verified release-set artifact; `.github/workflows/release.yml`.
- [ ] `W04.P08.S71` - Compose and retain the x86-64 Windows dashboard, updater, and A2A capsule as one verified release-set artifact; `.github/workflows/release.yml`.
- [ ] `W04.P08.S72` - Validate the component lock, release schema, product builder, and payload inventory before release jobs may run; `.github/workflows/quality-gates.yml`.
- [ ] `W04.P08.S87` - Carry and verify the independently invokable standalone MCP entrypoint in every capsule without assigning it dashboard lifecycle ownership; `engine/crates/vaultspec-product/src/bin/product_build.rs`.
- [ ] `W04.P08.S166` - Aggregate exactly one verified artifact for each of the five unique target triples enforce common A2A commit component-lock release-schema protocol and state identity verify every target archive manifest tree software-bill-of-materials and license evidence and emit the cohort digest that gates publication; `.github/workflows/release.yml`.

### Phase `W04.P09` - replace binary-only installer surfaces

Dispatch shell, PowerShell, and WiX work to vaultspec-high-executor so each installer verifies and records the whole product tree while stale Cargo Dist installers and bare Cargo channels are withdrawn.

- [ ] `W04.P09.S73` - Retain Cargo Dist for target planning, checksums, and release hosting while disabling its binary-only shell, PowerShell, MSI, and updater outputs; `dist-workspace.toml`.
- [ ] `W04.P09.S74` - Install, verify, receipt, update, and remove the complete macOS and Linux product tree from the product-owned shell installer; `packaging/install.sh`.
- [ ] `W04.P09.S75` - Install, verify, receipt, update, and remove the complete Windows product tree from the product-owned PowerShell installer; `packaging/install.ps1`.
- [ ] `W04.P09.S76` - Package every dashboard, updater, capsule, manifest, license, and SBOM file into the complete MSI with product receipt and uninstall semantics; `engine/crates/vaultspec-cli/wix/main.wxs`.
- [ ] `W04.P09.S77` - Build the product-owned MSI and installer scripts, publish only complete artifacts, and fail on any stale binary-only installer or updater; `.github/workflows/release.yml`.
- [ ] `W04.P09.S78` - Withdraw crates.io publication and bare Cargo installation metadata until a Cargo channel can preserve the composite release contract; `engine/crates/vaultspec-cli/Cargo.toml`.
- [ ] `W04.P09.S79` - Document only supported composite install and update channels, offline ownership, data preservation, and explicit cargo-install and cargo-binstall exclusion by invoking the mandatory vaultspec-documentation skill and pipeline; `README.md`.

### Phase `W04.P10` - complete package-manager channels

Dispatch Windows channel work to vaultspec-high-executor only after distinct Scoop and WinGet phase-zero proofs, then publish complete ZIP or MSI metadata without letting the updater mutate package-manager-owned files.

- [ ] `W04.P10.S80` - Install the complete Windows ZIP, record Scoop provenance, and expose only the dashboard command without dropping companion files; `bucket/vaultspec.json`.
- [ ] `W04.P10.S81` - Bump Scoop to the complete product archive and verify its digest and reversible downgrade adapter before committing the manifest; `.github/workflows/scoop-bump.yml`.
- [ ] `W04.P10.S82` - Declare the composite product identity and publisher for the WinGet package; `packaging/winget/vaultspec.vaultspec.yaml`.
- [ ] `W04.P10.S83` - Point WinGet only to the complete MSI with product scope, upgrade behavior, digest, and manager-owned rollback authority; `packaging/winget/vaultspec.vaultspec.installer.yaml`.
- [ ] `W04.P10.S84` - Provide the WinGet locale metadata and supported composite install description; `packaging/winget/vaultspec.vaultspec.locale.en-US.yaml`.
- [ ] `W04.P10.S85` - Publish Scoop metadata only when its phase-zero matrix and complete real-artifact downgrade proof pass, otherwise mark Scoop unsupported and require an ADR revisit; `.github/workflows/release.yml`.
- [ ] `W04.P10.S159` - Publish WinGet metadata only when its phase-zero matrix and complete MSI downgrade proof pass, otherwise mark WinGet unsupported and require an ADR revisit; `.github/workflows/release.yml`.

## Wave `W05` - expose lifecycle truth and controls in the dashboard

Add a stores-owned A2A product lifecycle client and a localized control panel over backend-served state after the lifecycle API is stable, without moving run control into the lifecycle namespace or letting the browser call A2A directly.

### Phase `W05.P11` - add the stores-owned lifecycle client

Dispatch to vaultspec-standard-executor to define tolerant wire types, dispatcher validation, bounded polling, query invalidation, and lifecycle projections in the frontend stores layer.

- [ ] `W05.P11.S88` - Define lifecycle status, job, operation, receipt, ownership, readiness, progress, and typed refusal wire shapes; `frontend/src/stores/server/engine/statusTypes.ts`.
- [ ] `W05.P11.S89` - Add bearer-gated lifecycle status, run, and job methods without exposing a browser-to-A2A transport; `frontend/src/stores/server/engine/client.ts`.
- [ ] `W05.P11.S90` - Add stable lifecycle status and job query identities to the shared engine key registry; `frontend/src/stores/server/queries/internal.ts`.
- [ ] `W05.P11.S91` - Validate every lifecycle dispatch as a closed typed operation with bounded data-removal intent before it reaches the engine client; `frontend/src/stores/server/a2aLifecycleActions.ts`.
- [ ] `W05.P11.S92` - Project backend-served install, ownership, gateway, worker, provider, admission, job, update, rollback, repair, and doctor state with bounded polling; `frontend/src/stores/server/a2aLifecycle.ts`.
- [ ] `W05.P11.S93` - Prove malformed operations, client path fields, free-form arguments, and implicit data deletion cannot pass the lifecycle dispatcher; `frontend/src/stores/server/a2aLifecycleActions.test.ts`.
- [ ] `W05.P11.S94` - Prove status interpretation, cold readiness, foreign immutability, job settlement, query invalidation, and bounded polling from production store functions; `frontend/src/stores/server/a2aLifecycle.test.ts`.
- [ ] `W05.P11.S95` - Prove the frontend lifecycle client drives the spawned engine and real A2A desktop capsule without a direct sibling request; `frontend/src/stores/server/a2aLifecycle.live.test.ts`.

### Phase `W05.P12` - add localized lifecycle controls

Dispatch to vaultspec-standard-executor to mount the A2A service control panel, guarded destructive actions, progress, diagnostics, and unified command-palette action without direct wire access from the app layer.

- [ ] `W05.P12.S96` - Render install, start, stop, restart, repair, update, rollback, remove, doctor, progress, ownership, and remediation from the lifecycle store projection; `frontend/src/app/panels/A2aLifecyclePanel.tsx`.
- [ ] `W05.P12.S97` - Prove cold, owned, foreign, updating, rollback, degraded, and destructive-confirmation presentations using the production panel component; `frontend/src/app/panels/A2aLifecyclePanel.render.test.tsx`.
- [ ] `W05.P12.S98` - Register the agent-service panel as a single modal identity while leaving the existing footer-chip set unchanged; `frontend/src/stores/view/controlPanels.ts`.
- [ ] `W05.P12.S99` - Define localized agent-service labels, toggle actions, and unavailable title in the canonical control-panel vocabulary; `frontend/src/stores/view/controlPanelVocabulary.ts`.
- [ ] `W05.P12.S100` - Register one unified agent-service action id and icon for panel, palette, and keymap composition; `frontend/src/stores/view/chromeActions.ts`.
- [ ] `W05.P12.S101` - Mount the A2A lifecycle panel only while its modal is open so closed panels perform no service reads; `frontend/src/app/panels/ControlPanels.tsx`.
- [ ] `W05.P12.S102` - Prove lifecycle queries mount only with the agent-service dialog and localization changes preserve panel identity; `frontend/src/app/panels/ControlPanels.guard.test.tsx`.
- [ ] `W05.P12.S103` - Add the complete localized lifecycle vocabulary, confirmations, progress, ownership, remediation, and data-preservation copy; `frontend/src/locales/en/common.ts`.
- [ ] `W05.P12.S104` - Prove the command provider exposes exactly one localized agent-service toggle through the shared action registry; `frontend/src/stores/view/commandProviders/controlPanelsCommandProvider.test.ts`.
- [ ] `W05.P12.S105` - Extend action coverage to require the agent-service lifecycle panel action on every eligible surface; `frontend/src/stores/view/actionCoverage.guard.test.ts`.
- [ ] `W05.P12.S106` - Update the control-panel inventory assertion while preserving the three intentional footer chips; `frontend/src/app/right/rail.test.ts`.

## Wave `W06` - certify every artifact and review the product boundary

Exercise the real published artifacts, operating-system processes, update paths, and package-manager adapters on all five targets, then require formal manual architecture and code review before release.

### Phase `W06.P13` - prove target and channel behavior

Dispatch real-artifact certification to vaultspec-high-executor; no fake, mock, stub, patch, monkeypatch, skip, xfail, checkout interpreter, or metadata-only assertion may satisfy these gates.

- [ ] `W06.P13.S107` - Create a production-artifact certifier that opens published archives, validates complete receipts and payloads, and executes installed commands; `engine/crates/vaultspec-product/src/bin/product_certify.rs`.
- [ ] `W06.P13.S108` - Certify clean installation from a locally staged artifact after network access is removed; `engine/crates/vaultspec-product/src/bin/product_certify.rs`.
- [ ] `W06.P13.S109` - Certify relocation preserves capsule resolution, app-home separation, receipt authority, and dashboard launch; `engine/crates/vaultspec-product/src/bin/product_certify.rs`.
- [ ] `W06.P13.S110` - Certify the pinned default ACP provider executes a real run without repository node_modules or runtime acquisition; `engine/crates/vaultspec-product/src/bin/product_certify.rs`.
- [ ] `W06.P13.S111` - Certify cold gateway readiness and first-demand single-flight worker startup with no eager worker; `engine/crates/vaultspec-product/src/bin/product_certify.rs`.
- [ ] `W06.P13.S112` - Certify the runtime singleton excludes a second gateway before bind or discovery publication; `engine/crates/vaultspec-product/src/bin/product_certify.rs`.
- [ ] `W06.P13.S113` - Certify concurrent ensure operations attach to one component job and never spawn a second mutation; `engine/crates/vaultspec-product/src/bin/product_certify.rs`.
- [ ] `W06.P13.S114` - Certify lifecycle admission rejects new work at the hard registry ceiling when no completed record is evictable; `engine/crates/vaultspec-product/src/bin/product_certify.rs`.
- [ ] `W06.P13.S115` - Certify dashboard bootstrap creates and retains ownership plus attach-control credentials, the gateway uses attach-control for dashboard control and settlement callbacks, worker IPC remains gateway-created and confined to gateway-worker traffic, and no credential alias or secret enters discovery or output; `engine/crates/vaultspec-product/src/bin/product_certify.rs`.
- [ ] `W06.P13.S116` - Certify compatible foreign attachment can run but cannot stop, repair, migrate, update, roll back, remove, or adopt the service; `engine/crates/vaultspec-product/src/bin/product_certify.rs`.
- [ ] `W06.P13.S117` - Certify digest tampering is detected and repair replaces immutable files without overwriting mutable state; `engine/crates/vaultspec-product/src/bin/product_certify.rs`.
- [ ] `W06.P13.S118` - Certify drain closes admission and bounded cleanup terminates the owned worker plus run-owned provider and MCP descendants; `engine/crates/vaultspec-product/src/bin/product_certify.rs`.
- [ ] `W06.P13.S119` - Certify compatible staged migration activates one complete dashboard and A2A release-set receipt; `engine/crates/vaultspec-product/src/bin/product_certify.rs`.
- [ ] `W06.P13.S120` - Certify candidate process or readiness failure restores prior files, complete receipt, state snapshot, dashboard, and gateway; `engine/crates/vaultspec-product/src/bin/product_certify.rs`.
- [ ] `W06.P13.S121` - Certify interruption at every declared external-updater transaction boundary recovers deterministically under the installation lock without split activation; `engine/crates/vaultspec-product/src/bin/product_certify.rs`.
- [ ] `W06.P13.S122` - Certify only a matching receipt owner can quarantine stale discovery after proving the recorded process dead; `engine/crates/vaultspec-product/src/bin/product_certify.rs`.
- [ ] `W06.P13.S123` - Certify primary, checkpoint, other schema-bearing stores, complete receipt generation, and prior seat restore as one consistent snapshot generation; `engine/crates/vaultspec-product/src/bin/product_certify.rs`.
- [ ] `W06.P13.S124` - Certify removal deletes owned generations and receipts while preserving data unless explicit typed data removal is requested; `engine/crates/vaultspec-product/src/bin/product_certify.rs`.
- [ ] `W06.P13.S125` - Certify the capsule's standalone MCP adapter starts and stops under its caller while dashboard lifecycle leaves it untouched; `engine/crates/vaultspec-product/src/bin/product_certify.rs`.
- [ ] `W06.P13.S126` - Certify token values never appear in logs, lifecycle jobs, frontend state, receipts, discovery, manifests, or retained artifacts; `engine/crates/vaultspec-product/src/bin/product_certify.rs`.
- [ ] `W06.P13.S127` - Create the mandatory real-artifact certification workflow with network isolation, retained diagnostics, and no skip or expected-failure path; `.github/workflows/a2a-product-certification.yml`.
- [ ] `W06.P13.S128` - Run the complete product certification job on Apple Silicon macOS; `.github/workflows/a2a-product-certification.yml`.
- [ ] `W06.P13.S129` - Run the complete product certification job on Intel macOS; `.github/workflows/a2a-product-certification.yml`.
- [ ] `W06.P13.S130` - Run the complete product certification job on Arm64 Linux; `.github/workflows/a2a-product-certification.yml`.
- [ ] `W06.P13.S131` - Run the complete product certification job on x86-64 Linux; `.github/workflows/a2a-product-certification.yml`.
- [ ] `W06.P13.S132` - Run the complete product certification job on x86-64 Windows through the product-owned PowerShell installer; `.github/workflows/a2a-product-certification.yml`.
- [ ] `W06.P13.S133` - Install, upgrade, downgrade, roll back, repair, and uninstall the complete MSI through Windows Installer; `.github/workflows/a2a-product-certification.yml`.
- [ ] `W06.P13.S134` - Install, upgrade, downgrade, roll back, repair, and uninstall the complete ZIP through a real Scoop installation; `.github/workflows/a2a-product-certification.yml`.
- [ ] `W06.P13.S135` - Install, upgrade, downgrade, roll back, repair, and uninstall the complete MSI through a real WinGet installation; `.github/workflows/a2a-product-certification.yml`.
- [ ] `W06.P13.S136` - Compare the explicit five-target by supported-channel matrix and published shell, PowerShell, MSI, Scoop, and WinGet inventories to the same logical release-set manifest; `.github/workflows/a2a-product-certification.yml`.
- [ ] `W06.P13.S137` - Require the matching A2A desktop artifact and Compose regression attestations before dashboard product publication; `.github/workflows/release.yml`.
- [ ] `W06.P13.S173` - Certify first-install active-journal namespace durability and steady-state slot recovery on certified local NTFS by cutting power in real Windows virtual machines at every create synchronize write-through slot-write journal-sync proof-retirement and reopen boundary, prove each restart selects only the prior or fully settled receipt with bounded residue, and block publication because process termination alone cannot certify storage durability; `.github/workflows/a2a-product-certification.yml`.

### Phase `W06.P14` - perform formal release review

Dispatch independent vaultspec-code-reviewer passes and a manual architecture-owner review over lifecycle security, updater recovery, frontend boundaries, and release evidence before completion.

- [ ] `W06.P14.S138` - Review product manifest, receipt, credentials, locks, process ownership, hard bounds, migration, snapshot, and transaction code for safety and ADR intent; `engine/crates/vaultspec-product`.
- [ ] `W06.P14.S139` - Review copied-updater descriptors, replacement ordering, channel authority, rollback, recovery, redaction, and Windows behavior; `engine/crates/vaultspec-updater`.
- [ ] `W06.P14.S140` - Review lifecycle routes and run admission for typed boundaries, atomic single-flight, authenticated ownership, bundle-scoped token revocation, and fixed run verbs; `engine/crates/vaultspec-api`.
- [ ] `W06.P14.S141` - Review frontend stores and panels for sole wire ownership, backend-served truth, bounded polling, guarded deletion, localization, and action-plane parity; `frontend/src`.
- [ ] `W06.P14.S142` - Review component locking, five-target composition, installer completeness, channel reversibility, Cargo withdrawal, and published artifact inventory; `packaging`.
- [ ] `W06.P14.S143` - Manually reconcile the dashboard release-set contract and certification evidence against the accepted A2A desktop profile and record the shipped cross-repository entrypoint audit; `.vault/audit/2026-07-18-a2a-product-provisioning-audit.md`.
- [ ] `W06.P14.S144` - Apply vaultspec-codify only to implementation and review lessons that satisfy the durable-rule criteria after the full cycle; `.codex/rules/architecture-boundaries.md`.

## Parallelization

Waves are ordered by default. The following bounded exceptions preserve the cross-repository contract:

- Dashboard W01.P01 and W01.P03 may begin alongside A2A W01 and W02 once the schema names and protocol ranges are locked. The real producer-consumer contract test waits for the A2A W01 capsule emitter. W01.P02 contract code may begin after W01.P01, but its real attach, singleton, readiness, and process-tree proofs wait for A2A W03.

- Active selection authority is a hard non-parallel chain: W01.P01.S167 receipt parsing, W01.P01.S168 Windows directory authority, W01.P01.S169 retained generation authority, W01.P01.S170 lifetime-bound release verification, W01.P01.S171 Windows first-journal installation, W01.P01.S172 durable activation, W01.P01.S163 generation authority proofs, W01.P01.S174 authenticated distribution authority, W01.P01.S175 retained dashboard credential and bootstrap authority, W01.P01.S176 sealed provisioning and active-read facades, W01.P01.S11 integrated product-authority proofs, then W01.P02.S16 and W02.P04.S164 consumers. No later Step may retain compatibility by authorizing the retired receipt, generation, raw distribution, or generic credential APIs. Windows publication additionally waits for W06.P13.S173 real local-NTFS virtual-machine power-loss certification.

- W01.P01.S174 proves the production verifier and metadata producer against real non-production TUF repositories; test keys never certify a production root. Supported release publication additionally waits for W04.P08.S166 to emit the real six-target repository and for the accepted distribution-trust key ceremony to embed an independently reviewed production root. Shell, PowerShell, MSI, Scoop, WinGet, and copied-updater consumers must use the same bounded Rust authority rather than restating trusted digests.

- Dashboard W02 is a hard consumer of A2A W03 gateway ownership and A2A W04 prepare/commit token admission. No authenticated activation or run-token compatibility claim may land before those outputs pass their producer tests.

- Dashboard W03 snapshot and transaction primitives may begin after W01. Migration integration waits for the A2A W02 mutable-store contract, and full updater acceptance waits for the A2A W03 and W04 runtime contracts.

- Dashboard W04.P08 waits for the verified A2A W01 capsule artifact. W04.P09 and W04.P10 may proceed in parallel after one complete target tree exists, but Scoop and WinGet work remains gated by the W01 phase-zero reversibility proof. Publication waits for A2A W02 through W04 and for every declared channel proof.

- Dashboard W05 waits for the lifecycle API and backend projection to stabilize. W05.P12 follows W05.P11 so the app layer never invents wire state or calls A2A directly.

- Dashboard W06 waits for all dashboard waves and A2A W05 real-target plus Compose certification. W06.P14 formal review follows W06.P13 evidence generation; codification is the final conditional action.

## Verification

The plan is complete only when every Step is closed and all of the following checks pass:

- `uv run --no-sync vaultspec-core vault plan check .vault/plan/2026-07-18-a2a-product-provisioning-plan.md` reports no errors, and the append-only identifier-order warning caused by release-blocker additions to earlier Phases is manually confirmed intentional.

- Rust formatting, workspace clippy with warnings denied, and workspace tests pass for `engine`; frontend lint, type checking, tests, build, localization guards, action coverage, and closed-panel activity guards pass for `frontend`.

- The producer-consumer workflow builds a real A2A target capsule, validates its emitted manifest with the production dashboard parser, and proves that unpinned identity, commit mismatch, artifact mismatch, target mismatch, digest drift, missing licenses, and incomplete SBOM fail closed.

- Lifecycle API tests prove one atomic check-and-reserve hard cap, component-scoped single-flight across different operations, bounded retention, authenticated ownership, foreign immutability, dashboard-only capability creation, distinct credentials, and real process-tree cleanup.

- Run-admission tests prove that public `POST /ops/a2a/run-start` remains one of five control verbs in the fixed six-member dashboard whitelist while downstream `/v1/runs` prepare and commit variants return bounded roles, minting follows prepare, commit binds the dedicated lease repository to authoritative A2A run or thread identity, the internal callback accepts the dashboard-created attach-control credential and rejects worker IPC, settlement follows durable terminal persistence, INPUT_REQUIRED retains the lease, and expiry or restart reconciliation revokes exactly one hashed bundle.

- External-updater tests use a copied protected helper and real executables to prove the invariant: updater acquires install lock, authenticated drain closes admission and resolves active runs plus checkpoints, owner authorization stops the gateway, A2A runtime-singleton release completes, then snapshot, staged migration, and complete-generation swap proceed. The gateway never acquires or waits on the install lock, and receipt restoration, relaunch, rollback, Windows replacement, and every durable interruption boundary recover deterministically.

- Product certification installs the same logical release set on Apple Silicon macOS, Intel macOS, Arm64 Linux, x86-64 Linux, and x86-64 Windows, then proves install, cold start, lazy worker, run, restart, concurrent ensure, repair, update, downgrade, rollback, relocation, failure recovery, and uninstall without network access or test doubles.

- Shell, PowerShell, MSI, Scoop, and WinGet are certified only where the explicit support matrix has a real complete-payload downgrade and rollback proof. A failed phase-zero package-manager proof leaves that channel unsupported and reopens the ADR rather than weakening certification.

- The standalone MCP entrypoint is present and independently invokable under caller ownership on every target while every dashboard lifecycle and cleanup operation leaves it untouched.

- The matching A2A W05 target and Compose attestations gate release publication, then independent code-review passes and the architecture owner reconcile both repositories, artifact inventories, complete receipts, security boundaries, updater recovery evidence, and all target-channel results before completion.
