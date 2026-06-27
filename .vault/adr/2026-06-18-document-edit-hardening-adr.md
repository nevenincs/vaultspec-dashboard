---
tags:
  - '#adr'
  - '#document-edit-hardening'
date: '2026-06-18'
modified: '2026-06-18'
related:
  - "[[2026-06-18-document-edit-hardening-research]]"
  - "[[2026-06-16-document-editor-backend-adr]]"
  - "[[2026-06-18-editor-dock-workspace-adr]]"
---

# `document-edit-hardening` adr: `document edit hardening + bidirectional state coupling` | (**status:** `accepted`)

## Problem Statement

The `document-editor-backend` feature shipped the write architecture and the
`editor-dock-workspace` feature shipped the editor UI, but a live drive of the edit
path against the running engine and a real vault document found it is **not usable
end-to-end** and is **missing capabilities the mandate now requires**. The live
research records seven findings; the load-bearing ones: the engine brokers a STALE
GLOBAL `vaultspec-core` that lacks the edit verbs, so every save fails live (F1);
the conformance advisory data exists but is not surfaced in the editor and the
frontmatter write replaces rather than merges tag sets (F3); there is no
title-change-to-file-rename capability at all (F5); create action-mapping is partial
(F6); and the bidirectional write-to-re-ingest-to-refresh loop, while present via
the watcher and SSE, has an unverified timing race and an unconfirmed open-editor
refresh (F4, F7). This ADR decides how to harden the edit feature into full,
live-verified bidirectional backend-frontend state coupling — engine-brokered end
to end, never exposing the frontend to `vaultspec-core` or `vaultspec-rag` — closing
every gap above. It builds on, and does not supersede, the `document-editor-backend`
ADR's write-through-`/ops`-to-core fence.

## Considerations

- **The release-coupling risk the prior ADR named has materialized.** That ADR
  flagged that the dashboard consumes a published core wheel and that a verb is
  unusable until the wheel is published and the pin bumped. The live failure is the
  same fault one layer down: the ENGINE does not run the project-pinned core at all
  — it spawns whatever bare `vaultspec-core` is on `PATH`, which is a stale global
  `0.1.31` lacking the edit verbs, while the project pins `>=0.1.32`. Reads happened
  to keep working (old verbs), so the staleness was invisible until a write.
- **Most of the machinery already exists and must be reused, not rebuilt.** The
  `/ops/core/{set-body,set-frontmatter,edit}/write` and `/ops/core/create` POST
  brokers, the injection-guard validation, the bounded stdin-streaming runner, the
  verbatim envelope forwarding with tiers, the field-level conformance `checks`, the
  optimistic `blob_hash`, the watcher re-ingest, and the SSE generation-bump
  invalidation are all present and verified live. The hardening is mostly wiring,
  surfacing, version-correctness, and one net-new verb (rename).
- **Title-to-filename is not a one-to-one mapping in this vault.** A vault filename
  encodes `date-feature-type`, not the prose H1 title. "A title change renames the
  file" therefore means a first-class **document-rename** action over the
  identity-bearing stem, distinct from editing the H1 body prose. Renaming a stem is
  a contract event: the node id (`doc:<stem>`) changes, incoming `related:` links in
  other documents must be rewritten (the archive-discipline lesson), and the open
  tab and graph selection must re-key.
- **The frontend must never touch core or rag.** Every new capability is a brokered
  engine POST endpoint returning state; the stores layer stays the sole wire client;
  the app layer maps actions onto those endpoints and reads the tiers-derived result.
- **Two repositories, the same gh-issue + worktree + release process.** The rename
  verb and any core-version capability check are authored in the external
  `vaultspec-core` repo through its issue-to-worktree-to-PR-to-release flow, exactly
  as the prior edit verbs were.

## Constraints

- **Engine core resolution is the precondition for everything.** Until the engine
  brokers a core that ships the edit (and rename) verbs, no write works live. The
  engine must resolve the project-pinned core and verify its capability at the
  boundary, degrading the write tier with an honest advisory when it cannot, rather
  than surfacing a cryptic non-zero exit. This is the first blocking deliverable.
- **The rename verb is the one immature surface.** It does not exist in core; it
  must be authored (resolve the document, validate the target stem, rename the file
  atomically, rewrite incoming `related:` references, refresh `modified:`, run the
  conformance checks, emit the `--json` envelope with old/new path and id) and
  released before the dashboard can call it against the pinned wheel. Every other
  parent surface (the write/create brokers, the dock editor, the SSE plane) is
  shipped and stable.
- **set-frontmatter is replace-not-merge.** A frontmatter write that omits the
  required directory or feature tag is correctly refused; the UI contract must send
  the full canonical set (or the engine/stores must merge against the current
  frontmatter before forwarding) or every save is refused.
- **UTF-8 fidelity across the engine-to-core stdin boundary is unproven.** A live
  round-trip mangled a non-ASCII character; arbitrary Unicode prose must round-trip
  byte-faithfully, verified through the real stores client (not a shell harness)
  before the editor is declared usable.

## Implementation

The work layers from the blocking precondition outward; all of it is live-verified
against real vault documents, not tests.

**1. Engine: pin and verify the brokered core.** The engine resolves the core
invocation it brokers to the project-pinned environment rather than an arbitrary
`PATH` binary, and verifies at the write boundary that the resolved core advertises
the required verbs/version. A missing-capability condition degrades the relevant
tier and returns a clear advisory through the shared envelope, never a bare exit-2
passthrough. This closes F1 and makes the write path robust to a stale global.

**2. `vaultspec-core`: the rename verb (gh-issue, worktree, released).** Author a
`vault` rename verb that renames a document's identity-bearing file conformantly:
validate the target stem, rename atomically, rewrite incoming `related:` references
in sibling documents (or report them honestly when it cannot), refresh `modified:`,
run `run_all_checks` and refuse on ERROR severity, and emit the shared `--json`
envelope carrying old and new path, old and new `blob_hash`, the new node id, and
the `checks`. It accepts `--expected-blob-hash` and a `--dry-run` preview.

**3. Engine: a brokered rename POST + the create/edit surface completion.** Add the
rename verb to the write whitelist with full per-field injection-guard validation
(target stem grammar, collision pre-check), forwarded through the same bounded
runner and verbatim-envelope discipline. The brokered POST returns the old/new id
and path so the client can re-key. The create broker is confirmed and its typed
params completed so the full set of vault create actions is reachable.

**4. Stores: bidirectional state coupling + identity re-keying.** A rename mutation
hook routes through `/ops`, and on success re-keys the open tab, the editor slice,
and the shared selection from the old `doc:<stem>` to the new one, then runs the
vault-mutation invalidation sweep. The post-write invalidation is extended to
guarantee the OPEN editor's content view re-reads after re-ingest, and the SSE
generation-bump path is verified to heal the write-then-refetch timing race so a
dependent view (graph, tree, reader) is never left stale. `set-frontmatter` calls
send the merged canonical frontmatter so a partial edit is never refused.

**5. App: advisories, the action-to-create map, and full-text edit.** The editor
surfaces the field-level conformance `checks` as honest per-issue advisories
(severity, message, fixable) with an autofix action (forward `vault check --fix`),
replacing the generic failure state. A typed action registry maps the UI's create
and edit affordances onto the engine create/write brokers (action to vault verb),
never exposing core. The markdown editor supports full body-and-frontmatter editing
enrolled in the bounded managed editor state.

**6. UTF-8 fidelity + live verification.** The engine-to-core stdin path is verified
to round-trip arbitrary Unicode byte-faithfully and fixed if not. The whole feature
is proven by driving the real interface and the brokered POST APIs against live
vault documents — save, rename, create, conflict, refusal-with-advisory, and the
dependent-view refresh — not by tests alone.

## Rationale

Routing every capability through the engine `/ops` broker to `vaultspec-core` is the
only path that keeps the engine read-and-infer while delivering the mandate (the
prior ADR's fence, re-affirmed). Fixing core resolution engine-side rather than
relying on environment hygiene is necessary because the live failure proved a stale
global silently breaks all writes while reads mask it — capability must be verified
at the boundary (research F1). Modeling "title change renames the file" as a
conformant stem-rename contract event with link-rewrite and identity re-keying
matches how this vault actually encodes identity and reuses the archive-discipline
lesson that incoming references are provenance to preserve, not silently break
(research F5). Surfacing the existing field-level `checks` rather than inventing new
diagnostics, and merging frontmatter rather than replacing, are pure reuse and
sharp-edge fixes the live drive exposed (research F3). The bidirectional loop is
hardened rather than built because the watcher and SSE plane already close it; the
work is guaranteeing the open editor and dependent views refresh and the timing race
heals (research F4).

## Consequences

- **Gains:** a live-usable, conformant editor where save/rename/create work end to
  end and a write reliably propagates to every dependent view; honest per-issue
  advisories from the existing checker; document rename with identity re-keying and
  link integrity; and an engine that can never again silently broker a stale core.
- **Difficulties:** the rename verb and the core-capability check span the external
  core repo and its release cadence — the dashboard cannot call them against the
  pinned wheel until released, so a temporary editable core install bridges
  integration and is backed out before commit to preserve published-wheel purity.
  Rename's incoming-link rewrite is the subtle part: it must be conformant and
  honest about references it cannot safely rewrite.
- **Pitfalls to guard:** the brokered rename must not become an argument-injection
  or path-traversal vector — the existing per-field validation discipline extends to
  the target stem; the optimistic hash and the rename pre-check must be over raw
  bytes to byte-match the reader; the identity re-key must be atomic across tab,
  editor, and selection or a stale `doc:<stem>` observer survives the rename; and the
  frontend must never gain a direct core/rag path while adding these capabilities.

## Codification candidates

- **Rule slug:** `engine-brokers-the-project-pinned-core`.
  **Rule:** The engine resolves and verifies the project-pinned `vaultspec-core`
  it brokers and degrades with an honest tiered advisory when the required
  verb/version capability is absent, never silently spawning an arbitrary `PATH`
  binary whose staleness surfaces as a cryptic subprocess failure. (Candidate;
  promote only after it holds across this feature's cycle.)
- **Rule slug:** `document-rename-is-a-rekeying-contract-event`.
  **Rule:** Renaming a document's identity-bearing stem is a brokered, conformant
  contract event that rewrites incoming `related:` references and atomically re-keys
  every client observer (open tab, editor slice, shared selection) from the old
  `doc:<stem>` to the new one — never a silent file move that strands ids or links.
  (Candidate; same first-cycle caveat. Extends the provenance-stable-keys and
  archive-discipline lessons to the edit path.)
