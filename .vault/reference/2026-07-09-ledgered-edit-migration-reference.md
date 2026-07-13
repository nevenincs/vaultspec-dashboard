---
tags:
  - '#reference'
  - '#ledgered-edit-migration'
date: '2026-07-09'
modified: '2026-07-12'
related:
  - "[[2026-07-09-ledgered-edit-migration-adr]]"
---

# `ledgered-edit-migration` reference: `Edit-surface and legacy write-path inventory`

## Summary

Grounding inventory for the edit migration, from a full read of the frontend edit seam and
the authoring backend. All line numbers are as of 2026-07-09; confirm with a grep before
editing.

### Frontend edit surfaces (all currently un-ledgered)

Every mutation funnels through one seam: `dispatchOps()` in `stores/server/opsActions.ts`
-> `appDispatcher` -> `engineClient.opsCore*` in `stores/server/engine.ts` -> `POST
/ops/core/*`.

STATUS as of W04.P11: this block is the W01 GROUNDING SNAPSHOT (the starting state) —
Save/frontmatter/rename/create/relate have since migrated to the ledger (W01.P02, W03.P07
-P10) and no longer match the bullets below; see the "Semantic hard cases" section for
their current (DONE/CONFIRMED) status. Only autofix-feature/archive-feature and the inline
autofix genuinely still describe the CURRENT state — they are DELIBERATELY retained here,
not stale.

- Editor Save (body): `app/viewer/MarkdownDocView.tsx` `saveBody = useSaveBody()`; hook in
  `stores/server/queries.ts` `useSaveBody` -> `runWriteOp`; verb `set-body`, mode `write`.
- Frontmatter panel: `MarkdownDocView.tsx` `setFrontmatter = useSetFrontmatter()`; hook
  `useSetFrontmatter` -> `runWriteOp`; verb `set-frontmatter`, mode `write`.
- Rename: `MarkdownDocView.tsx` `renameDoc = useRenameDoc()`; hook `useRenameDoc` ->
  `runWriteOp`; verb `rename`, mode `write`.
- Create: `app/stage/CreateDocButton.tsx` `create = useCreateDoc()`; hook `useCreateDoc`;
  verb `create`, mode `create`.
- Relate/link: `app/menus/sharedActions.ts` `relateToSelectionAction` (context menu);
  direct `dispatchOps` (NOT the `useRelateDoc` hook); verb `link-add`, mode `link`.
- Autofix (advisories bar): `MarkdownDocView.tsx` inline `dispatchOps`; verb `autofix`,
  mode `autofix`.
- Autofix feature + Archive feature: `sharedActions.ts` `autofixFeatureAction` /
  `archiveFeatureAction` (context menu); direct `dispatchOps`; verbs `autofix` /
  `feature-archive`, modes `autofix` / `archive`.
- DEAD hooks (no live callers outside tests): `useArchiveFeature`, `useRelateDoc` in
  `queries.ts` — removed (W03.P10).
- Types: `Ops{Write,Create,Archive,Link,Autofix}Body` + `OpsResult` in `engine.ts`; client
  methods `opsCore{Write,Create,Archive,Link,Autofix}` in `engine.ts`.

### Actor-token bootstrap gap

`stores/server/authoring.ts` holds the in-memory actor token and the `x-authoring-actor-token`
header (`AuthoringClient.withActor`); issuance is `issueActorToken` -> `POST
/authoring/v1/actor-tokens` (machine-bearer-gated). The ONLY caller today is
`app/authoring/ReviewStation.tsx` (`useIssueActorToken`, a hardcoded reviewer identity). A
plain editing session has NO token; `requireActorToken()` throws before any command fires.
The migration must bootstrap a shared human editor identity.

### Backend operation kinds: vocabulary vs. apply support

`ChangesetOperationKind` (`authoring/api.rs`) declares nine kinds: CreateDocument,
ReplaceBody, AppendBody, EditFrontmatter, Rename, Archive, Unarchive, Link, SectionEdit.
Only ReplaceBody is end-to-end wired:

- Validation `authoring/operations.rs` `validate_replace_body_draft` rejects any non-ReplaceBody
  kind (`OperationError::UnsupportedOperationKind`) — a non-body proposal fails at
  VALIDATION, before apply.
- Apply `authoring/apply.rs` narrows to `child.operation != ReplaceBody` -> denies "V1 apply
  materializes only whole-document body replacement" (an honest `ActionEligibility::denied`).
  V1 is single-child only.
- Rollback `authoring/rollback.rs` is preimage-restore only; every non-body kind is
  `rollback_available=false` with a manual-repair hook.
- Conflicts `authoring/conflicts.rs` key on `is_whole_document_replace`.

### Core adapter plumbing (`authoring/core_adapter.rs`)

The type is `CoreCapability` (NOT `CoreVerb`). Five capabilities, all implemented (validating
builders, capability-probing, bounded subprocess), currently `#[allow(dead_code)]` except
SetBody: CreateDocument -> `vault add`, SetBody -> `vault set-body`, SetFrontmatter ->
`vault set-frontmatter`, Edit -> `vault edit`, Rename -> `vault rename`. Apply only ever
invokes `CoreCapability::SetBody`. So for frontmatter/edit/rename/create the plumbing gap
is "wire apply to call the existing capability," not "build the adapter." There is NO
capability for archive/link/autofix.

### The single-call body-replacement path (the highest-leverage lever)

`authoring/direct_write.rs`, routed `POST /authoring/v1/direct-writes` (`http.rs` handler),
already composes create-proposal -> validate -> submit -> human-only self-approve (agents
denied) -> apply, server-side, idempotent, kill-switch gated (on by default), recording a
`kind=Direct` ledger entry that is a legal rollback source. It is complete and tested but
has NO frontend caller and NO client method in `authoring.ts`. `DirectWriteRequest`
(`api.rs`) covers body only (ref, body, expected_blob_hash, summary) — frontmatter/rename/
create need an operation-typed generalization.

### Legacy /ops/core write path (deletion targets)

Route registrations in `engine/crates/vaultspec-api/src/lib.rs`: `/ops/core/{verb}/write`
(ops_core_write), `/ops/core/create`, `/ops/core/autofix`, `/ops/core/archive`,
`/ops/core/unarchive` (no frontend caller at all), `/ops/core/link`. Handlers in
`routes/ops.rs`: `ops_core_write`, `ops_core_autofix`, `ops_core_archive`,
`ops_core_unarchive`, `ops_core_link`, `ops_core_create`. `CORE_WRITE_WHITELIST` in
`ops.rs` = set-body, set-frontmatter, edit, rename. KEEP the read control verbs
(`CORE_WHITELIST` = vault-check, vault-stats). Frontend deletion targets (W04.P12): the
`write`/`create` `dispatchOps` modes (now dead in practice — W03 rewired
save/frontmatter/rename/create/relate off them; `opsActions.ts`'s dispatch switch keeps
`archive`/`autofix` alive) + `engine.ts` `opsCore{Write,Create}` write methods +
`Ops{Write,Create}Body` types; `queries.ts` `runWriteOp`/`adaptOpsWrite` (already removed,
W03.P07/P09) + the migrated hooks; `sharedActions.ts`'s now-retired relate builder
(migrated to the ledgered `RELATE_ACTION`, W03.P10); pinning tests `engine.test.ts`,
`opsActions.test.ts`, `editorMutations.test.ts`, `editorWriteSeam.test.tsx`.
**`archiveFeatureAction`/`autofixFeatureAction` (`sharedActions.ts`) and the inline autofix
(`MarkdownDocView.tsx`) are NOT deletion targets** — confirmed re-scoped (W04.P11) as
permanent vault-maintenance actions per the ADR; they stay on `/ops/core/archive` and
`/ops/core/autofix` (which also stay — `KEEP`, not delete) indefinitely.

### Semantic hard cases (per the ADR)

- feature-archive: multi-document (every doc under a tag) — does NOT fit the single-child
  V1 changeset model; re-scoped as a non-ledgered maintenance operation. CONFIRMED
  (W04.P11): `archiveFeatureAction` stays on `/ops/core/archive`, gated to feature nodes,
  labeled `Archive feature "{feature}"`, `danger` section (destructive, arm-to-confirm).
- autofix: bulk repair (`vault check all --fix`), no single target — non-ledgered
  maintenance. CONFIRMED (W04.P11): both `autofixFeatureAction` (context menu, feature
  nodes) and the inline advisories-bar fix (`MarkdownDocView.tsx`, doc-scoped fix over the
  doc's FEATURE) stay on `/ops/core/autofix`; the inline button's visible label now names
  the feature (`Fix "{feature}" conformance`, not just the tooltip) so it reads as
  feature-wide maintenance rather than a document edit, consistent with the context-menu
  phrasing.
- link-add: mutates the source doc's `related:` list — modeled as a frontmatter edit
  (`EditFrontmatter`) through the ledger, not a bespoke verb. DONE (W03.P10):
  `relateActions.ts`'s `RELATE_ACTION` reads the source's current `related:` + blob hash
  and sends the full list through `directWrite({operation:"edit_frontmatter"})`.
- create: no prior document to fence against — no preimage; rollback would be a delete,
  which the ledger has no verb for; ships non-rollback-eligible with an honest reason.

### Post-migration follow-on dispositions (W05)

- **Structured direct-write denial discriminator (W05.P14):** the frontend routed a
  rename/create path-collision by substring-matching the backend's denial reason text; the
  hardening carries a machine-readable `denial_kind` on the direct-write outcome so both
  sides stop reason-sniffing.
- **CreateDocument delete-inverse (W05.P15) — UPSTREAM-GATED, not buildable here.** A
  ledgered create is non-rollback-eligible because its only inverse is a document delete,
  and the disposition confirms the gap is genuinely upstream: `vaultspec-core`'s `vault`
  surface has NO single-document delete/remove verb (its mutating verbs are `set-body`,
  `set-frontmatter`, `edit`, `rename`, `add`, `link`; the only removal is `feature archive`,
  which is feature-scoped/multi-document and is the retained non-ledgered maintenance op,
  not a per-document inverse). The authoring boundary forbids reaching the vault by any
  path other than the `vaultspec-core` adapter — no raw-filesystem delete, no git mutation
  — so a compliant CreateDocument rollback-inverse CANNOT be built in this repository. It
  is a Tier-3 coordination ask to FILE toward the `vaultspec-core` project: expose a
  bounded single-document delete verb (`vault delete <ref>` / `vault rm`) that the core
  adapter can broker as a new `CoreCapability`, after which a `CreateDocument` source rolls
  back by generating a delete changeset and `create_rollback_eligibility` admits it.
  Verified intact until then: create stays honestly non-rollback-eligible
  (`create_rollback_eligibility`'s admit-list is ReplaceBody | EditFrontmatter | Rename;
  `create_document_source_has_no_v1_inverse_and_offers_manual_repair` in `rollback.rs`),
  offering an honest `rollback_available=false` + reason + manual-repair, exactly as the
  ADR deferred. RETURN TRIGGER: the day `vaultspec-core` ships a single-document delete
  verb, wire the `CoreCapability` + the delete-inverse rollback and admit CreateDocument.
