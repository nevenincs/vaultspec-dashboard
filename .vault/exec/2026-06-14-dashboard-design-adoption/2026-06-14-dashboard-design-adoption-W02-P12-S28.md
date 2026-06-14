---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S28'
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
     The S28 and 2026-06-14-dashboard-design-adoption-plan placeholders are machine-filled by
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
     The Re-skin the timeline surface onto the new tokens and the animated-transitions motion grammar per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green and ## Scope

- `frontend/src/app` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Re-skin the timeline surface onto the new tokens and the animated-transitions motion grammar per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green

## Scope

- `frontend/src/app`

## Description

Re-skinned and gap-filled the existing timeline surface onto the OKLCH token
foundation and the animated-transitions motion grammar per the accepted timeline
surface ADR. A re-skin plus gap-fill of existing components — no temporal
mechanism was re-architected.

Per-ADR React element inventory (every element the timeline ADR names, mapped to
existing JSX or NEW):

- Lane scaffold (track + axis): EXISTING SVG `<g>` per lane, re-skinned. Lane
  labels moved to the UI type scale token (`text-2xs`, `fill-ink-faint`); lane
  rules and the ruler baseline kept as soft low-contrast token borders
  (`stroke-rule` / `stroke-rule-strong`) — structure felt, not seen.
- Density buckets (histogram bars at coarse zoom): EXISTING SVG `<rect>`,
  re-skinned to a single muted token fill (`fill-ink-faint/55`, rounded), no
  per-bar hue.
- Individual event marks: REWORKED from SVG `<text>` glyphs to a focusable HTML
  overlay of Phosphor domain marks (`GitCommit`, `FilePlus`, `FileText`,
  `FlagPennant` fallback for lifecycle) drawn in `currentColor` — each a real
  keyboard-reachable `<button role=listitem>` with its kind, human time, and
  joined-node count (plus truncation) announced. The retired `●/✦/✧` text glyphs
  and `eventGlyph` are gone; `eventMark` / `eventKindLabel` replace them.
- Ruler / time labels (axis text): REWORKED to HTML `<time data-tabular>`
  endpoints so the mandated tabular numerals apply to every date.
- Playhead (LIVE grip + transport): EXISTING, re-skinned to the accent /
  live-state token (`bg-state-live`) and the stale token off-LIVE
  (`bg-state-stale`); now a full ARIA slider with `aria-valuemin/max/now` and
  human `aria-valuetext`, visible focus ring, and INSTANT keyboard scrub
  (`[`/`]` step a bucket, arrows nudge, Home returns to LIVE) via the new pure
  `keyboardStep` projection.
- LIVE indicator + liveness cue: EXISTING, re-skinned; the purposeful
  pulse/spin cue is tied to the real streaming state only (LIVE pulse, a
  reconnecting spin under `motion-safe`), never ambient.
- RECONNECTING degraded state: EXISTING, re-skinned with a Lucide `RotateCcw`
  mark; read pre-derived from the stores degradation layer, rendered as a
  designed state, never an error.
- Time-travel mode indicator: the `TimeTravelChip` re-skinned to the token
  vocabulary (no brand tint) with a Lucide return-to-live control and tabular
  time; PLUS a NEW non-visual `role=status` live region on the playhead that
  announces LIVE / time-travel / RECONNECTING and states that operational
  actions are disabled — mode honesty conveyed to assistive tech, not eye-only.
- Range-select band + handles: EXISTING, re-skinned from the literal
  `bg-sky-500/10` / `ring-sky-400/40` to the accent token
  (`bg-accent-subtle/40`, `ring-accent/50`) with the base selection ring; the
  committed band is now a focusable labelled region announcing its bounds and
  clearable from the keyboard (Escape / Delete / Backspace).
- Play / clear controls: EXISTING, re-skinned with Lucide `Play` / `X` chrome
  marks and accent / token surfaces.

Realized every state the ADR names — live/now, time-travel-active, scrubbing,
loading (liveness line, never flashes empty), empty / no-history (approachable,
lifecycle-sparse copy when the date-mandate is missing), degraded
(RECONNECTING), and error (contained copy-toned message with retry, scoped to
the timeline). Honored the motion grammar: keyboard scrub is instant, the
reduced-motion floor swaps play-the-range for an instant jump to the range end,
and the bucket-to-mark zoom resolution stays a cut between representations.

Preserved layer ownership: the surface reads events through the stores query
hook and degradation through the stores `useSurfaceStates` selector, emits select
and date-range intent back through shared state, fetches nothing, and never reads
the raw `tiers` block. The single-date-range-writer and single-delta-clock
invariants are untouched.

Tests: updated the lane / glyph unit tests to the new mark mapping and added a
`humanInstant` label test; added `keyboardStep` pure-projection tests (instant
keyboard scrub: step / nudge / LIVE-snap / clamp); added a reduced-motion floor
test proving play-the-range jumps instantly to the range end; added a new
`Playhead.render.test.tsx` exercising time-travel mode honesty through the shared
mode and the stores degradation layer (LIVE value text + non-visual region,
time-travel value text + disabled-ops announcement, RECONNECTING as a designed
state with no error role).

## Outcome

Timeline surface fully on the token foundation and the two sanctioned icon
families (Lucide chrome, Phosphor domain marks), with full keyboard + ARIA
slider semantics, reduced-motion honored, and all seven ADR states realized. The
timeline tests are green (29 passing across the five timeline files); eslint
clean, prettier clean on all authored files, and project-wide `tsc --noEmit`
exits 0.

## Notes

The full `just dev lint frontend` recipe and the full `npm test` run each report
one failing concern that is NOT in this step's scope: prettier flags
`src/scene/field/markGate.ts` and two tests fail in `src/scene/field/svgRaster`
— all untracked scene-layer files authored by a concurrent agent working the
scene surface in parallel. They are outside the timeline scope fence
(`frontend/src/app/timeline`), were not touched or staged here, and are unrelated
to this change. All authored timeline files pass eslint, prettier, and tsc
independently.

No timeline ADR insufficiency surfaced — the ADR's element list, state matrix,
keyboard contract, and motion laws were sufficient to implement directly. One
implementation judgment worth recording for review: the individual event marks
were moved from SVG `<text>` to an HTML overlay layer (lanes / density bars /
ruler baseline stay SVG) because Phosphor marks are React SVG components and
proper focus / ARIA / keyboard semantics are cleaner on real HTML buttons than on
SVG `<text>`; this keeps the marks in-family and a11y-correct without a
foreignObject nest.
