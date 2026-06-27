---
tags:
  - '#research'
  - '#document-editor-backend'
date: '2026-06-16'
modified: '2026-06-16'
related: []
---

# `document-editor-backend` research: `vault-conformant document editor backend`

This research scopes the **backend** for the dashboard's Markdown document
writer/editor. The read path already shipped and was reviewed PASS (feature
`review-rail-viewers`): the bounded, read-only content route, the stores content
query, the shared highlighter, and the read-only viewers. What is missing is the
**editor/writer**: saving body prose of an existing document, creating a new
document, and editing frontmatter — all done conformantly, so the editor can
**lint, autofix, and mark invalid formatting** against the same standardized
health-checks and verification the framework already owns, and never persists a
non-conformant document silently.

The engine stays strictly read-and-infer: every write routes through the
existing transparent `/ops/*` sibling proxy to `vaultspec-core`, which owns
`.vault/` CRUD. No vault-mutation code path is added to the engine, and the rule
fence is honored without supersession. The work spans two repositories: the
dashboard, and the external `vaultspec-core` framework (which must grow the edit
verbs). The dashboard consumes the **published wheel**, so a new verb is coupled
to a `vaultspec-core` release and a pin bump — a real sequencing constraint
captured below.

## Findings

### A. The editor behavioral spec (Figma `SlhonORmySdoSMTQgDWw3w`)

The Edit-mode variant (`268:913`) and the read-states strip (`271:1121`) were
read directly from the live design file. The editor surface is:

- A **header** carrying the breadcrumb, a **save-status indicator** rendered as a
  dot plus text (`Unsaved · ⌘S to save`), and a `View / Edit` segmented toggle.
  The write-status lives in this header text, not in a separate strip.
- A **PROPERTIES card** — the frontmatter editor — with three rows: `tags`
  (rendered as chips), `date`, and `related` (rendered as link chips). There is
  **no `title` row**: a vault document's title is its body H1, and the schema
  frontmatter is `tags`/`date`/`modified`/`related`, so "edit frontmatter"
  concretely means editing **tags, date, and related** (`modified` is
  CLI-maintained and never hand-edited).
- A **raw-Markdown body editor** — a source editor showing `#` headings,
  blockquotes, list items, and `[[wiki-links]]` with a live caret. It is not a
  WYSIWYG surface; the editor edits the document's raw Markdown text. Only
  Markdown documents are editable; the code viewer stays read-only.

The read-states strip (`271:1121`) defines four READ states — `loading`, `empty`
("This document has no content"), `truncated` ("Showing the first 500 KB of
4.2 MB — bounded for safety", with a "Load full file" affordance), and
`not-found` / broken-link ("The link may be broken, or the document was
archived"). These are read-path states the shipped viewer already covers.

**Design gap to flag for the ADR:** the Figma frames do **not** specify the
editor WRITE states (dirty / saving / saved / save-failed / conflict) beyond the
single header `Unsaved · ⌘S to save` indicator. The full write-state set must be
designed, anchored on that header status indicator. The save-failed and conflict
states in particular have no Figma source and are the most important for honesty
(a stale-write conflict must be shown, never silently overwritten).

### B. The write seam — engine `/ops/*` sibling proxy (read-and-infer honored)

The engine already exposes a hardened, transparent sibling proxy in the API
crate's `ops` route module. It forwards a small **whitelist** of sibling verbs,
runs each through a **bounded subprocess runner** that enforces BOTH an 8 MiB
stdout cap AND a 120 s wall-clock timeout — killing the child on either breach
(`subprocess-calls-carry-cap-and-timeout` already satisfied) — and wraps every
response through the shared `envelope` helper with the per-tier degradation block
on success and error (`every-wire-response-carries-the-tiers-block` already
satisfied). The sibling's `--json` envelope passes through **verbatim** under an
`envelope` key; the engine adds only the `tiers` block. The runner spawns in the
active scope's worktree as the working directory.

This is the exact seam the writer rides. The current core whitelist is read-only
(`vault check`, `vault stats`); the write verbs are a **whitelist addition**, not
a new architecture. The engine writes nothing itself, never mutates a ref, and
grows no sibling semantics — the read-and-infer fence holds, so the
`engine-read-and-infer` rule needs **no supersession** (an earlier instinct to
supersede it is unnecessary given this seam).

The content route already returns a **`blob_hash`** (the git blob hash of the
file bytes) per document, alongside `path`, `byte_len`, `language_hint`, `text`,
and an honest `truncated` block, bounded at a 1 MiB `MAX_CONTENT_BYTES` ceiling.
That `blob_hash` is the optimistic-concurrency token the writer echoes back.

### C. The dashboard stores + mock integration

The stores layer is the sole wire client; the app and scene layers never fetch.
The integration points (verified in source):

- **Content read query.** Keyed `(scope, nodeId)`; `blob_hash` is in the response
  but deliberately NOT in the key (reopening is a cache hit; the watcher
  invalidation drives a refetch on change). The hook is bounded with a 60 s
  `gcTime`. A tiers selector makes a FRESH error-envelope's tiers win over a
  stale held-success block, distinguishing transport `errored` from tier
  `degraded` — the consumer-side honesty law. A client-side parser already
  extracts `{tags, date, modified, related}` from the content text for the
  read-mode header.

- **The `/ops` client.** The engine client exposes `opsCore(verb, body)` /
  `opsRag` / `opsGit`; `post()` sets JSON content-type, throws a typed
  `EngineError` (carrying `.tiers`, `.errorKind` from the wire `error_kind`, and
  `.errorMessage`) on non-ok, and unwraps the `{data, tiers}` envelope. The
  response shape is `{ ok, envelope, tiers }` with the sibling envelope forwarded
  verbatim. A single terminal effect on the app dispatcher keyed `ops:run` is the
  registered seam, but its payload type currently has **no `body` field** and
  only `target: "core" | "rag"` — writes must add a `body` to that seam rather
  than bypass it by calling the engine client directly from the app layer.

- **Proposed mutation surface** (beside the existing settings/session mutation
  pattern): `useSaveBody`, `useCreateDoc`, `useSetFrontmatter`. Each follows
  read → echo `blob_hash` → write. On success each invalidates the content query,
  the whole `graph` subtree, and the vault-tree query (a body or frontmatter edit
  can change `related:`/tags, which move edges and the tree); create also
  invalidates the filters vocabulary (a new feature tag widens it) and returns
  the new `doc:<stem>` id so the caller can open it in the viewer. A stale
  `blob_hash` returns a **tiered conflict** the mutation reads from tiers /
  `errorKind`, never guesses from a transport error.

- **Editor view-state (bounded).** View/UI state lives in the zustand view
  store, where the viewer-open intent already lives and every accumulator is
  LRU-capped. The editor adds a bounded slice carrying only a **status enum**
  (`idle | dirty | saving | saved | save-failed | conflict`), the **single draft
  text** for the one open editor target, and its `baseBlobHash` — **no undo/draft
  history** (an append-only history would violate
  `bounded-by-default-for-every-accumulator`). The slice clears on scope/workspace
  swap exactly as the viewer target does.

- **Mock fidelity (a real gap).** The mock currently serves `/ops/core/*` as a
  `{status:"success"}` stub that neither mutates nor echoes a real sibling
  envelope. To honor `mock-mirrors-live-wire-shape`, the mock must serve the EXACT
  `{ok, envelope, tiers}` write shape `vaultspec-core --json` produces, **mutate
  its in-memory corpus and re-hash** so a read-after-write returns the new
  `blob_hash`, implement the **409 conflict** when the request's base hash differs
  from the current hash, and mirror core's typed rejections (bad doc-type, missing
  feature, non-conformant content) as tiered 400s with `error_kind`. Fidelity is
  proven by feeding a captured live `vaultspec-core --json` write envelope through
  the real adapter in the established captured-sample test, plus a mock round-trip
  test for conflict + success.

### D. Read-side field audit — all client-derivable (no new content field)

The new reader/editor design surfaces doc-type, read-time, and resolved-vs-broken
wiki-links. The audit conclusion: **add no field to the content endpoint.**

- **doc-type** — already on the graph node payload the stores hold; derive
  client-side keyed by the viewer's node id. Adding it to the content route would
  duplicate an existing field and violate the single-projection discipline.
- **read-time** — a pure function of the `text` already in hand (word count ÷
  ~200 wpm); the `truncated` block lets it state "≥ N min" honestly. No endpoint
  field; the bytes are already served.
- **resolved-vs-broken wiki-links** — structural edges already carry a
  `state` of `resolved | stale | broken`. Join the parsed `related:` stems
  (mapped to `doc:<stem>` ids) against the open node's outbound structural edges
  to classify each link. Derive client-side.
- **One narrow caveat** — an *inline-body* `[[wiki-link]]` (not in frontmatter)
  that produced no structural edge cannot be classified from edges alone. Only if
  product wants every inline link badged AND the engine does not already emit a
  broken edge for an unresolved inline mention would a new field be justified —
  and then it belongs on `/graph/query` or the neighbors route (link resolution
  is the structural index's job), never on the content route. Verify whether
  broken inline-link edges are already emitted before adding anything.

### E. The vaultspec-core verb surface, conformance machinery, and edit-verb design

**No edit verb exists today.** The vault verb group offers `add` (create from
template; refuses an existing file without `--force`), `link add/remove/list`
(mutates only `related:` edges), `repair` (the heavyweight operator pipeline),
`check all [--fix]`, `sanitize annotations`, `stats`, `list`, and the
`feature`/`adr`/`plan` sub-groups. There is no `set-body`, no `set-frontmatter`,
no generic `edit`. The verb must be authored — but every primitive it needs
already exists and is clean to compose.

**The conformance machinery is the feature's strongest asset, and it is already
field-level.** The checker suite lives under the core `vaultcore/checks` package.
The result contract is a `CheckResult` carrying a list of `CheckDiagnostic`, each
with `path`, `message`, a `severity` of error/warning/info, a **`fixable`** flag,
and a **`fix_description`**. The orchestrator `run_all_checks(root, feature=,
fix=)` runs twelve checkers in order (structure, frontmatter, modified-stamp,
annotations, links, dangling, body-links, orphans, features, references, schema,
rename-integrity) over one shared graph snapshot, and in fix mode applies the
safe per-checker autofixes. Crucially, `vault check all --json` already
serializes those diagnostics per document — so the **lint / autofix / mark-invalid
surface the editor needs exists out of the box**: the engine forwards that
envelope and the UI maps each diagnostic to a "mark invalid" / "autofix
available" affordance. No richer lint result must be invented; the new verb
simply calls `run_all_checks(..., fix=False)` (or the relevant single checker) to
pre-validate before writing, and a `vault check`/lint pass-through serves the
standalone "lint this document" and "autofix" actions.

**Frontmatter validation has one canonical entry point:** the document-metadata
`validate()` method (≥2 tags, exactly one directory tag plus one kebab feature
tag, `date` is `YYYY-MM-DD`, `modified` lenient-but-parseable, `related` entries
are `[[wiki-link]]`). A frontmatter-edit verb assembles the metadata, calls
`validate()`, and refuses to write on any returned error — those strings are the
field-level messages the UI surfaces. The filename schema and structure have
their own validators. The shared `modified:` stamp refresh, the newline-preserving
read (CRLF/LF safe), the atomic write-with-rollback (tmp+rename, plus a `.bak`
restore-on-failure variant), and the `related:` resolver are all existing
helpers; the `related:` surgery verbs already model the exact
read → mutate → refresh-stamp → atomic-write pattern a `set-body` verb mirrors.

**Proposed verb contract** (compose, do not re-implement validation):

- `vault set-body <stem-or-path> [--body-file PATH | --body-stdin]
  [--expected-blob-hash <oid>] [--check/--no-check] [--dry-run] [--json]` —
  resolve the doc, read preserving newlines, keep the frontmatter, replace the
  body, refresh `modified:`, re-parse and run the relevant checker(s) on the new
  full text, and write atomically. Refuse-to-write on any ERROR-severity
  diagnostic; allow and return WARNING/INFO. Both a `--body-file` and a
  `--body-stdin` channel exist so a CLI user can pipe and the engine can pass a
  temp file or stdin.
- `vault set-frontmatter <stem-or-path> [--date] [--tags ...] [--related ...]
  [--expected-blob-hash <oid>] [--dry-run] [--json]` — assemble and `validate()`
  the metadata before writing; canonicalize `--related` through the shared
  resolver; refresh `modified:` automatically. (Title is the body H1, not a
  frontmatter field, so there is no `--title`; large `related:` mass-edits stay
  with the existing `link` verbs.)
- An optional combined `vault edit` taking the body channel plus the frontmatter
  flags for one atomic write per save — recommended as the engine-facing verb so
  the editor's "save" is a single round-trip.

The `--json` result reuses the shared envelope builder: success
`status ∈ {updated, unchanged}` with `data` carrying the new path, the new
`blob_hash`, and the `checks` diagnostics; validation failure `status="failed"`,
exit non-zero, `data.checks` carrying the error diagnostics plus `refused:true`;
conflict as below. The envelope's canonical top-level keys are `schema`,
`status`, `data`, and optional `hints` — there is **no top-level `ok`/`error`/
`tiers`**; the engine adds the `tiers` block when it wraps the forwarded sibling
envelope. A new verb must route through the shared envelope builder (never a
hand-built body).

**Optimistic concurrency at the verb.** Core computes no working-tree blob hash
today; the `blob_hash` the read path returns is computed by the **engine's**
structural reader as the **git SHA-1 blob OID over the raw file bytes** (the gix
`compute_hash` of `"blob " + len + "\0" + bytes`). For `--expected-blob-hash` to
interoperate, the verb must compute the **identical** hash — a pure
`hashlib.sha1` over the git blob prefix plus the raw bytes (no git subprocess
needed), comparing against the **pre-write** on-disk bytes for the conflict check
and returning the **post-write** OID on success. A mismatch exits non-zero with a
typed `data={conflict:true, expected, actual, path}` and never overwrites
silently — the engine maps that to a tiered conflict, the client reads it from
tiers/`error_kind`.

**The two engine-side blockers (the real long pole).**

1. The `/ops` core proxy forwards a **fixed read-only whitelist** and spawns the
   sibling with stdin nulled and a hardcoded arg array plus a forced `--json`. It
   has **no channel to pass a request body** to the sibling. The write verbs
   therefore require a new whitelist entry AND a body/argument channel on the
   proxy — a POST route that accepts a validated JSON body and passes the new
   body text and the typed flags (the doc id, the expected blob hash, the
   frontmatter fields) to the sibling via stdin or a temp `--body-file`. This is
   still read-and-infer: the engine only forwards bytes to the sibling that owns
   the write; it persists nothing and grows no sibling semantics. But it is a
   contract addition to the proxy, not a config change, and is the central engine
   task.
2. **Release coupling.** The dashboard consumes the published wheel
   (`vaultspec-core>=0.1.31`) and has no editable/local-path dev install wired.
   A new verb is unusable by the dashboard until a new release ships to PyPI and
   the pin is bumped. The core repo releases via Conventional-Commit-driven
   release-please: a `feat:` commit opens a release PR; merging it tags and
   publishes the wheel. So the end-to-end path is: author the verb in core →
   merge `feat:` → release-please publishes (e.g. a minor bump) → bump the
   dashboard pin → `uv sync`. To integrate before the release lands, a temporary
   `[tool.uv.sources]` path override (or an editable install of the core
   worktree) is the dev bridge, backed out before commit to preserve
   published-wheel purity.

**Cross-repo workflow (supported as required).** The core repo bootstraps a
feature worktree from a GitHub issue (an `issues` webhook provisions the branch),
so the sanctioned entry point for the verb work is a `gh` issue. The PR gate runs
ruff, the type checker, toml/markdown/link lint, the Python test suite, a Windows
vault-repair regression, and a full vault-audit job — all must pass. Release is
release-please on merge. The user's requirement (gh issues + worktree/PR flow) is
exactly this repo's native process.

### F. Synthetic-corpus manual-test protocol (never touch live vault contents)

Manual, non-test-driven verification must run against a **synthetic corpus copied
to scratch**, never the live `.vault/`. The established read-only method: copy
`.vault` and `.vaultspec` into a scratch worktree (note the engine's
`engine-data` cache directory is not redirectable, so the scratch copy is the
isolation boundary). Against that scratch corpus, exercise the full editor loop
by hand: open a doc in Edit mode; save a body change and confirm the new
`blob_hash` and the re-render; trigger a conflict by mutating the file underneath
a stale hash and confirm the tiered conflict (no silent overwrite); save invalid
frontmatter and confirm the refuse-to-write plus the field-level diagnostics;
run lint and confirm the per-issue marks; run autofix and confirm only safe fixes
apply; create a new doc by type+feature+title and confirm it opens. The corpus
should include conformant docs, deliberately-invalid frontmatter, broken
wiki-links, and a large near-ceiling file for the truncation path. No assertion
in this protocol writes to a production vault.

### G. Open questions for the ADR

- The editor WRITE-state set (dirty / saving / saved / save-failed / conflict)
  has no Figma source beyond the header `Unsaved · ⌘S to save` indicator — design
  the full set in the ADR, anchored on that header status.
- Conflict policy: reject-on-stale (return the conflict; the user reloads and
  re-applies) is the proposed default; a merge UI is out of scope.
- Sequencing across repos and releases: confirm whether a temporary editable
  install of the core worktree is acceptable as the dev bridge so the engine +
  stores work can integrate against the real verb before the PyPI release, with
  the pin bump as the final landing step.
- Whether to ship the standalone lint/autofix pass-through verbs (`vault check`
  forwarding) in the same engine whitelist addition as the write verbs, so the
  editor's "lint" and "autofix" actions and its "save" action share one proxy
  contract.
