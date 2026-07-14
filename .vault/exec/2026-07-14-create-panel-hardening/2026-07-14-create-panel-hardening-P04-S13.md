---
tags:
  - '#exec'
  - '#create-panel-hardening'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S13'
related:
  - "[[2026-07-14-create-panel-hardening-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace create-panel-hardening with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S13 and 2026-07-14-create-panel-hardening-plan placeholders are machine-filled by
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
     The Record the ink-faint ruling in the token ledger (large-text and decorative only) and re-token every information-bearing small-text ink-faint usage app-wide to a passing ink and ## Scope

- `frontend/src/styles.css and surveyed usage sites` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Record the ink-faint ruling in the token ledger (large-text and decorative only) and re-token every information-bearing small-text ink-faint usage app-wide to a passing ink

## Scope

- `frontend/src/styles.css and surveyed usage sites`

## Description

- Ground in the recorded ruling: the `ink-faint RULING` block in `frontend/src/styles.css`
  and the create-panel-hardening ADR rationale. The ruling scopes `text-ink-faint` to the
  >=3:1 large-text/decorative bar; information-bearing SMALL text must move to
  `text-ink-muted` (>=4.5:1).
- Survey every `text-ink-faint` usage across `frontend/src/app` (no `frontend/src/shell`
  directory exists; the shell surfaces live under `frontend/src/app/shell`). Classify each
  site as information-bearing small text (re-token) or large/decorative (keep) per the
  ruling.
- Re-token roughly 67 information-bearing sites across 34 component files: identity and
  path lines, secondary picker/list lines, counts and rollups, progress and percent
  labels, freshness and date values, status and state lines, reasons and hints,
  empty-state and honest-partial guidance, error detail, and monospace node/step ids.
- Re-token the four shared status-tone fallbacks whose faint branch colors an
  information-bearing status word (the `not-started` plan tone, the `pending` plan-summary
  tone, the default ADR-status tone, the default evidence-state tint, and the freshness
  quiet bucket).
- Keep `text-ink-faint` on every large/decorative site: aria-hidden glyphs and marks,
  disclosure chevrons and twisties, uppercase section-label eyebrows, input placeholder
  attributes, middot separators, inactive tab/segment washes that brighten on hover, and
  close/clear affordance glyphs.
- Update the two suites that assert a class this step changed: the freshness-tone unit
  assertions and the canvas refreshing-annotation render assertion, both moved to
  `text-ink-muted` honestly (no value copied from a run).

## Outcome

- Gate green on the touched set: `tsc --noEmit` exit 0, `eslint` exit 0, `prettier --check`
  clean, `scan-px` clean. Two vitest batches covering the changed surfaces pass (32 files,
  235 tests) run online against the live engine.
- Tally: ~67 sites re-tokened to `text-ink-muted` across 34 component files; the remaining
  ~40 `text-ink-faint` usages in `frontend/src/app` are deliberate keeps in the
  large/decorative categories above. Two test files updated to match changed classes.
- The panel that hosted the search-service console was concurrently deleted and split by
  another lane during this sweep; its ~11 information-bearing faint sites were handed off
  rather than re-tokened here (see Notes).

## Notes

- COLLISION / handoff: `frontend/src/app/right/RagOpsConsole.tsx` was edited early in the
  sweep (11 information-bearing sites re-tokened), then deleted mid-session by the active
  panel lane, which is relocating it into `frontend/src/app/panels/RagJobsTable.tsx`,
  `RagLogPane.tsx`, `RagJobDashboard.tsx`, and `RagDashboardFooter.tsx`. Those edits
  vanished cleanly with the file; the tree still type-checks. The ruling and the specific
  faint sites were relayed to that lane so the remediation lands in the new panels. Those
  four new panel files (foreign WIP) were intentionally NOT touched, along with the
  pre-flagged `BackendHealthPanel`, `FrameworkStatusCluster`, and `ChangesOverview`.
- Ambiguous calls resolved conservatively to `text-ink-muted` and worth a re-check: the
  shared status-tone fallbacks (the faint branch is a status WORD, not only a pip, so it is
  information-bearing); the per-item uppercase doc-type eyebrow in the graph hover card
  (kept as an eyebrow style but re-tokened because it is the sole word form of the type and
  not redundant with a heading); and two interactive recovery affordances (`try again`,
  `clear all`) whose resting ink moved to muted with the hover raised to full ink so a
  hover delta remains.
- The `ListRow` trailing-slot default and the `StateBlock` empty-mode glyph tint stayed
  faint: the former is a generic adornment container whose consumers own their own legible
  ink, the latter tints only an aria-hidden glyph.
- The panel-hosted create dialog eyebrow (`In this feature`) was verified as an
  intentional keep from the earlier phase and left unchanged.

## Handoff (post-close)

The concurrent rag-job-dashboard lane deleted `right/RagOpsConsole.tsx`
mid-sweep, taking ~11 of this step's re-tokens with it. The ruling now
binds that lane's REPLACEMENT panels (`RagJobsTable`, `RagLogPane`,
`RagJobDashboard`, `RagDashboardFooter`): job kind/detail/result
secondaries, counts, reindex progress, slot lines, lower-bound notes, and
degraded/health reasons are information-bearing small text -> ink-muted;
faint stays only on glyphs/eyebrows/placeholders/separators. Recorded here
and in the audit recommendations for that lane to pick up.
