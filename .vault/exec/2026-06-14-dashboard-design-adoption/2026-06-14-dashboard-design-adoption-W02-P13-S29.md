---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S29'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---




# Re-skin the git-diff browser onto the new tokens with the sacred diff green/red preserved per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green

## Scope

- `frontend/src/app`

## Description

Expanded the thin right-rail changes overview into a git diff browser per its
accepted surface ADR — not just a re-skin. The expansion is a changed-files
disclosure list plus a real read-only diff view, on the new OKLCH token layer and
the two sanctioned icon families, with the engine's read-and-infer boundary and
the sacred diff legibility held throughout.

Per-ADR React element inventory, each mapped to existing JSX or NEW:

- Repository status header (`GitStatusHeader`) — EXPANDED. Phosphor `git-branch`
  mark (was the ad-hoc `⑂` glyph); branch name in mono (identity); ahead/behind
  divergence with tabular numerals + explicit up/down `aria-label`s, shown only
  when an upstream is configured (absent ≠ zero); a clean-vs-`N changed` status
  pill reinforced by a label (never colour-only).
- Changed-files list (`ChangedFiles`) — EXPANDED from the flat dirty-path list.
  Each row carries a Phosphor file mark, a non-colour status letter (A/M/D/R/?),
  the basename in mono with the full path on hover + to AT, and a vault marker.
  Per-file status is classified by `classifyDirty` from a leading status token
  when the wire carries one, falling back to "modified" for the v1 flat-path
  shape — the honest interim until the wire serves a status per entry.
- Expand/collapse disclosure rows (`ChangedFileRow`) — NEW. A Lucide chevron
  toggles the row open to reveal the inline diff; `aria-expanded` tracks state;
  the disclosure animates via `animate-fade-in` and goes instant under
  `motion-reduce`.
- The diff view (`DiffView`, NEW component) — hunk-by-hunk body in mono, each
  hunk introduced by its `@@` range header (a focusable keyboard landmark, arrow-
  navigable hunk-to-hunk), twin old/new tabular line-number gutters, a change-type
  gutter glyph. Added lines use the SACRED `text-diff-add`/`bg-diff-add` tokens
  with a `+` glyph and an "added" label; removed lines the `diff-remove` tokens
  with `-` and "removed"; context lines neutral ink. The diff tokens are consumed
  directly and are never warmth-overridden.
- States — ALL realized: loading (a liveness cue tied to the in-flight status
  snapshot / diff); empty clean-tree (an approachable "working tree clean" in the
  warm copy tone, header still shown); degraded via the `tiers` seam ("repository
  state unavailable", a designed state, never an error); transport error (distinct
  from degradation, with retry); the diff's own loading / engine-blocked "not yet
  available" detail / binary-or-rename / no-changes / honest-truncation states.
- Commit + vault-activity context rows (`EventRow`) — RE-SKINNED. Phosphor event
  marks (`git-commit`, `file-plus`, `pencil`, `file`) replace the retired Unicode
  glyphs; Lucide chevrons; mono on commit/ref labels; tabular numerals on counts
  and timestamps; `aria-expanded` on the disclosure.

Added the stores seam (the surface is chrome; it never fetches the engine and
never reads the raw `tiers` block): `useGitStatus` derives the git working-tree
view (loading / degraded / errored / available) from the status query, reading the
`git` payload and a `git` tier only in the stores layer; `useGitFileDiff` +
`deriveGitFileDiffView` interpret the read-only diff query the same way. Added the
`GitFileDiff`/`GitDiffHunk`/`GitDiffLine` wire types and an `engineClient.gitFileDiff`
read-only `/ops/git/diff` pass-through (engine-read-and-infer: forwarded verbatim,
no diff semantics, NO write path), plus a `gitFileDiff` cache key. Extended the
mock engine to serve the dirty list, divergence, and a structured diff body keyed
by path (mock-mirrors-live-wire-shape), with the engine-blocked default surfaced
as a tiers-bearing `git`-tier degradation.

Selecting a vault changed file emits `selectNode` (the shared selection, by stable
`doc:` id) for stage cross-highlight, reusing the existing `pathToNodeId`
derivation; a non-vault path has no graph node and only toggles the disclosure.

Tests: extended `ChangesOverview.test.ts` (the retired-glyph unit tests become
`eventMark`/`KIND_MARK`; added `classifyDirty` and `statusLetter`); added
`ChangesOverview.render.test.tsx` (clean tree, populated diff with the non-colour
+/- cue and the sacred token classes, the engine-blocked degraded detail, keyboard
file-list roving nav, vault-file select-intent, upstream divergence) through the
real mock transport with no component doubles; added `deriveGitStatusView` and
`deriveGitFileDiffView` derivation tests to `queries.test.ts`.

## Outcome

Done. The right-rail changes surface is now a git diff browser: status header,
changed-files disclosure list, and a read-only diff view with the sacred
high-contrast green/red and a grayscale-safe non-colour cue, all on the new token
layer and the sanctioned icon families. Every ADR state is realized and the
engine's read-and-infer boundary holds (no write affordance exists or is accepted).

Lint: eslint, prettier, and tsc are clean on all eight authored files. The full
`just dev lint frontend` gate's only non-zero exit is two files modified by
concurrent agents under `frontend/src/app/stage/` (`TierDial.tsx` prettier-dirty,
`FilterSidebar.tsx` an unused-binding tsc error) — both outside this slice and not
touched here. Tests: the full frontend suite is `677 passed, 9 skipped` (the skips
are the pre-existing live-origin probes needing a running engine on port 3000);
the new and extended suites are green.

## Notes

The diff BODY and per-file status GROUPING are engine-blocked, exactly as the ADR
records: the v1 wire serves a flat `dirty: string[]` with no per-file status and
exposes no read-only diff endpoint (`/graph/diff` is the temporal graph delta, a
different surface). The full surface is built and fully testable now — the diff
view renders real structured diff data when present and degrades to the designed
"diff preview not yet available" detail when the read-only `/ops/git/diff`
pass-through is unserved. When the engine adds that read-only verb and a richer
dirty-entry shape, the same stores query and component carry the real body
unchanged; no chrome rewrite is needed.

The full lint gate could not be declared exit-0 because of the two concurrent
`frontend/src/app/stage/` artifacts noted above; those are another agent's to
format, and re-running the gate after they land will clear it. This slice's files
are independently green.

ADR insufficiency for refinement: the ADR specifies the read-only diff body but
does not pin the diff's WIRE SHAPE (unified-diff text vs. a structured hunk
document). This step assumed a structured `GitFileDiff` (twin-gutter line-number
shape) so the view never re-parses unified-diff text in the chrome layer; that
shape should be ratified into the contract reference when a read-only diff
capability is specified, so the mock and live wire agree.

## Revision — review PASS-WITH-REVISIONS, two HIGHs (commit follows)

The independent review found the chrome correct (read-only boundary, sacred diff
tokens, non-colour glyphs, a11y/keyboard, bounded rendering, layer ownership all
cleared) but the WIRE SURFACE had gotten ahead of the live engine contract. This
is a UI-adoption cycle, not an engine cycle, so the surface is now made HONEST
against the CURRENT live engine and the richer shapes are kept only as a
documented forward proposal. Fixes:

- HIGH-1 (fabricated per-file list). The live engine serves `dirty` as a BOOLEAN,
  not a per-file changed list; the first cut fabricated a `dirty: string[]` in the
  mock and rendered per-file rows that would collapse to one bogus "dirty" row
  against live. Reverted the mock and `EngineStatus.git.dirty` to `boolean`, and
  removed the fabricated list. The dirty tree now renders an HONEST engine-blocked
  panel (`WorkingTreeChanges`): "working tree has changes — per-file detail not
  yet served by the engine", with a single keyboard disclosure. The per-entry list
  shape (`classifyDirty`/`statusLetter`) is removed from code and recorded only as
  a proposed future contract.

- HIGH-2 (non-existent endpoint + fake tier). The live ops whitelist is
  `/ops/core/*` and `/ops/rag/*` only — there is no `/ops/git/*` route, and `git`
  is not a tier. Removed `engineClient.gitFileDiff`, the `/ops/git/diff` mock
  route, the `gitFileDiff` cache key, and the fake-`git`-tier degradation path.
  `useGitFileDiff` now issues NO network call and returns a single engine-blocked
  state; `DiffView` renders "diff unavailable — engine capability pending". The
  engine-blocked path is exercised end-to-end in the render test.

- MEDIUM (live-sample parity). Added a parity test feeding a RAW live-shaped
  `{git:{head_ref, dirty:bool, ahead:Option, behind:Option}}` `/status` sample
  through `adaptStatus` → `deriveGitStatusView`, asserting branch-from-head_ref,
  the preserved dirty boolean, and preserved/absent ahead/behind.

- MEDIUM (Option ahead/behind). `EngineStatus.git.ahead`/`behind` are now optional;
  `adaptStatus` preserves `undefined` (no upstream) instead of `?? 0`, so
  "no upstream" is distinguishable from "even". The header shows divergence only
  when an upstream is configured. Sibling consumers `NowStrip.gitCard` and
  `WorktreePicker`'s sync badge were updated to the boolean/Option shape (the
  dirty badge is a single mark, not a count); `rail.test.ts`,
  `WorktreePicker.render.test.tsx`, and the `adaptStatus` git-mapping adversarial
  test were corrected to the live boolean contract.

- LOW. The git-status error retry now calls the STATUS query's refetch
  (`gitView.retry`), not the events query.

Honest engine-blocked states as they render now: the status header (branch,
ahead/behind when an upstream exists, clean/dirty) works truthfully against live;
a clean tree shows "working tree clean"; a dirty tree shows the engine-blocked
"per-file detail not yet served" panel whose disclosure reveals the diff's
"engine capability pending" detail; an absent git payload shows the designed
"repository state unavailable"; a tiers-less fault shows the recoverable error
with a status-query retry. The mock mirrors the live `/status` git shape exactly.

Gate after revision: `just dev lint frontend` exits 0 (eslint + prettier + tsc all
green across the whole SPA). Tests: full frontend suite `730 passed, 9 skipped`
(the skips are the pre-existing live-origin probes needing a running engine on
port 3000). Forward proposal recorded for a future ENGINE cycle (out of scope
here): a read-only `git` diff pass-through plus a richer per-file dirty-entry
shape, with the structured `GitFileDiff` hunk document as the proposed wire shape —
a contract amendment, not engine semantics invented in the GUI.
