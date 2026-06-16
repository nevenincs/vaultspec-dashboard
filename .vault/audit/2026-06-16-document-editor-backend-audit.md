---
tags:
  - '#audit'
  - '#document-editor-backend'
date: '2026-06-16'
modified: '2026-06-16'
related:
  - "[[2026-06-16-document-editor-backend-plan]]"
---



# `document-editor-backend` audit: `vault-conformant document editor backend`

## Scope

The vault-conformant document editor backend, end to end across two repositories:
the new `vaultspec-core` `vault set-body`/`set-frontmatter`/`edit` verbs (with the
git-blob-hash optimistic-concurrency helper and the refuse-on-error conformance
gate), the engine `/ops` core write and create channels, and the dashboard
stores-layer mutations, bounded editor view-state, read-side derivations, and
mock write-fidelity. The audit covers the automated gates, an independent code
review, and a manual exercise of the full editor loop against a synthetic corpus
copied to scratch — never the live vault.

## Findings

### Automated gates (all green)

- `vaultspec-core` verbs: ruff + the type checker clean; 21 new verb tests plus
  the full unit suite (1245 tests) pass; the CLI-reference generator stays in
  sync. The blob OID byte-matches `git hash-object`.
- Engine write + create channels: `cargo test -p vaultspec-api` green including
  the new channel tests; `cargo clippy` and `cargo fmt --check` clean, no
  `#[allow]`.
- Frontend: 1779 stores/view tests pass including the new mutation, editor-slice,
  and captured-live-sample adapter tests; `just dev lint frontend` exit 0.
- Integrated tree: `just dev lint all` exit 0 (eslint + prettier + tsc + rustfmt +
  clippy) — the full gate, not a partial subset.

### Manual synthetic-corpus exercise (all behaviors verified live)

A framework-only `vaultspec-core install core` workspace was scaffolded to a
scratch directory with conformant documents; the real verbs were driven against
it from the feature worktree. Verified:

- **Save body** via stdin returns `status:"updated"` with a fresh post-write blob
  hash and zero blocking diagnostics.
- **Optimistic concurrency:** a save with a stale `--expected-blob-hash` returns
  `status:"failed"`, `conflict:true` with `expected`/`actual`, and the file is
  **not written** (the on-disk hash is unchanged) — no silent overwrite.
- **Conformance refusal:** a frontmatter edit producing an invalid tag set returns
  `status:"failed"`, `refused:true`, with **field-level `checks`** (severity
  `error`, `fixable` flags, the originating check name) and no write — exactly the
  mark-invalid data the editor surfaces.
- **Valid frontmatter** edit (set `related`) and the **combined `edit`** verb
  (body + date in one atomic write) both return `updated`.
- **Lint** (`vault check all --json`) returns the twelve checks with per-issue,
  fixable-flagged diagnostics; **autofix** (`--fix`) applies only the safe fixes
  and leaves the non-auto-fixable ones, never overreaching.
- **Truncation** is a read-path concern bounded by the content route's
  `MAX_CONTENT_BYTES` ceiling, covered by the content-route tests.

### Architectural conformance

- **Read-and-infer fence intact:** every write is a forward through the `/ops`
  proxy to `vaultspec-core`; the engine adds no vault-write or ref-mutation path.
  No `engine-read-and-infer` supersession was needed.
- **Verbatim-forward contract:** a sibling `status:"failed"` conflict/refusal that
  exits non-zero is forwarded as HTTP 200 under `data.envelope` with the tiers
  block; only a true crash/timeout degrades to 502/504. A business refusal is
  never turned into a gateway error, and the client branches on the envelope
  status, not the HTTP code.
- **Bounded editor state:** the editor view-state is a single open target with a
  single draft string and a status enum, no undo/history accumulator, cleared on
  scope and workspace swap — honoring the bounded-accumulator rule.
- **Mock mirrors live:** the mock serves the exact engine wire shape, mutates and
  re-hashes its in-memory corpus, and emits the conflict and typed-refusal
  envelopes; a captured-live-sample adapter test proves the adapter handles the
  live shape.

### Independent code review

An independent review across both repos returned **PASS-WITH-NITS** — no CRITICAL
or HIGH findings, and every safety-critical mechanism (the verbatim-forward
contract, the subprocess cap-and-timeout, the read-and-infer fence, the bounded
editor slice, the refuse-to-write gate, and the blob-OID interop) verified correct
and well-tested, with no tautological or over-mocked tests. Two MEDIUM findings
were raised and **both landed** before close:

- **MEDIUM-1 (correctness, the production path):** the `--body-stdin` channel did
  not normalize CRLF, and the engine write channel uses stdin exclusively — a
  `\r\n` draft would corrupt the LF-contract write (double-CR on CRLF files,
  stray CR on LF docs). Fixed to normalize stdin identically to the file channel,
  with a regression test asserting no double-CR survives. Re-verified: this would
  have been a corpus-affecting defect once `edit` became the live save, caught and
  closed while still free.
- **MEDIUM-2 (layering):** the stores layer imported the vault frontmatter parser
  from the app layer, inverting the one-way app→stores→engine boundary. Fixed by
  relocating the pure parser into a stores-owned module; the reader and header now
  re-import it. Frontend gate green after the move.

The LOW nits (a BOM-tolerance fixture, an uppercase-hex doc note, the combined
`edit` newline path now covered by the MEDIUM-1 fix) are optional and recorded for
follow-up. With the two MEDIUM revisions landed the review verdict is effectively
**PASS**.

### Open / deferred

- **Release + pin (the long pole).** The new verbs are committed on the core
  branch and PR'd, and verified via a feature-worktree dev path, but the dashboard
  consumes the published wheel: the verbs are not usable by the production
  dashboard until a `vaultspec-core` release ships and the dashboard pin is
  bumped. This is the final, explicitly-gated outward step.
- **Editor write-states** (dirty/saving/saved/save-failed/conflict) have no Figma
  source beyond the header `Unsaved` indicator; they are implemented in the view
  store and anchored on that indicator, pending a design pass.
- The editor **chrome UI** (the Edit-mode component that consumes the mutation
  hooks) is a frontend follow-up outside this backend scope; the layering note is
  recorded so a future builder keeps writes on the stores hooks, never a direct
  fetch.

## Recommendations

- Land the `vaultspec-core` release and bump the dashboard pin as the final step,
  backing out any editable dev-bridge first to preserve published-wheel purity.
- When the editor chrome is built, route every write through the stores mutation
  hooks / the `ops:run` dispatch seam — never a direct engine-client call from the
  app layer.
- Confirm the exact `checks` content of a real engine-forwarded refusal against a
  captured live sample once the release is in the production path (the adapter is
  already robust to the generic `refused:true` + `checks` shape).

## Codification candidates

- **Source:** the read-and-infer write seam held cleanly across the whole feature.
  **Rule slug:** `vault-writes-route-through-core-via-ops`.
  **Rule:** Every dashboard mutation of a `.vault/` document is performed by a
  `vaultspec-core` verb reached through the engine's `/ops/*` sibling proxy; the
  engine never writes `.vault/`, mutates a ref, or grows sibling write semantics,
  and the stores layer is the sole wire client of that write path. (Promote only
  after it holds across a second cycle; extends `engine-read-and-infer` to the
  write direction.)
- **Source:** the refuse-to-write conformance gate.
  **Rule slug:** `editor-refuses-to-persist-nonconformant-docs`.
  **Rule:** A document write verb validates the post-edit content against the
  standardized health-checks before writing and refuses on any ERROR-severity
  diagnostic, returning the field-level diagnostics rather than persisting an
  invalid document. (Candidate; promote only if it holds across the feature's
  cycle.)
