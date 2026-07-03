---
tags:
  - '#audit'
  - '#search-providers'
date: '2026-07-03'
modified: '2026-07-03'
related:
  - '[[2026-07-03-search-providers-plan]]'
  - '[[2026-07-03-search-providers-adr]]'
  - '[[2026-07-03-search-providers-research]]'
---

# `search-providers` audit: `one search plane review`

## Scope

Mandatory post-execution review of the fully executed plan (17/17 steps): the
`GET /code-files` contract event (P01), the readers and the shared banded literal
matcher (P02), the `SearchProvider` seam and `useSearchProviders` host (P03), the
palette adoption, plain-language reword, document-finder fold, and right-rail pillar
deletion (P04), and the test closure plus live end-to-end verification (P05). Two
parallel reviewer personas (engine, frontend) read the ADR, plan, research, and
governing rules, then audited every feature commit (`e96b4a40e9`..`7be77242b0`)
with the touched files read whole. Live verification (S17) drove the running dev
SPA: a concept query ranks semantically with plain doc-type eyebrows, a mixed query
interleaves exact code filenames with decision documents per the D2 bands, a
filename query returns exactly its file, and no mechanism vocabulary renders on the
search planes.

**Verdict: engine slice PASS; frontend slice REVISION REQUIRED (one high) —
revisions applied under this audit and re-checked before the feature was called
done.** The S04 collision-residue check (a mid-execution concurrent-edit incident
that transiently broke HEAD) is CLEAN: exactly one `adaptCodeFiles`, coherent
tests, no orphan code.

## Findings

### truncated-not-surfaced | high | The walk-cap honesty chain broke at the provider: a capped code corpus would silently drop files

The engine serves the `truncated` block honestly, the client walk preserves it,
`useCodeFiles` caches it — but `useFilesCodeProvider` read only `entries` and the
palette rendered no incompleteness truth, violating the ADR's explicit constraint
("the provider must render that truth or silently miss files"). Additionally the
CLIENT-side page-cap exit (25 pages x 2000) was a silent partial with a live
cursor. Null on this corpus (826 files, one page) so no user-visible defect today;
the honesty contract was the breach. REMEDIATED under this audit: the provider
result carries the incompleteness truth (server `truncated` OR client walk-cap
exit), and the palette renders a one-line plain-language footer note with a
matching accessible rendering; unit vectors cover capped and complete listings.

### files-providers-not-debounced | medium | The literal providers re-ranked on the raw query every keystroke, drifting from the ADR's host-owned debounce

Only the semantic path consumed the debounced query; the two files providers
re-ran the full-listing rank in `useMemo` per keystroke — linear over capped
listings so cheap today, but ADR drift and a jank risk on a 50k-file corpus.
REMEDIATED under this audit: the literal providers consume the same shared
debounced query as the semantic path (one debounce constant, host-owned).

### degraded-copy-sr-divergence | low | The live region announced degraded copy in a state where the visible surface showed a normal result list

The sr-only live message fired on `semanticOffline` alone while the visible
degraded StateBlock is gated on zero results — when files providers rescue with
hits, a screen-reader heard the degraded sentence with no visible twin and lost
the count announcement. REMEDIATED under this audit: the live message gates on the
same no-results condition, restoring exact twin parity in every state.

### stale-comments | low | Four source comments misdescribed the post-cutover reality

Deleted symbols and pre-fold vocabulary lingered in comments (`searchPill.ts`,
`actionCoverage.guard.test.ts`, `DocumentSearchSurface.tsx`, the palette plane
comments). Source-only, never rendered. REMEDIATED under this audit.

### search-combobox-missing-activedescendant | low | The search inputs declare a combobox without aria-activedescendant (pre-existing)

The search and document planes drive their manual cursor without
`aria-activedescendant`/option ids, while the sibling command plane implements the
pattern correctly. Verified NOT a regression of this feature (the pre-rewrite
surface already lacked it). Recorded as a follow-on: align the two search planes
with the command plane's pattern.

### files-only-invariant-coupling | low | The code-files projection filters by node kind, relying on the upstream files-only cutover

`build_code_file_rows` emits `key` as `path` for every `CodeArtifact` node,
assuming `symbol == None` holds corpus-wide (true today; ingest mints only file
nodes). A future symbol-qualified node would leak a `path#symbol` key. Recorded
follow-on: pin the invariant with a `symbol.is_none()` guard at the projection.

### capped-branch-untested | low | The truncated-present branch of the route has no test

Only the honest-null completion path is exercised (forcing a 50k-file fixture is
impractical); the mapping is a trivial filter-map. Recorded follow-on: a unit test
over a constructed capped `ExtractionStats` asserting the block shape.

### verified-sound | info | The load-bearing invariants both reviewers confirmed

Engine: the projection iterates the full `LinkageGraph` (`CodeArtifact` kind
filter) with no DOI ceiling anywhere on the path; deterministic path order;
exclusive-cursor pagination with unique keys (no dup/miss, proven across page
sizes 1 and 2); `truncated` sourced only from the ingest walk-cap stats; tiers on
success, 400, and 5xx; scope validated; `/code-files` registered in both
`CONTRACT_ROUTES` and the bearer boundary with two-directional guard tests; the
generation memo keys on the CODE generation, single-slot bounded, inheriting only
the accepted benign TOCTOU precedent; per-page and whole-listing bounds real.
Frontend: the merge is score-desc deterministic with best-rank identity dedupe
(node-id first), the 40 bound applies after merge, a semantic outage is a
non-event (files providers keep serving; the dead mode is gone); the D2 bands are
the only literal score source and match the ADR exactly; both files providers
narrow walked-to-completion listings; no selector mints fresh references; all
deletions grep-clean (private matchers, fallback path, panel tab, focus-search
command, presentation view); no mechanism vocabulary renders on the search planes
(the ops console header is the sanctioned exception); the pill composes kit
primitives and bound scene category tokens with value-preserving rem sizes; the
degraded copy and its sr twin are exact-string equal; the test suites mix
meaningful pure vectors with live-wire cases and mock nothing.

### process-notes | info | Execution incidents recorded

A mid-execution concurrent-edit collision transiently broke HEAD (a duplicate
adapter export swept into a commit from another agent's in-flight working-tree
edit); it was serialized, repaired by the corrective commit, and verified
residue-free by this review. Step-record provenance for S04 was corrected to match
git history. The whole-tree lint gate was blocked at S17 closure time by an
UNRELATED concurrent session's uncommitted picker/location refactor; every feature
file passed lint, prettier, and tsc in isolation and at its own commit time. That
refactor has since landed and the full gate was re-run independently by this
review: `just dev lint all` exit 0 — no open verification items remain.

## Recommendations

- Applied under this audit: the truncation-honesty chain through provider and
  palette, the shared debounce, the sr twin parity gate, the comment corrections.
- Scheduled follow-ons, not blockers: aria-activedescendant alignment on the two
  search planes; the `symbol.is_none()` projection guard; the capped-branch unit
  test; the expanded list-plus-reader split (ADR D4 follow-on feature); the
  designed Change (commit) provider as a registration.
- The full gate re-run is DONE (`just dev lint all` exit 0 after the concurrent
  refactor landed); nothing further owed on verification.

## Codification candidates

- The ADR's `search-is-a-provider-plane` rule candidate stands; this cycle adds
  its corollary, proven by the high finding: a provider narrowing a bounded
  listing must SURFACE the listing's incompleteness truth on the rendering
  surface, not merely carry it on the wire. Promote together after the cycle
  holds.
