---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S32'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-design-adoption with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S32 and 2026-06-14-dashboard-design-adoption-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Re-skin the rag search surface onto the new tokens and sanctioned icons per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green and ## Scope

- `frontend/src/app` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Re-skin the rag search surface onto the new tokens and sanctioned icons per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green

## Scope

- `frontend/src/app`

## Description

This is the last surface and a boundary correction, not a visual re-skin: the
rag-search controller is a stores-layer controller with no pixels of its own.

- Author the rag-search controller as a new stores-layer module
  (`searchController.ts`), the sole wire client for search: it issues the keyed
  search query, holds the engine-enumerated filter vocabulary, reuses the rail's
  already-cached vault tree for the text-match fallback, owns the node-id grammar,
  and exposes one interpreted selector.
- Relocate the rag-down fallback out of the chrome layer: move
  `buildFallbackResults`, `isSemanticOffline`, and `isTransportError` from the
  view-directory `searchFallback` module into the stores controller, deriving the
  fallback doc node id from a stores-owned grammar rather than the upward import
  of the chrome `pathToNodeId` helper that the old fallback reached for.
- Expose one interpreted `useSearchController` selector returning the explicit
  modeled states (`idle`, `loading`, `results`, `no-results`, `semantic-offline`,
  `error`) plus `results`, `semanticOffline`, `noCodeFallback`, `pending`,
  `error`, `filterVocabulary`, and `retry`; make the view a dumb consumer of that
  single selector and stop it importing the chrome-resident fallback.
- Debounce the keystroke stream onto a settled term (trailing-edge, 200ms) so a
  fast typist does not fan out a request per character; key by `(target, query)`
  so a superseded query's in-flight request is abandoned and a slow earlier
  response never overwrites a newer one; disable while the input is empty.
- Invalidate the search cache on a rag-health transition over the backends
  stream so a rag-came-back transition lets a previously degraded query re-issue
  against the live semantic tier; scope-change re-reads through the scope-keyed
  fallback tree and the re-issued query.
- Gate degradation on the tiers truth: derive semantic-offline from
  `tiers.semantic.available` (the 502 error envelope or the success-envelope tier
  block), never from a bare transport error; gate the text-match fallback on that
  truth, scored strictly below semantic certainty; surface code-target offline as
  an explicit no-fallback state, never a misleading empty result.
- Hold the node-id floor: engine annotation when present, else grammar-derived
  `doc:{stem}` / `code:{path}`, else null (honest non-clickable), never papering a
  code hit as a `doc:` id.
- Restore mock fidelity: serve the live nested rag envelope
  (`{envelope: {ok, data: {results}}}`) on the `/search` success path so
  `adaptSearch` is exercised against the real wire shape, keeping the 502 rag-down
  path carrying `tiers.semantic.available:false`.
- Delete the chrome-resident `searchFallback` module and its test; relocate the
  fallback/degradation unit tests and add the controller state-machine,
  debounce/cancel, code-target-offline, tiers-gated degradation, and node-id-floor
  tests; add the live-sample-through-`adaptSearch` parity proof and the
  mock-serves-the-nested-envelope assertion.

## Outcome

The rag-search controller is a single stores-layer wire client: the fetch, the
node-id reconciliation, the filter vocabulary, and the tiers-gated degradation gate
live in one slice; the search view stays dumb and renders one interpreted selector.
The chrome no longer reaches the wire. The full frontend lint gate (eslint +
prettier + tsc) exits 0, and the full frontend suite is green (778 passed, 9
pre-existing skips); the four directly-touched suites pass 71/71.

## Notes

The search view's results list previously gated rendering on the interpreted
`results` state alone; the controller's held-last-good-under-error contract
required the list to render whenever the controller hands back hits (semantic,
offline fallback, or the held set under the error banner), so the view's
show-results gate was simplified to "are there results to show". Two chrome render
tests that asserted synchronous loading needed an await to account for the new
keystroke debounce. The rag-health invalidation reuses the backends SSE channel
the rollup already subscribes to; in unit tests that intercept only `/search`, the
backends stream falls back to real fetch and logs a harmless connection-refused —
test noise, not a failure.

The ADR was sufficient: every controller requirement (sole wire client, debounce/
cancel, tiers-gated degradation, node-id floor, filter vocabulary, rag-health
invalidation, mock fidelity) mapped cleanly onto the implementation with no
contract gap surfaced.

## Revision (independent review: PASS-WITH-REVISIONS)

The first commit returned PASS-WITH-REVISIONS — one HIGH correctness defect plus
two MEDIUM test-fidelity gaps; the relocation, tiers precedence, fallback honesty,
node-id grammar, debounce, and mock fidelity were all confirmed correct. Fixed in
the revision:

- HIGH: the rag-health invalidation was edge-detected by accumulator LENGTH, but
  the stream reducer ring-caps the accumulator at its retention bound — once the
  stream saturated, the length pinned forever and every rag-health transition after
  the cap was silently dropped, leaving a recovered rag pinned to the text-match
  fallback for the rest of the session. Replaced with a VALUE-based detector: a
  pure helper reads the most-recent backends frame's rag lifecycle word (available
  only when exactly "running") and the effect invalidates only when that boolean
  flips versus a ref-held prior value, guarding the initial undefined. Robust to
  the ring cap and free of the prior spurious per-frame invalidation.
- MEDIUM-1: added the live two-phase hook test — a healthy search settles on the
  key, a 502 refetch on the same key carries a fresh rag-down tiers block, and the
  controller transitions to semantic-offline rather than staying on the held
  success tiers (the wiring proof the pure precedence test cannot give).
- MEDIUM-2: added the superseded-in-flight-query test — the first term's request is
  held open, the term advances to a new key which settles, the stale request
  resolves late, and the controller's results reflect only the newer key.
- Added a deterministic ring-cap regression test that drives the real stream
  reducer past saturation and asserts the capped accumulator length is pinned while
  the value detector still flips on the recovery frame.

Full lint gate exits 0; full frontend suite green (789 passed, 9 pre-existing
skips); the four directly-touched suites pass 79/79.
