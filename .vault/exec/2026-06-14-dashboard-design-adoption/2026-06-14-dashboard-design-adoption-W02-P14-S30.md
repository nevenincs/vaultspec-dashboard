---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S30'
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
     The S30 and 2026-06-14-dashboard-design-adoption-plan placeholders are machine-filled by
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
     The Re-skin the worktree switcher onto the new tokens and Lucide chrome per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green and ## Scope

- `frontend/src/app` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Re-skin the worktree switcher onto the new tokens and Lucide chrome per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green

## Scope

- `frontend/src/app`

## Description

Re-skinned and gap-filled the worktree switcher (`WorktreePicker.tsx`) onto the OKLCH
token layer and the Lucide chrome plane per the accepted worktree-switcher surface ADR.
The scope fence held to the single ADR-named component plus one stores-layer selector
addition and the test; `VaultBrowser.tsx`, `styles.css`, and scene files were untouched.

Per-ADR React element inventory, each mapped to existing JSX or NEW:

- Collapsed trigger / current-scope display: EXISTING trigger button, re-skinned. Now
  carries `aria-controls`, an intent-revealing `aria-label`, a token-bounded hover
  transition, and a visible focus ring.
- Disclosure caret: was a literal Unicode triangle; NOW Lucide `ChevronDown` / `ChevronUp`
  structural chrome.
- Git sync badge (ahead / behind / dirty): was literal Unicode arrows + a dot glyph; NOW
  Lucide `MoveUp` / `MoveDown` marks with tabular-numeral counts (`data-tabular`) and a
  `Dot` dirty mark in the single muted accent, shown only when there is git state to
  report.
- Scope / worktree list: EXISTING list, re-skinned as a labelled `ul` with corpus-first
  ordering preserved through the unit-tested `orderWorktrees`.
- Per-row branch identity, default / bare markers: EXISTING, retained as quiet inline
  labels; worktree path is monospace path-identity via the row `title`.
- Degraded marker: was a literal Unicode warning glyph; NOW Lucide `TriangleAlert` with
  the structural reason in the row title.
- Active-scope cue: EXISTING fill + weight, gap-filled with a NEW grayscale-safe leading
  accent bar and `aria-current="true"` so the cue survives without hue.
- Switch affordance: EXISTING `setScope` invocation, retained as a dumb invoker of the
  stores' wholesale-stateless reset.
- States — loading, empty / single-scope (NEW), switching / pending (NEW), degraded (NEW,
  via a new stores selector), error with retry (EXISTING), rejected-durable-switch
  (EXISTING, message sharpened).
- Keyboard contract + a11y: NEW roving arrow navigation across rows, Enter / Space
  activation, Escape-collapse-to-trigger, `aria-disabled` on bare / degraded rows,
  `role="status"` on the degraded and rejected-switch messages, and keyboard-initiated
  toggles rendered instant (no expand animation).

Implementation, in order:

- Add `useWorkspaceMapAvailability` to the stores query layer (mirrors
  `useVaultTreeAvailability`): derives the map's degradation from the `structural` tier
  through the wire client so the switcher reads degradation truth, never the raw `tiers`
  block.
- Replace all literal Unicode glyphs with Lucide chrome marks; consume only semantic
  tokens (no hardcoded hex / px), with tabular numerals on the ahead / behind / dirty
  counts and monospace path identity on the row title.
- Realize every ADR state: a quiet copy-toned `mapping worktrees…` loading line, an
  approachable empty / no-selectable-corpus state, an honest pending transition that
  shows the switching branch on the trigger and a per-row `switching…` cue until the
  active scope catches up, a designed degraded banner with the reason in copy tone, a
  contained `workspace map unavailable` error with a manual retry plus the existing 8s
  self-heal poll, and the transient rejected-durable-switch status line.
- Keep the four-layer ownership boundary: the switcher invokes the stores' `setScope`
  (which owns the wholesale 022 cross-store reset), reads `/map`, `git`, and `tiers`
  only through stores hooks, fetches nothing, and emits the scope-selection intent plus
  the durable session write back through stores.

Tests — added a render suite exercising the real stores client transport (`mockEngine`)
with no component-internal doubles: loading, error-with-retry, the active-scope non-color
cue (`aria-current` plus the accent bar), bare-ref non-selectability, the designed
degraded banner driven by a real served `tiers` block, the keyboard wholesale swap
(Enter on a corpus row clears working-set residue and docks the mode to live), the
rejected-durable-switch line driven by the mock's REAL PUT `/session` 400 on an
unregistered corpus scope, the tabular git sync badge fed a live-shape `/status` body,
Escape-collapse-to-trigger, and arrow navigation between rows. The pre-existing
`orderWorktrees` unit test and the wholesale-swap store test are retained.

## Outcome

The worktree switcher is fully on the new token foundation and the Lucide chrome plane,
with every ADR-named state realized and a complete keyboard + a11y contract. My touched
files — `WorktreePicker.tsx`, `WorktreePicker.render.test.tsx`, and the
`useWorkspaceMapAvailability` addition in the stores query layer — pass eslint, prettier,
and project-wide `tsc` clean. The picker render suite (10 cases) and the existing picker
unit suite pass; the broader `src/app` and `src/stores` suites are green (58 files, 365
tests).

## Notes

The full `just dev lint frontend` gate did not reach exit 0, but solely on concurrent-
agent build artifacts outside this Step's scope: untracked files under
`frontend/src/scene/field/` (the W02.P17 Phosphor domain-mark plane, mid-build by a
parallel agent) are prettier-dirty and one carries a transient bad-import `tsc` error.
None of these are this Step's files, and the rule forbids touching another surface's
components. Verified in isolation that all three of my touched files pass prettier,
eslint, and `tsc` with zero errors, and that `tsc` reports no error outside
`scene/field/`. The git sync badge intentionally continues to read the workspace-global
live status (`useEngineStatus().git`), deduplicated through the same query the now-strip
and changes overview read, per the ADR's "glanceable affordance on the active worktree"
framing; the `MapWorktree` per-worktree `ahead`/`behind` fields exist on the wire but the
ADR scopes the inline badge to the active worktree's live status, so they are left for a
future per-row sync surface.
