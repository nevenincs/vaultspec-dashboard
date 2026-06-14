---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S29'
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
     The S29 and 2026-06-14-dashboard-design-adoption-plan placeholders are machine-filled by
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
     The Re-skin the git-diff browser onto the new tokens with the sacred diff green/red preserved per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green and ## Scope

- `frontend/src/app` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
shape should be ratified into the contract reference when the `/ops/git/diff`
capability is specified, so the mock and live wire agree.
