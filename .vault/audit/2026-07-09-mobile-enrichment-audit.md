---
tags:
  - '#audit'
  - '#mobile-enrichment'
date: '2026-07-09'
modified: '2026-07-09'
related:
  - '[[2026-07-08-mobile-enrichment-adr]]'
  - '[[2026-07-08-mobile-enrichment-plan]]'
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #audit) and one feature tag.
     Replace mobile-enrichment with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `mobile-enrichment` audit: `phase review and revisions`

## Scope

The mandatory review gate for the `mobile-enrichment` feature — a read-only review of
the single committed change (`7b61b9b515`) implementing the four accepted ADR decisions
(D1 compact workspace switcher, D2 compact inline rail metadata, D3 shared reader trail,
D4 edge-swipe back) against the binding project rules. An independent reviewer graded the
diff; the revisions below were then applied to the working tree and re-checked.

## Findings

### switcher-recent-section | high | The compact switcher dropped the ADR-mandated Recent section

The first-pass `WorkspaceSwitcherSheet` consumed only the worktree and project rows of
the `useWorktreePickerView` projection, omitting the cross-project `recentRows` /
`activateRecent` the ADR's D1 explicitly requires and the desktop picker renders. A phone
user who had jumped across worktrees — the exact audience D1 targets — had no fast
re-orientation path. Not a safety or wire defect; ADR/intent drift. REVISED: the sheet now
renders a "Recent" section (guarded `activateRecent`) ahead of Worktrees, gated on
`recentRows.length > 0`.

### compact-browse-h1 | medium | Browse lost its level-1 heading on compact

Making the top-bar title a switcher trigger replaced the `<h1>` with a bare `<button>`, so
the default compact landing surface had no level-1 heading for assistive tech while every
other surface kept one. REVISED: the trigger button is wrapped in an `<h1 class="contents">`
so the accessible name stays interactive AND a heading.

### switcher-dismiss-order | low | The sheet dismissed before the unsaved-edit guard ran

The switch handlers called `onDismiss()` then `guardUnsavedDiscard(...)`, so a dirty draft
saw the sheet close before the discard confirm appeared — a UX inconsistency with the
desktop precedent (no draft loss; the guard still blocked the switch). REVISED: guard first,
dismiss only inside the proceed callback.

### swipe-touch-action | low | The edge-swipe container lacked touch-action hardening

The D4 gesture logic was correct and non-stale, but the swipe container set no
`touch-action`. REVISED: both reader panes now set `touch-action: pan-y` so the browser owns
vertical scroll and the gesture claims only horizontal travel. Real-device scroll/OS-back
interplay remains a live-device verification item, as the ADR's Consequences already scope.

### clean-surfaces | low | D2, D3, and the guard test were confirmed clean

D3 (`buildDocTrail`) is a behavior-preserving hoist of the former private `docTrail`. D2
(`docCompactSubMeta`) reuses the shared presentation helpers with no client-side
re-derivation, correctly keyed on `useViewportClass()`, and suppresses the desktop
signal/meta so a row never shows both. The new guard test runs against the real engine with
only `matchMedia` stubbed. No new fetch, no raw `tiers`, no filter re-authoring, no
canvas/graph touch anywhere in the diff.

## Recommendations

- All four review findings are addressed in the working tree; the full lint gate and the
  live-engine compact guard test are green. Land the revision commit.
- Carry the D4 real-device verification (iOS system-back / scroll-intent) as the one open
  item beyond merge, per ADR D4.
- No rule promotion warranted from this review; the findings were feature-local intent/a11y
  gaps, not recurring cross-surface hazards.
