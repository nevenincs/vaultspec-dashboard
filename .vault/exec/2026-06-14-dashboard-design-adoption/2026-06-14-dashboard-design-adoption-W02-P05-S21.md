---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S21'
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
     The S21 and 2026-06-14-dashboard-design-adoption-plan placeholders are machine-filled by
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
     The Re-skin the sidebar/vault-browser to consume only the new semantic tokens and Lucide chrome per its accepted surface ADR, preserving layer ownership (no new fetch, no raw tiers read), with design review and the full lint gate green and ## Scope

- `frontend/src/app/left/VaultBrowser.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Re-skin the sidebar/vault-browser to consume only the new semantic tokens and Lucide chrome per its accepted surface ADR, preserving layer ownership (no new fetch, no raw tiers read), with design review and the full lint gate green

## Scope

- `frontend/src/app/left/VaultBrowser.tsx`

## Description

Brought the sidebar vault-browser surface fully onto the OKLCH token layer and
the sanctioned icon families per its accepted surface ADR. A re-skin and
gap-fill of the existing component, not greenfield.

- Replace the legacy Unicode `DOC_GLYPHS` map with one Phosphor doc-type mark per
  doc type (`Pencil` research, `Diamond` adr, `ClipboardText` plan, `Stack` exec,
  `SealCheck` audit, `BookOpen` reference, `ListBullets` index, `FileDashed`
  fallback), each shape-distinct at the 14px grayscale-by-shape gate, rendered in
  `currentColor` so hue is never the identity channel. Lucide keeps the
  structural chevrons.
- Add a stores selector `useVaultTreeAvailability` (and the pure
  `deriveVaultTreeAvailability`) in the stores layer that reads the vault-tree
  `tiers` block — from both the success envelope and the preserved
  `EngineError.tiers` — and returns derived degradation truth. The chrome
  consumes the selector and never the raw `tiers` block. Contract §2: an absent
  tier is degradation, not availability; a wholly absent block is the query error
  state, not every-tier-degraded.
- Realize the four honest states: a quiet copy-toned loading line with a
  liveness pulse tied to genuine in-flight work; an approachable empty state for a
  scope with no documents; a designed degraded banner that surfaces the reason in
  copy tone and still lists what loaded; a contained, non-alarming error region
  with a retry control, distinguished from degradation.
- Add the keyboard and a11y contract: roving-tabindex rows under a labelled
  navigation landmark, ArrowUp/ArrowDown row navigation that clamps at the edges,
  disclosure controls carrying `aria-expanded`/`aria-controls`, `aria-current` on
  the highlighted row, a visible focus ring from the focus-ring token, and a
  grayscale-safe selection cue (fill + weight + a leading accent bar, not hue
  alone).
- Hold the typography discipline: tabular numerals (`data-tabular`) on the group
  counts and freshness values; monospace reserved for the stem as path identity;
  the accent tints only genuinely-fresh (`<1h`) items.
- Add tests: the pure helpers (Phosphor mark distinctness, freshness buckets,
  fresh-tint gate), the stores degradation derivation (available / unavailable /
  absent-tier / absent-block), and a rendered component test driving all four
  states and the keyboard contract through the real mock-engine transport.

## React element inventory (per the sidebar ADR)

Every UI element the sidebar ADR specifies for this surface, mapped to its
realization. The rail container, header band, and collapse toggle live in the
parent shell (already token-clean and Lucide-based per the iconography work) and
are out of this step's scoped file; the worktree switcher is a hosted slot owned
by its sibling ADR. The elements below are the vault-browser surface this step
owns.

- Rail container / header / collapse toggle — EXISTING in the app shell;
  token-clean and Lucide chevron already; left untouched (sibling scope).
- Worktree switcher slot — EXISTING hosted slot; sibling ADR; untouched.
- Navigation landmark — EXISTING `nav` with `aria-label="vault browser"`; kept.
- Group disclosure section header — EXISTING; re-skinned: Lucide chevron,
  `aria-expanded` + `aria-controls`, group name, tabular count, focus ring.
- Group count badge — EXISTING; now tabular-numeral (`data-tabular`).
- Doc-type mark — REPLACED: Unicode glyph map to Phosphor marks in `currentColor`.
- Tree row (button) — EXISTING; re-skinned: roving tabindex, arrow-key nav,
  `aria-current`, focus ring, token hover/selection treatment.
- Row stem (path identity) — EXISTING; now monospace per the path-identity rule.
- Row feature tag — EXISTING dimmed `#tag`; kept on tokens.
- Row freshness label — EXISTING; now tabular, accent-tinted for `<1h` only.
- Selection highlight — EXISTING fill; gap-filled to grayscale-safe (fill +
  weight + leading accent bar) and `aria-current`.
- Loading state — NEW: quiet copy-toned pending line with a liveness pulse.
- Empty state — NEW: approachable copy-toned "no documents yet" line.
- Degraded state — NEW: designed degraded banner reading the `tiers` truth
  through the stores selector, reason in copy tone, tree still listing.
- Error state — RE-SKINNED from a bare line to a contained region with retry,
  distinguished from degradation.

## Outcome

Full lint gate `just dev lint frontend` (eslint + prettier + tsc) exits 0. The
frontend test suite is green: 521 passed, 9 pre-existing skips (none introduced
here). Layer ownership preserved — the surface issues no `fetch`, defines no
model, reads degradation only through the stores selector, and emits select /
expand intent back through the existing shared selection and local view state.
Icons come only from Lucide (chevrons) and Phosphor (doc-type marks).

## Notes

The sidebar ADR specifies the degraded state as reading the `tiers` block
"through the stores hook, never raw", but the stores layer shipped no
vault-tree-specific availability selector — only the status-level `adaptStatus`
degradation rollup. Filling that gap with `useVaultTreeAvailability` was the
clean way to honor the ADR without the chrome touching `tree.data.tiers`; the
ADR could note that a per-query availability selector is the intended seam for
this. The ADR also names "the affected facet renders as a designed degraded
state" without pinning which tier maps to which browser facet; the metadata-only
`/vault-tree` read is not cleanly partitionable by tier, so the implementation
surfaces a single corpus-level degraded banner (with the first reason) rather
than per-facet dimming — a faithful reading, but the ADR could be sharper on
facet-to-tier mapping if per-facet degradation is wanted later.
