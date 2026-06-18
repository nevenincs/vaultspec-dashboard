---
tags:
  - '#research'
  - '#document-edit-hardening'
date: '2026-06-18'
modified: '2026-06-18'
related: []
---



# `document-edit-hardening` research: `document edit hardening + bidirectional state`

This research grounds the edit-hardening campaign in LIVE reality. The
`document-editor-backend` feature shipped the write architecture (writes route
through the engine `/ops/core/{verb}/write` broker to `vaultspec-core`,
read-and-infer preserved; optimistic `blob_hash` concurrency; conformance refusal
with field-level `checks`; the `useSaveBody` / `useSetFrontmatter` / `useCreateDoc`
stores hooks; a bounded editor state slice). This pass drove that path live against
the running engine and a real scratch vault document to find what actually works,
what is broken, and what is missing for full bidirectional backend-frontend state
coupling. Every finding below is hand-verified against the live engine, not a test
double.

## Findings

### F1 — CRITICAL: the engine brokers a STALE GLOBAL core, silently breaking all writes

The engine spawns the document write verbs against **bare `vaultspec-core`**, which
resolves to a stale global `uv tool` install (version `0.1.31`) that does NOT ship
the edit verbs. A live `POST /ops/core/set-body/write` therefore failed with the
engine surfacing `"vaultspec-core exited Some(2) with no parseable envelope"` —
core exited with a usage error (`No such command 'set-body'`). The project's own
dependency is `vaultspec-core>=0.1.32` (the venv has `0.1.32`, which DOES ship
`set-body` / `set-frontmatter` / `edit`), reachable only through `uv run`. So the
edit feature is dead-on-arrival live: the engine does not use the version the
project pins. This is the manifestation of the release-coupling risk the prior ADR
named. A temporary unblock (upgrading the global tool to `0.1.32`) restored writes,
but the global shim could not be replaced while the engine held it, so the
condition is fragile and will regress. The durable fix is engine-side: the engine
must resolve and VERIFY the project-pinned core (or fail loudly with a tiered
advisory) rather than silently brokering whatever stale binary is on `PATH`.

### F2 — the write round-trip and backend re-ingest WORK (once the version is correct)

With the correct core, `POST /ops/core/set-body/write` returned `status:"updated"`
with the new `blob_hash` and empty `checks`; the real file changed on disk; the
resident watcher re-ingested (the index `generation` advanced `134 -> 137`); and a
subsequent `/content` read returned the edited body. So content bidirectionality
already exists via the watcher: frontend write to engine broker to core write to
watcher re-ingest to fresh read.

### F3 — the conformance ADVISORY path exists and is field-level

A `set-frontmatter` write that would leave the document non-conformant returned
`status:"failed"`, `refused:true`, and a structured `checks` array carrying
`check / severity / message / fixable` per violation (for example "Exactly one
directory tag required ... Found: []"). This is exactly the "advisory when a
document rolls out of the vaultspec-core checks umbrella" the mandate requires —
the data is already produced by the backend. The gap is purely UX: the frontend
maps a refusal to a generic failure state and does not surface the rich per-issue
diagnostics. A second sharp edge: `set-frontmatter` REPLACES the tag/related sets
rather than merging, so the UI must always send the full set including the required
directory tag, or every save is refused.

### F4 — the SSE signal-back loop exists (auto-refresh after backend re-ingest)

The frontend consumes the engine `/events` stream through TanStack v5
`streamedQuery`; a watcher generation-bump invalidates the graph-generation query
subtrees, so dependent reads re-fetch after a backend re-ingest. Combined with the
immediate post-write invalidation sweep (`invalidateAfterVaultMutation` — content,
status, map, search, graph-generation, git, file-tree), the
frontend-write to backend-reingest to frontend-refresh loop closes. The mandate's
worry that "the backend cannot receive POST events" is not accurate: the engine
already exposes POST write and create brokers and the watcher plus SSE provide the
return signal. What is unverified is the timing race (does the immediate refetch
land before re-ingest, relying on the SSE bump as the heal) and whether the open
editor's own content view is among the auto-refreshed surfaces.

### F5 — title-change to file-rename does NOT exist

The write whitelist is `set-body` / `set-frontmatter` / `edit` only — there is no
rename verb. The prior ADR treated the title as the body H1 and out of scope for
rename. The mandate now requires a title change to rename the file on disk, which
implies a new core rename verb, an engine broker entry, frontend action wiring,
node-identity (`doc:<stem>`) re-keying across the open tab and the graph selection,
and a cursory pre-rename validation. This is net-new build.

### F6 — create action-mapping exists at the backend, partial at the UI

The engine exposes `POST /ops/core/create` (typed `doc_type` / `feature` / `title`
/ `related`, forwarded to `vault add`). Mapping the UI's "new document" and related
create actions onto this broker is partly present (a `useCreateDoc` hook) but needs
full action-coverage so the host of vault create commands is reachable through the
brokered POST surface, never by exposing core to the frontend.

### F7 — possible UTF-8 / stdin fidelity issue (verify)

A non-ASCII character (an em dash) sent through the live write round-trip came back
mojibake on disk and in the re-served content, suggesting an encoding corruption
somewhere in the engine-to-core stdin path on Windows. This may be a test-harness
artifact (shell heredoc / curl) rather than the engine, but because the editor will
write arbitrary Unicode prose it must be verified end-to-end with a controlled
UTF-8 payload through the real stores client.

### Working architecture to preserve (do not rebuild)

Writes route through the engine `/ops/core/{verb}/write` and `/ops/core/create`
brokers to `vaultspec-core`; the engine validates and bounds every field
(injection-guard on ref, blob hash, list entries, tokens), streams the body to the
sibling stdin, and forwards the envelope verbatim with the tiers block — the engine
persists nothing and stays read-and-infer. The editor UI lives in the dock
workspace (`MarkdownDocView` view/edit modes) over the bounded editor slice. The
hardening builds strictly on this seam; it never exposes the frontend directly to
`vaultspec-core` or `vaultspec-rag`.
