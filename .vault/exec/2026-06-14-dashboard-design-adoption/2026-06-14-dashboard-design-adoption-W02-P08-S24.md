---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S24'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---

# Re-skin the search surface to consume only the new semantic tokens and sanctioned icons per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green

## Scope

- `frontend/src/app`

## Description

Re-skinned the search surface (`frontend/src/app/right/SearchTab.tsx`) and its
degradation seam (`frontend/src/app/right/searchFallback.ts`) onto the OKLCH
semantic token layer and the two sanctioned icon families per the accepted search
surface ADR, gap-filling the full designed state machine, the keyboard/a11y
contract, and the degraded-via-tiers seam — re-skin and gap-fill of existing
components, no new model and no new fetch.

Per-ADR React element inventory, mapped existing JSX to new behaviour:

- Query input — existing `input type=search`; gap-filled with a leading Lucide
  `Search` adornment, a Lucide `X` clear affordance shown once non-empty, the
  accent focus ring from the 12-step role model, approachable placeholder copy,
  and an Escape handler (clear, then blur).
- Target selector — existing `vault`/`code` `radiogroup`; re-skinned so the
  active chip is marked by the accent AND `aria-checked`, not colour alone
  (grayscale-safe), keyboard-instant per the motion law.
- Result rows/groups — existing list rebuilt as an accessible `list` of buttons:
  a Phosphor species mark inferred from the result's stable node-id prefix
  (`doc:` file-text / `code:` code / `commit:` git-commit, dashed-file fallback),
  mono source identity (paths/stems), tabular-numeral score percentage, optional
  excerpt; roving-tabindex (one Tab-stop, ArrowUp/ArrowDown), Enter/Space
  activation; rows keyed on stable node id for object constancy. A null-node_id
  result renders visibly non-clickable with an accessible explanation, still
  readable.
- Ranking/snippet display — tabular-numeral percentage right-aligned; fallback
  scores sit in a lower ink band and carry a labelled "text match" tag so a
  fallback hit never reads as semantic certainty.
- Idle/empty — new approachable prompt (`data-search-idle`), never a blank panel.
- Loading — new liveness cue (`animate-pulse-live`) tied to the real pending
  query; static under `prefers-reduced-motion` via the app-wide floor.
- No-results — new honest message (`data-search-empty`), distinct from idle and
  degraded.
- Degraded (rag offline) — re-skinned to a calm advisory notice
  (`data-semantic-offline`) with a Lucide status mark and the text-match
  fallback; for the code target it states plainly there is no fallback. Read
  through the stores tiers seam, never raw.
- Error — new recoverable transport-error state (`data-search-error`) with a
  retry affordance, kept distinct from degraded per the tiers contract.

Hardened the degradation seam: `useSearchWithFallback` now derives
`semanticOffline` from the tiers block (success `data.tiers` or the
`EngineError.tiers` the transport preserves) via new pure predicates
`isSemanticOffline` / `isTransportError`, rather than a bare `isError` — so the
designed degraded state is read through the tiers seam (contract §2) and a
tiers-less transport failure surfaces as the distinct error state. Added a polite
live region announcing the settled outcome (result count, offline notice,
no-results) to assistive tech.

Added a real render test (`SearchTab.render.test.tsx`) exercising every state
(idle, loading, results, no-results, degraded, error), the roving-tabindex
keyboard contract, and result click-through into the shared view-store selection
through the real `mockEngine` transport — no component-internal doubles; extended
the fallback unit test with the new tiers-seam predicates.

## Outcome

Search surface fully adopted onto the token layer and sanctioned icons. Layer
ownership preserved: the panel consumes the rag controller only through the
`useSearchWithFallback` stores hook, reads degradation only through its
interpreted `semanticOffline` (never the raw tiers block), fetches nothing, and
emits selection by stable node id through the view store's `selectNode`. Full
lint gate `just dev lint frontend` exits 0 (eslint + prettier + tsc). The search
test files pass 19/19; the full suite is green except the concurrently-edited
command-palette surface (P07, in flight in `src/app/palette/`), which my files do
not import.

## Notes

The mock `/search` route serves rag-down as a 502 carrying the tiers block, which
is the canonical degraded signal; 502 is a transient status the query retries
once, so the degraded-state render tests allow for the retry backoff. No ADR
insufficiency: search results carry only `node_id` (not `doc_type`), so the
species mark is inferred from the stable-id prefix — the ADR sanctions exactly
this ("a doc-type/species mark from Phosphor when the result maps to a known node
species"). The enumerated filter-chip vocabulary beyond the target toggle remains
controller-dependent per the ADR ("can ship the target toggle and grow chips
incrementally"); only the target `radiogroup` is realized here, as the ADR
permits. Did not touch `styles.css` or any other surface's files.

### Revision (design review PASS-WITH-REVISIONS, two MEDIUMs + two RECOMMENDED)

Independent design review of the first commit returned PASS-WITH-REVISIONS;
addressed in a follow-up revision commit:

- MEDIUM (roving refs) — replaced the render-phase ref-array reset (a
  render-phase side effect: order-dependent, desyncs under memoization / reorder
  / partial unmount) with the in-repo DOM-at-event-time pattern from
  `NavToolbar.rovingButtons`: result rows carry a `data-search-result` marker and
  the focus order is read from the enclosing list at the moment an arrow key
  fires (`closest('ul')` + `querySelectorAll('button[...]:not(:disabled)')`).
  Disabled null-node_id rows drop out of the roving set, so arrow nav steps over
  them; the list's single Tab-stop is the first selectable row.
- MEDIUM (blanked results) — the transport-error branch of
  `useSearchWithFallback` now returns the last successful `semantic.data.results`
  rather than `[]`, so a transient refetch failure keeps the previously-loaded
  results visible under the error banner + retry (the ADR's "recoverable" error
  state). Result ids are stable across queries (contract §2), so a held result
  stays selectable; no concrete reason found to distrust the stale set.
- RECOMMENDED (double announcements) — the single `sr-only` polite live region
  now solely owns announcements; dropped `role="status"`/`aria-live` from the
  visible loading, degraded, and error nodes (they stay visual only), so a
  screen reader hears each settled outcome once.
- RECOMMENDED (species map) — documented that the `commit:`/`code:`/`doc:`
  prefix map is intentionally chrome-only and non-exhaustive (e.g. `feature:`
  ids fall to the dashed-file fallback; the panel does not own the engine's full
  node taxonomy).

Added a render test proving held results persist under a transient refetch error
(same-key refetch against a failing transport). Re-gated: `just dev lint
frontend` exit 0; search tests 20/20; full suite green.
