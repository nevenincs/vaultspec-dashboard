---
tags:
  - '#plan'
  - '#document-editor-backend'
date: '2026-06-16'
modified: '2026-06-16'
tier: L3
related:
  - '[[2026-06-16-document-editor-backend-adr]]'
  - '[[2026-06-16-document-editor-backend-research]]'
---


# `document-editor-backend` plan

## Wave `W01` - vaultspec-core edit verbs

Author and release the new vaultspec-core vault edit verbs (set-body, set-frontmatter, combined edit) with blob-hash optimistic concurrency and conformance validation, via the core repo's gh-issue -> worktree -> PR -> CI -> release-please -> PyPI flow, then bump the dashboard pin.

### Phase `W01.P01` - issue and worktree setup

File the GitHub issue(s) against the core repo and confirm the auto-bootstrapped feature worktree and branch.

- [x] `W01.P01.S01` - File the GitHub issue(s) for the vault edit verbs against the core repo and capture the issue number(s); `core-repo/.github (gh issue)`.
- [x] `W01.P01.S02` - Confirm the auto-bootstrapped feature worktree and branch for the issue in the core repo; `core-repo/worktree`.

### Phase `W01.P02` - the edit verbs

Author the blob-OID helper and the set-body, set-frontmatter, and combined edit verbs with conformance validation and refuse-on-error, plus pytest coverage.

- [x] `W01.P02.S03` - Add the git blob-OID helper computing sha1 over the blob prefix and raw bytes; `src/vaultspec_core/vaultcore/blob_hash.py`.
- [x] `W01.P02.S04` - Author the vault set-body verb: read preserving newlines, replace body, refresh modified, validate, refuse-on-error, atomic write; `src/vaultspec_core/cli/vault_cmd.py`.
- [x] `W01.P02.S05` - Author the vault set-frontmatter verb: assemble and validate metadata, resolve related, atomic write; `src/vaultspec_core/cli/vault_cmd.py`.
- [x] `W01.P02.S06` - Author the combined vault edit verb performing one atomic body+frontmatter write as the engine-facing save; `src/vaultspec_core/cli/vault_cmd.py`.
- [x] `W01.P02.S07` - Wire expected-blob-hash optimistic concurrency and the json_envelope result shape (status/data/conflict); `src/vaultspec_core/cli/vault_cmd.py`.
- [x] `W01.P02.S08` - Add pytest coverage for the verbs: success, refuse-on-error, conflict, blob-hash parity, frontmatter validation; `tests/cli/test_vault_edit.py`.

### Phase `W01.P03` - release and integrate

Pass the core CI gate, merge feat:, release to PyPI via release-please, and bump the dashboard pin.

- [x] `W01.P03.S09` - Pass the core CI gate locally: ruff, ty, taplo, lychee, pymarkdown, pytest, vault-audit; `core-repo/Justfile`.
- [ ] `W01.P03.S10` - Open the PR, merge with a feat: commit, and trigger the release-please PyPI publish; `core-repo/.github/workflows`.
- [ ] `W01.P03.S11` - Bump the dashboard vaultspec-core pin to the released version and uv sync, backing out any editable dev-bridge first; `pyproject.toml`.

## Wave `W02` - engine /ops write channel

Extend the engine /ops core proxy with a write-verb whitelist and a request-body channel forwarding to the new core verbs, keeping read-and-infer, the bounded cap+timeout runner, and the shared envelope+tiers on success and error, mapping a core conflict to a tiered error_kind.

### Phase `W02.P04` - the write channel

Add the write-verb whitelist and validated request-body channel to the ops core proxy, with conflict mapping, envelope+tiers, and rust tests.

- [x] `W02.P04.S12` - Add the write-verb whitelist and a validated request-body channel to the ops core proxy; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `W02.P04.S13` - Forward the body to the sibling via stdin or temp body-file, preserving the stdout cap and wall-clock timeout; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `W02.P04.S14` - Map a core conflict to a tiered error_kind and wrap every response via the shared envelope with tiers on success and error; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `W02.P04.S15` - Register the write route and add rust tests: whitelist, body forward, conflict, tiers, read-and-infer fence; `engine/crates/vaultspec-api/src/routes/mod.rs`.

## Wave `W03` - stores, mock, and editor state

Add the stores-layer save/create/frontmatter mutations and a bounded editor view-state slice, bring the mock engine to live write-shape fidelity with a captured-sample adapter test, and derive the read-side fields client-side.

### Phase `W03.P05` - wire client and mutations

Add the body dispatch seam, engine-client write methods, and the save/create/frontmatter mutations with invalidations.

- [x] `W03.P05.S16` - Add a body field to the OpsPayload dispatch seam for write verbs; `frontend/src/stores/server/opsActions.ts`.
- [x] `W03.P05.S17` - Add the engine-client write methods and response adapters for the write verbs; `frontend/src/stores/server/engine.ts`.
- [x] `W03.P05.S18` - Add useSaveBody, useCreateDoc, useSetFrontmatter mutations with blob-hash echo and content/graph/tree invalidation; `frontend/src/stores/server/queries.ts`.

### Phase `W03.P06` - editor state and read-side derivations

Add the bounded editor view-state slice and the client-side read-side field derivations.

- [x] `W03.P06.S19` - Add the bounded editor slice (status enum, single draft, baseBlobHash, no undo) cleared on scope swap; `frontend/src/stores/view/viewStore.ts`.
- [x] `W03.P06.S20` - Derive the read-side fields (doc-type, read-time, resolved-vs-broken links) client-side from existing data; `frontend/src/stores/server/queries.ts`.

### Phase `W03.P07` - mock fidelity

Bring the mock /ops/core write verbs to live shape with conflict and typed rejections, prove fidelity with a captured-sample adapter test, and cover with vitest.

- [x] `W03.P07.S21` - Make the mock ops/core write verbs mutate the in-memory corpus, re-hash, and emit 409 conflict and typed rejections; `frontend/src/testing/mockEngine.ts`.
- [x] `W03.P07.S22` - Add the captured-live-sample adapter test proving the mock write shape equals the live shape; `frontend/src/stores/server/liveAdapters.test.ts`.
- [x] `W03.P07.S23` - Add vitest coverage for the mutations and the editor state slice; `frontend/src/stores/server/queries.test.ts`.

## Wave `W04` - review, harden, manual synthetic-corpus test

Run the full lint and test gates green, code-review and harden the whole feature, and manually exercise the editor loop against a synthetic corpus copied to scratch (never live vault contents), recording an audit.

### Phase `W04.P08` - gates and review

Run the full lint and test gates green and code-review and harden the feature.

- [x] `W04.P08.S24` - Run the full gates green: cargo test, vitest, pytest, just dev lint all and lint frontend exit 0, vault check all; `Justfile`.
- [x] `W04.P08.S25` - Code-review the whole feature and land any required hardening revisions; `.vault/audit/2026-06-16-document-editor-backend-audit.md`.

### Phase `W04.P09` - manual synthetic-corpus test and audit

Manually exercise the editor loop against a scratch synthetic corpus and record the audit.

- [x] `W04.P09.S26` - Build a synthetic scratch corpus by copying .vault and .vaultspec to scratch (never live contents); `scratch/synthetic-corpus`.
- [x] `W04.P09.S27` - Manually exercise save, create, frontmatter, lint, autofix, conflict, refuse-on-error, and truncation against the scratch corpus; `scratch/synthetic-corpus`.
- [x] `W04.P09.S28` - Record the manual-test results and review verdict in the feature audit; `.vault/audit/2026-06-16-document-editor-backend-audit.md`.

## Description

This plan delivers the dashboard's vault-conformant document editor backend to
completion: saving body prose, creating documents, and editing frontmatter
(tags/date/related), plus lint, autofix, and mark-invalid surfaced from the
framework's existing health-check diagnostics. The engine stays read-and-infer —
every write routes through the `/ops` sibling proxy to `vaultspec-core`, which
owns `.vault/` CRUD. The four waves follow the authoring ADR's four layers and
are sequenced by the cross-repo release dependency: the core verbs must be
authored and published before the engine and stores can call them against the
pinned wheel, so Wave 1 lands first (with a temporary editable dev-bridge as the
integration shortcut, backed out before commit). The work spans three languages
and two repositories — Python verbs in the core repo, Rust in the engine, and
TypeScript in the stores and mock — and finishes with a manual exercise of the
whole loop against a synthetic corpus copied to scratch, never the live vault.

## Steps

The executable steps live under their Waves and Phases above (W01–W04). The leaf
Step rows are the unit of execution; each carries one file or cohesive area in
its scope clause and is verified by the gate named in the Verification section.

## Parallelization

Wave 1 (core verbs + release) is the critical path and gates Waves 2 and 3 for
the live wire, but the two can be developed in parallel against the editable
dev-bridge and the mock: Wave 2 (engine `/ops` write channel) and Wave 3 (stores
+ mock + editor state) touch disjoint files and only converge at integration.
Within Wave 1, the blob-OID helper (P02.S03) precedes the verbs that use it
(P02.S04–S07); the three verbs share `vault_cmd.py` and are authored in sequence
to avoid contending the same file. Within Wave 3, the mock-fidelity phase (P07)
can proceed against the captured live sample as soon as the wire shape is fixed
in P05, independent of the editor-state phase (P06). Wave 4 (review, harden,
manual test) is strictly last — it gates the whole feature and cannot begin until
Waves 1–3 are green. Because Wave 1's verb files and Wave 2's engine files are in
separate repos, and Wave 3's frontend files are disjoint from both, agents on the
three waves do not contend the same working tree.

## Verification

Each Wave names its gate. Wave 1: the core repo's CI surface run locally —
`just dev lint python` (ruff), `just dev lint type`, the toml/markdown/link lint,
`just dev test python` (pytest), and the vault-audit job — all exit 0 before the
PR merges; the release is verified by the published wheel version and a successful
dashboard `uv sync` against the bumped pin. Wave 2: `cargo test` for the engine
API crate green, including the new write-channel tests (whitelist, body forward,
conflict mapping, tiers on success and error, read-and-infer fence). Wave 3:
`vitest` green for the new mutations, the editor-state slice, the mock write
verbs, and the captured-sample adapter parity test. Wave 4: `just dev lint all`
and `just dev lint frontend` both exit 0, `vaultspec-core vault check all` stays
green, the code review records a PASS (revisions landed), and the manual
synthetic-corpus protocol exercises save, create, frontmatter, lint, autofix,
conflict, refuse-on-error, and truncation against the scratch copy with the
results recorded in the feature audit.
