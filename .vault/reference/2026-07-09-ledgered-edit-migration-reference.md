---
tags:
  - '#reference'
  - '#ledgered-edit-migration'
date: '2026-07-09'
modified: '2026-07-09'
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
  `queries.ts` — remove.
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
(`CORE_WHITELIST` = vault-check, vault-stats). Frontend deletion targets: `opsActions.ts`
write/create/archive/link/autofix modes + the dispatch switch; `engine.ts` `opsCore*` write
methods + `Ops*Body` types; `queries.ts` `runWriteOp` + the edit hooks; `sharedActions.ts`
the three ops-dispatching builders; the inline autofix in `MarkdownDocView.tsx`; pinning
tests `engine.test.ts`, `opsActions.test.ts`, `editorMutations.test.ts`,
`editorWriteSeam.test.tsx`.

### Semantic hard cases (per the ADR)

- feature-archive: multi-document (every doc under a tag) — does NOT fit the single-child
  V1 changeset model; re-scoped as a non-ledgered maintenance operation.
- autofix: bulk repair (`vault check all --fix`), no single target — non-ledgered maintenance.
- link-add: mutates the source doc's `related:` list — modeled as a frontmatter edit
  (`EditFrontmatter`) through the ledger, not a bespoke verb.
- create: no prior document to fence against — no preimage; rollback would be a delete,
  which the ledger has no verb for; ships non-rollback-eligible with an honest reason.
