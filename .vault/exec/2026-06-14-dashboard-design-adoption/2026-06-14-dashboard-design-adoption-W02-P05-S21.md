---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S21'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---

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
frontend test suite is green (568 passed, 9 pre-existing skips after the
revision). Layer ownership preserved — the surface issues no `fetch`, defines no
model, reads degradation only through the stores selector, and emits select /
expand intent back through the existing shared selection and local view state.
Icons come only from Lucide (chevrons) and Phosphor (doc-type marks).

## Review revision (PASS-WITH-REVISIONS)

The independent design review of the first commit landed PASS-WITH-REVISIONS;
the revision commit closes every required and recommended finding:

- M1 — implemented TRUE roving tabindex: the rail is now ONE Tab-stop. Exactly
  one navigable element (a group disclosure header or a tree row) carries
  `tabIndex 0` at a time, tracked by an active nav-key; every other navigable
  element is `tabIndex -1`. Tab/Shift-Tab enters and leaves the rail; arrows move
  the "0" within it. The first commit had no tabIndex management, so the rail was
  N native Tab-stops — the claim was unimplemented.
- M2 — group disclosure headers now join the single linear nav list, so
  ArrowUp/ArrowDown steps header → its rows → next header in top-to-bottom order;
  a collapsed group's header stays arrow-reachable to reopen it from the
  keyboard. The roving "0" lands on whichever element (header or row) is active.
- The render test now ASSERTS the roving property: exactly one element with
  `tabIndex 0` at a time, the "0" follows arrow movement, and headers are
  arrow-reachable (including from a collapsed group).
- L1 — removed the render-phase `rowRefs.current = []` reset; nav elements are
  now collected in a ref-held `Map` keyed by a stable nav-key, safe under
  double-invoke.
- L2 — the degraded banner now picks its reason deterministically from the
  ordered `degradedTiers` (first degraded tier with a reason), not the
  non-deterministic `Object.values(reasons)[0]`.
- L3 — `aria-current="true"` → `aria-current="page"` (rows sit under a
  navigation landmark).

Reviewer-cleared and untouched: layer ownership, token discipline, icon deps,
the four states, and test transport fidelity.

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
