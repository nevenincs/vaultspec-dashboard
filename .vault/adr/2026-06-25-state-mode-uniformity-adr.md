---
tags:
  - '#adr'
  - '#state-mode-uniformity'
date: '2026-06-25'
modified: '2026-07-12'
related:
  - "[[2026-06-25-state-mode-uniformity-research]]"
---

# `state-mode-uniformity` adr: `uniform four-mode state system, shared kit, themed glyphs` | (**status:** `accepted`)

## Problem Statement

Every data-bearing surface has four modes — Typical, Loading, Degraded, Empty — but the
non-typical modes are treated INCONSISTENTLY across the binding Figma file and the
frontend (per the research grounding): ~10 surfaces show TEXT in their loading state,
vocabulary drifts (unavailable / degraded / error), several surfaces render no Degraded
mode at all, and most hand-roll ad-hoc classes/strings/glyphs instead of composing a
shared, theme-bound primitive. In Figma the state designs are scattered instances, not a
uniform `State=` variant axis, and one (`LoadingState` 741:3477) is a near-blank stale
design. The user directive: every Figma design is a reusable component carrying its
supported modes, all non-typical modes are uniform, all loading is UI-only (no text),
everything uses shared constants/theme-colors/glyphs (no ad-hoc), and the frontend
matches the Figma visually.

## Decisions

- **D1 — Four canonical modes, ONE vocabulary.** `typical` / `loading` / `degraded` /
  `empty`, used identically on every surface and in both Figma and code. A backend TIER
  reporting down is `degraded`; a transport/capability failure is `error`/`unavailable`
  and is mapped to the SAME degraded TREATMENT (caution glyph + sentence) so the user
  sees one visual language; the word "unavailable" is retired from the rendered surface
  in favour of the degraded treatment with a plain sentence.
- **D2 — Loading is UI-ONLY, never text.** A skeleton mimicking the content rhythm,
  pulsing on the sunken ground under `motion-safe`, with the human label ONLY in
  `sr-only` (`role="status" aria-busy`). No "Loading…/Searching…/unfolding…" copy, no
  spinner-with-label, anywhere.
- **D3 — Degraded and Empty are shared glyph + one plain sentence.** Degraded: the shared
  caution mark (`TriangleAlert` / the `state-stale` dot) + one sentence in `ink-muted`.
  Empty: a shared neutral glyph (`Check` medallion / `Folder`) + one sentence. Never the
  raw tier/branch reason; never an ad-hoc shape or text glyph.
- **D4 — ONE shared frontend kit, composed everywhere.** The canonical primitives the
  rails already embody are generalized into a shared, surface-agnostic kit — a `Skeleton`
  builder (rows/cards, no text) and a `StateBlock` (mode + glyph + sentence) — exported
  from the design-system kit. Every surface COMPOSES them; per-surface
  `loadingClassName`/`unavailableLabel` hand-rolls are removed. Tokens only
  (`text-state-stale`, `text-ink-muted`, `bg-paper-sunken`, the shared pulse utility),
  glyphs only from the two sanctioned families.
- **D5 — Figma carries a `State=` variant axis per data-bearing component.** Each such
  component gets `State=Typical|Loading|Degraded|Empty` as a variant axis (not scattered
  instances), every non-typical variant rendered with the uniform treatment and bound to
  the same color variables and shared glyph components. The blank `LoadingState` and the
  scattered state instances are reconciled into this axis.
- **D6 — Figma and frontend are kept visually identical; the rails are the reference.**
  The rail state bodies (`right/railStates.tsx`, `left/railStates.tsx`) are the canonical
  treatment both sides mirror. A change to the treatment is a change to the shared kit AND
  the Figma variant set, reviewed together.

## Constraints

Large blast radius (~10 frontend surfaces + every data-bearing Figma component), so the
rollout is WAVED, not a single change: (W1) the shared kit + the standard; (W2) migrate
the frontend violators surface-by-surface (loading-text removal, vocab unification,
missing-degraded fill); (W3) the Figma `State=` variant reconciliation; (W4) parity
verification. Each surface's chrome view-deriver (e.g. `statusTabChrome`,
`timelineChrome`) currently supplies the loading label/class; removing it means the
deriver stops emitting the copy and the surface composes the kit instead — a
stores+app change per surface. The rails are stable and already conformant, so they are
the template, not work.

## Implementation

A shared kit module exports `Skeleton` (composable skeleton rows/sections, no text,
`role="status"` + `sr-only` label, `motion-safe:animate-pulse-live`) and `StateBlock`
(`mode: "degraded" | "empty"`, a shared glyph, one sentence, themed tone) — generalized
from `right/railStates.tsx`. Surfaces replace their hand-rolled loading/empty/degraded
markup with these, deleting the per-surface class/label derivations and mapping any
"unavailable" condition onto the degraded `StateBlock`. In Figma, each data-bearing
component is rebuilt with a `State=` variant property whose Loading/Degraded/Empty
variants use the uniform treatment, the shared glyph components, and the bound color
variables; the reference is the rail state bodies. Parity is verified per surface
(Figma variant vs the live rendered mode).

## Rationale

## Consequences

## Codification candidates
