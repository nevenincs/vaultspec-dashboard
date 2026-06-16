---
tags:
  - '#adr'
  - '#document-editor-backend'
date: '2026-06-16'
modified: '2026-06-16'
related:
  - "[[2026-06-16-document-editor-backend-research]]"
---



# `document-editor-backend` adr: `vault-conformant document editor backend` | (**status:** `accepted`)

## Problem Statement

The dashboard can read vault documents but cannot write them. The read path
shipped and was reviewed PASS (feature `review-rail-viewers`): a bounded,
read-only content route, a stores content query, a shared highlighter, and
read-only viewers. The Figma Edit-mode design and the standing goal require the
complementary half — a document **editor backend** that lets a user save body
prose, create a new document, and edit frontmatter, and does so **conformantly**:
the editor must lint, autofix, and mark invalid formatting against the framework's
standardized health-checks, and must never persist a non-conformant document
silently. This ADR records how that backend is built across the two repositories
it touches — the dashboard and the external `vaultspec-core` framework — while
holding the engine's read-and-infer fence.

## Considerations

- **Who owns the write.** `vaultspec-core` owns all `.vault/` CRUD, template
  conformance, tag taxonomy, wiki-link resolution, and the `modified:` stamp. The
  engine is read-and-infer and must stay so. Therefore every write is performed by
  `vaultspec-core`, reached through the engine's existing transparent `/ops/*`
  sibling proxy; the engine forwards and persists nothing itself.
- **The conformance machinery already exists and is field-level.** The core
  checker suite produces per-document, per-issue diagnostics carrying
  `path / message / severity / fixable / fix_description`, and `vault check all
  --json` already serializes them. This is precisely the "mark invalid / autofix
  available" surface the editor needs — it is reused, not reinvented.
- **No edit verb exists.** Core has `add` (create) and `link` (related-edge
  surgery) but no body-save or frontmatter-edit verb. The reusable primitives —
  metadata `validate()`, newline-preserving read, atomic write-with-rollback,
  `modified:` refresh, the related resolver, and `run_all_checks` — are all
  present and clean to compose. The verbs must be authored from them.
- **Optimistic concurrency.** The read path already returns a `blob_hash`: the git
  SHA-1 blob OID over the raw file bytes, computed by the engine's structural
  reader. A save echoes that token; a stale token must surface a conflict, never a
  silent overwrite.
- **The editor scope.** The Figma Edit variant edits raw Markdown body plus a
  PROPERTIES card of `tags / date / related` (title is the body H1, not a
  frontmatter field). Only Markdown documents are editable; the code viewer stays
  read-only.

## Constraints

- **The `/ops` core proxy cannot pass a body today.** It forwards a fixed
  read-only whitelist and spawns the sibling with stdin nulled and a hardcoded arg
  array plus a forced `--json`. Supporting writes requires a new whitelist entry
  AND a request-body/argument channel on the proxy. This is a contract addition,
  the central engine task, and the precondition for any save reaching core.
- **Release coupling is the long pole.** The dashboard consumes the published
  wheel (`vaultspec-core>=0.1.31`) with no editable dev install wired. A new verb
  is unusable by the dashboard until a new wheel is published and the pin bumped.
  Core releases via Conventional-Commit-driven release-please: a `feat:` commit
  opens a release PR; merging it tags and publishes. The end-to-end ordering —
  author the verb in core, release it, bump the pin — spans two repos and two
  release cadences and must be sequenced explicitly.
- **Parent-feature stability.** The read path (`review-rail-viewers`), the `/ops`
  proxy's bounded sibling runner (cap + timeout already in place), and the shared
  envelope/tiers helpers are all shipped and stable; the editor builds directly on
  them. The one immature surface is the new core verb, which is why it is gated
  behind the core repo's full CI (ruff, type-check, tests, Windows vault-repair,
  vault-audit) before release.
- **Cross-repo process.** The core verb work must be filed as a GitHub issue
  (which bootstraps a feature worktree), flow through a PR with green CI, and merge
  as a Conventional-Commit `feat:` — the core repo's native process, matching the
  required gh-issue + worktree/PR flow.

## Implementation

The backend is built in four layers, sequenced by the release dependency.

**1. `vaultspec-core` — the edit verbs (filed as gh issues, built in a worktree,
released).** Author three composed verbs. `vault set-body` resolves a document,
reads it preserving newlines, keeps the frontmatter, replaces the body, refreshes
`modified:`, runs the relevant checker(s) on the new full text, and writes
atomically — refusing to write on any ERROR-severity diagnostic while allowing and
returning WARNING/INFO. `vault set-frontmatter` assembles and `validate()`s the
metadata (canonicalizing `--related` through the shared resolver) before an atomic
write. An optional combined `vault edit` performs both in one atomic write and is
the engine-facing "save" verb. Each accepts `--expected-blob-hash` and computes
the **identical** git blob OID core-side (a pure `hashlib.sha1` over the
`"blob " + len + "\0" + bytes` prefix, byte-matching the engine's reader),
comparing the pre-write on-disk bytes for the conflict check and returning the
post-write OID on success. Each emits the shared `--json` envelope
(`schema/status/data`, with `data` carrying the new path, the new `blob_hash`, and
the `checks` diagnostics); a conflict is `status="failed"` with `data.conflict`
and a non-zero exit. A lint/autofix action is served by forwarding `vault check`
(read) and `vault check --fix` (autofix) — the diagnostics already carry the
fixable/severity fields the UI marks.

**2. The engine `/ops` proxy — a write channel (read-and-infer preserved).** Add a
write-verb whitelist and a request-body channel to the core proxy: a POST route
accepts a validated JSON body (the doc id, the body text, the expected blob hash,
the typed frontmatter fields) and passes it to the sibling via stdin or a temporary
`--body-file`, keeping the existing bounded runner's stdout cap AND wall-clock
timeout. The forwarded sibling envelope passes through verbatim; the engine wraps
it in the shared envelope with the `tiers` block on success AND error, and maps a
core conflict (`data.conflict`/non-zero exit) to a tiered conflict response with a
machine-readable `error_kind`, never a bare 500. The engine writes nothing; it only
forwards bytes to the sibling that owns the write.

**3. The stores layer — the sole wire client.** Add `useSaveBody`,
`useCreateDoc`, and `useSetFrontmatter` mutations beside the existing settings
mutation pattern, each routing through the `/ops` dispatch seam (extended to carry
a `body`). Each follows read → echo the `blob_hash` → write, and on success
invalidates the content query, the graph subtree, and the vault-tree query (create
also widens the filters vocabulary and returns the new `doc:<stem>` id to open). A
stale-hash conflict and any validation failure are read from the `tiers` block and
`error_kind`, never guessed from a transport error. Editor UI state is a **bounded**
slice on the zustand view store — a status enum
(`idle | dirty | saving | saved | save-failed | conflict`), the single open
target's draft text, and its `baseBlobHash`, with **no undo/draft history** — cleared
on scope/workspace swap exactly as the viewer target is.

**4. The mock + read-side derivations.** The mock engine is brought to live
fidelity: `/ops/core/*` write verbs mutate the in-memory corpus and re-hash so a
read-after-write returns the new `blob_hash`, implement the conflict on a stale
base hash, and mirror core's typed rejections as tiered errors — proven by feeding
a captured live `vaultspec-core --json` write envelope through the real adapter.
The three read-side fields the editor/reader surface (doc-type, read-time,
resolved-vs-broken links) are all derived client-side from data the stores already
hold; **no field is added to the content endpoint** (doc-type is on the graph node,
read-time is a function of the served text, link state is on the structural edges).

## Rationale

Routing writes through `/ops` to `vaultspec-core` is the only option that keeps the
engine read-and-infer while giving the editor a conformant write path: core already
owns the validation, the autofix, the atomic write, and the `modified:` stamp, and
its `--json` diagnostics are already field-level (research §E), so the editor's
lint/mark-invalid surface is reuse rather than new engine semantics. Computing the
git blob OID core-side is what makes `--expected-blob-hash` interoperate
byte-for-byte with the hash the read path already returns (research §E), giving
honest optimistic concurrency with no new identity scheme. Deriving the three
read-side fields client-side rather than extending the content route honors the
single-projection discipline and keeps the read hot path unchanged (research §D).
The two engine-side blockers — the body channel and the release coupling — are
named as the long pole precisely because they, not the core verb logic, gate
"save works end-to-end" (research §E).

## Consequences

- **Gains:** a conformant editor that cannot silently persist an invalid document;
  a lint/autofix/mark-invalid surface for free from the existing checker
  diagnostics; honest stale-write conflict handling; the engine fence intact with
  no rule supersession; and a reusable `/ops` write channel that future
  operational write needs can extend through the same whitelist discipline.
- **Difficulties:** the work spans two repos and two release cadences. Until the
  new wheel is published, the dashboard cannot call the verb against the published
  pin; a temporary editable install of the core worktree is the dev bridge for
  integration, backed out before commit to preserve published-wheel purity. The
  editor write-states have no Figma source beyond the header `Unsaved` indicator
  and are designed here, anchored on that indicator.
- **Pitfalls to guard:** the `/ops` body channel must not become a generic
  argument-injection vector — the whitelist and per-field validation discipline
  the proxy already applies to git/rag verbs must extend to the write body. The
  conflict check and the returned hash must both be over raw file bytes
  (CRLF/LF-preserving) to byte-match the engine reader, or the optimistic token
  will spuriously conflict. The mock must mirror the real sibling envelope, not a
  convenient stub, or the write path ships green and breaks against live core.

## Codification candidates

- **Rule slug:** `vault-writes-route-through-core-via-ops`.
  **Rule:** Every dashboard mutation of a `.vault/` document is performed by a
  `vaultspec-core` verb reached through the engine's `/ops/*` sibling proxy; the
  engine never writes `.vault/`, mutates a ref, or grows sibling write semantics,
  and the stores layer is the sole wire client of that write path. (Holds across a
  full cycle before promotion; extends `engine-read-and-infer` to the write
  direction.)
- **Rule slug:** `editor-refuses-to-persist-nonconformant-docs`.
  **Rule:** A document write verb validates the post-edit content against the
  standardized health-checks before writing and refuses on any ERROR-severity
  diagnostic, returning the field-level diagnostics rather than persisting an
  invalid document; WARNING/INFO are surfaced, not blocking. (Candidate; promote
  only if it holds across the feature's cycle.)
