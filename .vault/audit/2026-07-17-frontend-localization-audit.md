---
tags:
  - '#audit'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# `frontend-localization` audit: `Reconciliation closing dossier`

**STATUS: FINAL pending Wave W06 completion.** Every wave and every reconciliation
decision below has closed clean on the consolidated review's re-verification. The
dossier's only remaining open surface is Wave W06 (final enforcement and cleanup),
still in progress on the coding lane and out of scope for this pass by design. This
dossier pre-assembles the record of the reconciliation pass so the review verifies
against a compiled ledger instead of reconstructing history from commits and chat.

## Wave verdicts (consolidated review)

| Scope | Verdict |
| --- | --- |
| W02.P04.S17/S18 (action-contract closure gates) | **CLOSED** (post-review) — landed at `9b23233257`, independently reverified, 79/79 live; not part of the consolidated review's original scope, added here as it closed after |
| W03 (core application surfaces) | **PASS** — both red files (`FeatureSearchField.test.tsx`, `leftMenus.test.ts`) fixed and independently reverified at `90f8a3d5d5`; 94/94 across the full former red set (72/72 for the four-file combined fix + 22/22 `contextMenu.test.ts`) |
| W04 (status, search, temporal surfaces) | **PASS** — `contextMenu.test.ts` green (22/22), a collateral fix of `9b23233257` as the timeline established; review snapshot had predated that commit |
| W05 (authoring, viewer, settings, auxiliary) | **PASS** |
| Retirements (`S40`/`S75`/`S180`/`S181`/`S219`/`S236`/`S238`) | **PASS** |
| Rescopes (`S59`/`S84`/`S192`) | **PASS** |
| Divergences (`S70` letter-vs-mechanism, and others noted in Honest findings) | **PASS** |
| S183 amendment (edgeMenu CMCS-001 follow-up) | **PASS** |
| Fix commits (`3e66868d0f`, `578b4e5454`, `53426c75f8`, `556f8967d9`, `90f8a3d5d5`) | **PASS** |
| Scanner + catalog integrity (`scan-localization.mjs`, `catalogKeys`/`catalogPlural`/`catalogVocabulary` suites) | **PASS** |

W03/W04 re-verification is complete (see Ledger by wave and Defect ledger for the
per-file citations against `90f8a3d5d5`). Some of this dossier's earlier per-wave
"fully closed"/"WITHHELD" language further down was corrected in place rather than
deleted as each verdict landed, so the record shows what reconciliation believed at
each point in time.

## Scope

The plan's implementation had substantially outpaced its bookkeeping: two bulk
localization commits (`5eef2d0599`, 62 files; `3562d0262a`, 158 files) landed the bulk
of Waves W02–W05's actual code, but the plan document retained only 86/249 ticked steps
with no execution records for the rest. This dossier covers the reconciliation
campaign that closed that gap — verifying each unticked step's scoped files against
the plan's own text, scaffolding and filling an exec record for every step confirmed
done, and separately tracking every step found NOT done as a defect for the coding
lane (`opus-l10n`) rather than ticking around it. It also covers the coding lane's
subsequent defect fixes, each independently re-verified rather than accepted on report
alone.

## Methodology

**Attribution.** Every step ticked by reconciliation is attributed to the actual
landing commit(s), primarily `5eef2d0599` and `3562d0262a`, with narrower targeted
commits cited where a step's work landed separately (e.g. `81cc7291de` for timeline
date-criterion localization, `acee980bce` for the workspace-picker rebuild). No step
was ticked on the strength of the bulk commit's existence alone — every step's own
scoped files were read and checked against the plan's literal text.

**Verification method per step**, in order: (1) confirm the scoped file(s) resolve
visible copy through `useLocalizedMessage`/typed message-key descriptors, or are
legitimately prop-driven components with no owned strings; (2) run the project's
bounded `scan-localization.mjs` scanner scoped to the file(s) and confirm zero exact
findings; (3) where the step names a test file, run it live via `vitest` — every test
suite in this codebase runs against the real engine and real catalogs with no
mocking, so a live pass is a genuine signal, not a reflection of a stub. A step was
ticked only when all applicable checks passed; any file that failed a check was left
open and reported as a defect, never silently patched around during a bookkeeping
pass.

**Dual verification on coder-reported fixes.** From the point the coding lane
(`opus-l10n`) began landing fixes for the defects reconciliation surfaced, no fix was
ticked on the strength of its own report. Each fix was independently re-derived:
`git diff` read against the reported description, `npx tsc --noEmit` and the
localization scanner re-run, and the specific tests re-run live. Two corrections were
made to earlier reconciliation ticks when this second look surfaced something the
first pass missed (see Honest Findings below).

**Single-writer bookkeeping.** All plan-state mutation went through the
`vaultspec-core vault plan step` CLI (`check`/`edit`/`remove`) — never a hand-edited
checkbox glyph or scope clause — with the reconciliation agent as the sole writer of
the plan document and its exec records throughout the campaign, per the team's
division of labor (coder owns source, reconciliation owns vault bookkeeping).

## Ledger by wave

Step counts below are TICKED / TOTAL for that wave as of this update; TOTAL excludes
retired steps (`S40`, `S75`, `S180`, `S181`, `S219`, `S236`, `S238` — see Retirements
below). Plan total: 209/244 (85.7%). Every step outside Wave W06 is now ticked.

- **W01** (localization substrate and source-locale policy) — 23/23. Pre-existing:
  implemented and reviewed before the reconciliation pass began; the exhaustive
  per-step implementation review for this wave lives in the earlier
  `2026-07-14-frontend-localization-audit.md`.
- **W02** (shared action and presentation contracts) — 49/49, fully closed. `P04`
  (action descriptor convergence) 15/15 — `S17`/`S18`, the action-contract closure
  gates, are now closed at commit `9b23233257`: `ActionPresentation` narrowed to
  `MessageDescriptor` alone, the legacy bridge type/functions deleted outright, and
  `registry.test.ts` rewritten to PROVE rejection of a raw string label rather than
  merely tolerate typed input. `P05` (keymap/command/palette) 27/27, `P06` (shared
  presentation vocabularies) 7/7.
- **W03** (core application surfaces) — 48/48 steps ticked, **PASS**. `P07` (global
  chrome/kit/shell) 15/15, `P08` (left rail projects/browsing) 18/18, `P09` (stage
  graph/islands) 15/15. Every named STEP's own scope is genuinely satisfied. The two
  red test files this reconciliation pass did not catch because neither is named in
  ANY plan step's scope — `FeatureSearchField.test.tsx` (orphaned; see Defect Ledger)
  and `left/menus/leftMenus.test.ts` (a cross-step gap where `S227`'s later work
  invalidated tests `S228`'s tick had already vouched for; see Honest Findings) — are
  fixed and independently reverified at commit `90f8a3d5d5` (72/72 across the combined
  four-file fix; `FeatureSearchField.test.tsx` alone: 5/5, `leftMenus.test.ts`
  alone: 34/34).
- **W04** (status, search, and temporal surfaces) — 45/45 steps ticked, **PASS**. `P10`
  (right rail status/changes) 13/13, `P11` (search/palette) 9/9, `P12`
  (timeline/temporal) 7/7, `P13` (store-produced messages) 16/16. The one W04-owned
  item the consolidated review flagged, `stores/view/contextMenu.test.ts` (named in
  `S192`'s rescoped scope, `W04.P13`; reported "2 red to verify"), is a collateral fix
  of `9b23233257` (the S17/S18 four-file set) as the timeline established — the
  review's sweep predated that commit. Independently reverified green: 22/22.
- **W05** (authoring, viewer, settings, auxiliary surfaces) — 43/43, fully closed.
  `P14` (authoring editor/review) 10/10, `P15` (viewer/document presentation) 10/10,
  `P16` (settings/onboarding/responsive) 11/11, `P17` (auxiliary/visual entry points)
  12/12.
- **W06** (final enforcement and cleanup) — 1/36. `P18` 1/13 (`S251` pre-dates
  reconciliation), `P19` 0/14, `P20` 0/9. Entirely the coding lane's in-progress build,
  untouched by reconciliation by design — see Open Items.

## Defect ledger

Every defect reconciliation found, with its fix status as of this draft.

| Step | Defect | Fix status |
| --- | --- | --- |
| `S45` | `ProgressBar.render.test.tsx` asserted `getByText("3/10")` against a readout the bulk migration had already split across sibling DOM nodes (value / decorative slash glyph / max) | Fixed, commit `3e66868d0f` |
| `S112` | `index.html` boot shell carried a raw `aria-label="Loading vaultspec dashboard"` — outside the scanner's `src/` root | Fixed, commit `3e66868d0f` |
| `S113` | `presentation/freshness.ts` built manual English relative-time strings (`"now"`, `` `${n}h` ``, etc.) instead of a locale-aware formatter | Fixed, commit `3e66868d0f` |
| `S162` | `kit/Spinner.tsx` carried a raw English default parameter `label = "Loading"` | Fixed, commit `3e66868d0f` (made `label` required) |
| `S165` | `chrome/RowMenuDisclosure.tsx` carried a raw English default parameter `label = "Row actions"` | Fixed, commit `3e66868d0f` (made `label` required) |
| `S171` | `left/railStates.tsx`'s `RailSkeleton` carried a raw English default parameter `label = "Loading…"` | Fixed, commit `3e66868d0f` (made `label` required) |
| `S177` | `stage/menus/graphNodeMenu.ts` copied the raw internal node id to the clipboard (`node:copy-id`) | Fixed, commit `3e66868d0f` (replaced with `node:copy-document-name`, document nodes only) |
| `S179` | `stage/menus/metaEdgeMenu.ts` copied the raw internal meta-edge id to the clipboard (`meta-edge:copy-id`) | Fixed, commit `3e66868d0f` (action removed outright) |
| `S174` | `left/RailFilterField.render.test.tsx` asserted lowercase label/button-name text against the catalog's sentence-case output | Fixed, commit `578b4e5454` |
| `S185` | `right/menus/rightMenus.test.ts` asserted raw-string `disabledReason`s where `edgeMenu.ts` returns typed key descriptors | Fixed, commit `578b4e5454` |
| `S186` | `right/rail.test.ts` asserted raw-string status-section titles where the composer returns typed key descriptors | Fixed, commit `578b4e5454` |
| `S89` | `viewer/MarkdownDocView.render.test.tsx` asserted lowercase `getByLabelText` text (5 sites) against the catalog's sentence-case output | Fixed, commit `578b4e5454` |
| `S198` | `viewer/RelatedDocPicker.render.test.tsx` asserted lowercase combobox/button names against the catalog's sentence-case output | Fixed, commit `578b4e5454` |
| `S70` | `app/timeline/timelineRangeMath.ts` carried a hardcoded `SHORT_MONTHS` array and month-label helpers | Fixed (dead code removed; the live path already used a locale-aware formatter elsewhere), commit `578b4e5454` |
| `S216` | `stores/view/editor.ts` carried a hardcoded `STATUS_LABEL` map (`"Saved"`, `"Unsaved changes"`, `"Saving…"`, `"Save failed"`, `"Conflict — the file changed on disk"`) and `advisoriesLabel: "Conformance advisories"`; also collapsed a raw `fixableLabel`/`fixableSuffix` string pair into a `fixable: boolean` resolved at the render boundary | Fixed, commit `53426c75f8`; a latent em-dash in the conflict status was also caught and fixed during this pass (message-policy punctuation rule) |
| `S234` (blocked `S60`) | `stores/server/queries/gitchanges.ts` carried a hardcoded `GIT_CHANGE_BUCKET_LABEL` map (`"Staged"`, `"Modified"`, `"Deleted"`, etc.); `S60`'s `ChangesOverview.tsx` rendered these labels directly | Fixed, commit `53426c75f8`; both steps closed together |
| edgeMenu `edge:copy-id`/`edge:copy-full` (CMCS-001 follow-up, no new step) | `right/menus/edgeMenu.ts` copied the raw internal edge id (`edge:copy-id`) and a raw JSON dump of the edge's fields (`edge:copy-full`) to the clipboard, same class as the already-fixed `S177`/`S179` — surfaced by the coder, out of `S183`'s original scope (that step's scanner pass predated the copy-safety audit) | Fixed, commit `556f8967d9`, recorded as an amendment to `S183`'s exec record (per the team lead's ruling, not a new tick). `edge:copy-id`/`edge:copy-full` removed outright; `edge:copy-destination` changed to copy the destination document name via the existing `docStemFromNodeId` seam, reusing the existing `common:actions.copyDocumentName` key (no catalog change). |
| `FeatureSearchField.test.tsx` (ORPHANED — no owning step) | `app/left/FeatureSearchField.test.tsx` asserted lowercase `getByLabelText`/similar accessible-name text against the sentence-case catalog output — the same stale-casing defect class as `S174`/`S89`/`S198`, but `FeatureSearchField.test.tsx` itself is named in NO plan step, so no reconciliation pass ever verified or ticked it. This is a plan-coverage gap, not a step regression — see Honest Findings. | Fixed, commit `90f8a3d5d5`; independently reverified 5/5 |
| `leftMenus.test.ts` cross-step gap (`workspaceMenu` describe block) | `app/left/menus/leftMenus.test.ts` had 2 of 34 tests red: both asserted a raw-string `disabledReason` (`"the launch project cannot be removed"`, `"no project path"`) where `workspaceMenu.ts` (`S227`, ticked) now returns typed key descriptors. `leftMenus.test.ts` itself is named in `S228`'s scope (already ticked, verified passing at the time), but `S227`'s later localization of `workspaceMenu.ts` broke these two assertions after `S228` closed — a cross-step invalidation, not a defect in either step's own scoped work at the time it was ticked. See Honest Findings. | Fixed, commit `90f8a3d5d5`; independently reverified 34/34 |
| `stores/view/commandRegistry.test.ts` (S17/S18 consumer fixture, was conflated with `platform/actions/registry.test.ts` in an earlier draft of this dossier — see correction in Open Items) | 8 of 14 tests were red: raw-string `cmd()` test fixtures normalized to `null` once the legacy `ActionPresentation` string bridge was deleted from `action.ts` — the fixtures needed to construct real `MessageDescriptor` labels. This was the actual remaining `S17`/`S18` blocker. | Fixed, commit `90f8a3d5d5`; independently reverified 14/14 |
| `stores/view/commandPaletteCommands.test.ts` | 1 test was red (`normalizes palette command family and shared action descriptor fields`): same raw-string-fixture-vs-deleted-bridge cause as `commandRegistry.test.ts`. | Fixed, commit `90f8a3d5d5`; independently reverified 19/19 |

## Retirements and rescopes

- **`S40`, `S219`** — retired before this reconciliation pass began; rationale not
  independently established by this campaign.
- **`S180`, `S181`** (both named the deleted `frontend/src/app/islands/HoverCard.tsx`
  module and its two render tests) — RETIRED. That module was deleted in the same bulk
  commit that localized it (`3562d0262a`), consolidating every hover-card render (right
  rail AND on-canvas island) onto the ONE canonical `frontend/src/app/right/menus/
  HoverCard.tsx` (localized and ticked under `W03.P09.S128`); the on-canvas path mounts
  it through `frontend/src/app/islands/HoverCardLayer.tsx`, which owns no strings of
  its own. Retired via `vaultspec-core vault plan step remove` rather than rescoped,
  per the team lead's ruling that rescoping would manufacture work for an
  already-satisfied surface. Rationale recorded in `S128`'s own exec record as the
  nearest surviving record.
- **`S75`, `S236`, `S238`** (named `opsPanel.ts`/`statusCard.ts`/`inspector.ts`
  respectively) — RETIRED. All three source modules were deleted as dead code:
  `opsPanel.ts` explicitly reaped in commit `895c058524` ("console-era dead code
  reaped"); `statusCard.ts` and `inspector.ts` deleted in `3562d0262a` with zero live
  references confirmed anywhere in the tree by grep. Retired via the same CLI verb.
- **`S192`** (view-store presentation test migration) — RESCOPED via
  `vaultspec-core vault plan step edit` from its original 8-file scope to the 5 files
  that still exist (`nowStrip`/`settingsControlRow`/`workTabChrome`/`contextMenu`/
  `provisionActions.test.ts`); the 3 removed files ride the `S75`/`S236`/`S238`
  retirement rationale.
- **`S84`** (review-station and diff test migration) — RESCOPED via the same verb:
  its middle scope item, `DiffPanel.render.test.tsx`, was renamed to
  `DiffView.render.test.tsx` when the diff renderer was unified in commit
  `b15c6dc51e`; `DiffPanel.tsx` itself survives as a thin wrapper over the new
  `DiffView.tsx` and remains in scope for `S81`.
- **`S59`** (search-service lifecycle/indexing internals → user-facing copy) —
  RESCOPED in place (its exec record's scope, not a `vault plan step edit` — the
  step's own text still names the deleted file). `RagOpsConsole.tsx` (the step's
  original scope) was deleted and split into `RagJobDashboard.tsx`/
  `RagJobsTable.tsx`/`RagDashboardFooter.tsx`/`ragDashboardView.ts`/
  `ragDashboard.ts` as part of the 2026-07-14 rag job-dashboard campaign. The coding
  lane swept the five successor files against the four scanner-blind classes above
  (finding none) and reconciliation independently reran the sweep and all five files'
  live test suites (37/37) before ticking. Closed.

## Codification candidates: four scanner-blind defect classes

Every defect in the ledger above that the bounded `scan-localization.mjs` scanner did
NOT catch falls into one of four classes, discovered iteratively across the two defect
batches. These are recommended for a standing rule or a W06 enforcement gate rather
than relying on a future reconciliation pass to catch them by hand:

1. **Non-`src/` files.** `index.html` (`S112`) sits outside the scanner's scan root
   entirely. A raw `aria-label` or similar attribute in the HTML shell is invisible to
   the tool no matter how thorough its `src/` coverage is.
2. **Raw-English default parameters on accessible-name props.** `label = "Loading"`
   (`S162`), `label = "Row actions"` (`S165`), `label = "Loading…"` (`S171`) — the
   scanner inspects JSX literals, not default-parameter initializers, so a component
   whose every LIVE caller happens to pass a localized label still ships a latent raw
   English fallback the scanner never flags. The fix pattern applied each time was to
   make the prop required rather than add a new catalog key, since every caller
   already supplied a localized value — a stronger, compile-time-enforced closure of
   the gap.
3. **Manual-string `.ts` label-builder modules.** `freshness.ts` (`S113`),
   `timelineRangeMath.ts`'s `SHORT_MONTHS` (`S70`) — a semantic-data or pure-utility
   module that builds display strings by hand sits outside whatever JSX-focused
   heuristic the scanner uses, even when its output reaches the DOM through a
   perfectly ordinary render path.
4. **Stale render tests asserting pre-migration DOM/casing shape.** `S45`
   (`getByText` across a decorative-glyph split), `S174`/`S89`/`S198` (lowercase
   `getByLabelText`/`getByRole({ name })` lookups against the sentence-case label-
   casing policy), `S185`/`S186` (raw-string assertions against a shape that is now a
   typed key descriptor), and — per the reviewer's upgrade of this class — the newly
   found `FeatureSearchField.test.tsx`, `leftMenus.test.ts`,
   `stores/view/commandRegistry.test.ts`, and `commandPaletteCommands.test.ts`
   failures. None of these represent a broken component — every component under test
   was independently confirmed correct — but the bulk migration commits (and, for the
   `S17`/`S18` bridge deletion, the in-flight cutover) changed the DOM/wire shape
   those tests assert against without touching the tests themselves. **The
   reviewer's root-cause upgrade for this class:** it is not merely a hygiene gap
   inside individual commits — the project's `just dev lint frontend` / "full gate"
   recipe never RUNS the test suite at all (it lints, formats, type-checks, and scans,
   but does not `vitest run`), so a red test can sit behind a green "full gate" report
   indefinitely, surviving exactly the check this campaign's own methodology treats as
   authoritative. This is a standing-gate gap, not a per-commit oversight, and is
   recommended as the highest-priority W06.P18 candidate: add a project-wide `vitest
   run` invocation to the gate recipe (or a dedicated CI step) so a red test can never
   again coexist with a reported-green gate.

Recommend the review decide, per class, whether W06.P18's enforcement suite should
encode a standing gate (e.g. a lint rule banning a bare string default on any prop
whose name matches `label`/`title`/`name` in an accessible-name position, and the
project-wide `vitest run` gate above) or whether a narrower rule promotion
(`vaultspec-core vault rule promote`) suffices.

**Explicitly NOT a codification candidate, per the reviewer:** the non-`src/`-shape
dev-only harness pages (`filters-visual`, `graph-visual`, `status-visual`,
`viewer-visual`, `three-lab`/`three.html`, and the prototype shell that no longer
exists) are LEGITIMATELY out of scope for any future "fix" — `vite.config.ts`
restricts the production Rollup input to `index.html` only (confirmed under
`W05.P17.S94`–`S214`), so none of these pages ever ship. A future contributor
tightening scanner coverage should not spend effort localizing or gating them; the
correct action if one is ever found non-compliant is to confirm it stays excluded
from the production build, not to localize its content.

## Honest findings

- **The bulk migration shipped with at least one known-red test.** `S45`'s
  `ProgressBar.render.test.tsx` failure was not a regression introduced after
  `3562d0262a` landed — the commit itself split the DOM shape the test asserted
  against and never updated the assertion. This is direct evidence the bulk commits
  were not run through the full test suite (or at minimum, not through this file's
  suite) before landing. The team lead separately noted associated typos/prettier
  gate misses in the same commits; this reconciliation pass did not independently
  audit the full gate history of `5eef2d0599`/`3562d0262a` and cites that as the team
  lead's own finding, not independently re-derived here.
- **An S112 record-attribution error, corrected.** The first reconciliation pass
  ticked `S112` after reading `index.html` and finding it already compliant — but the
  file had been fixed in the uncommitted working tree moments before that read, by a
  parallel coding-lane pass the reconciliation agent was not yet aware of. The
  original exec record wrongly attributed the compliance to "prior work / already
  compliant by construction." This was caught on a later pass, and the record's Notes
  section was amended in place to state the actual scanner-blind aria-label defect and
  its fix — the tick itself was correct throughout; only the stated rationale was
  wrong.
- **A `W03.P09.S128` tick was missed entirely on the first pass.** The reconciliation
  agent verified `HoverCard.tsx` as compliant during the initial W03.P09 sweep but
  never actually scaffolded or ticked the step — an oversight caught only while
  writing the `S180`/`S181` retirement rationale (which needed to cite `S128` as the
  canonical surface those two retired steps were superseded by). Fixed in the same
  pass that discovered it.
- **`S70` is a letter-vs-mechanism divergence, not a straightforward close.** The plan
  step's own text asks to "replace manual month names ... with locale-aware temporal
  formatters." What actually shipped deletes the manual month-name helpers rather than
  localizing them in place, because the live rendering path (`stores/view/timeline.ts`)
  already used a locale-aware formatter through an entirely separate code path — the
  deleted helpers were dead weight, not the actual defect surface. The localization
  goal is met either way (the shipped app never rendered the hardcoded array), but the
  review should decide whether this satisfies the step's letter or whether the
  helpers should have been kept-and-localized instead of removed; reverting to that
  alternative is a one-commit change if the review prefers it.
- **A tick is only as durable as the last run of its tests — the `S227`/`S228`
  cross-step invalidation.** `W03.P08.S228` ticked `leftMenus.test.ts` as fully
  passing (its own scope explicitly names the file); at the time it closed, that was
  true. `W03.P08.S227` (a distinct step, localizing `workspaceMenu.ts`'s own
  disabled-reasons to typed key descriptors) landed its own work AFTER `S228` closed,
  and two of `leftMenus.test.ts`'s `workspaceMenu` assertions — which had been
  correct against `S227`'s pre-fix output — went stale the moment `S227`'s fix
  landed. Neither step's own reconciliation verification was wrong at the time it
  ran; the gap is structural: one test file can be named in multiple steps' scopes
  (or, as here, exercise a module owned by a step that doesn't name the file at all),
  and a later step's landing can silently invalidate an earlier step's already-ticked
  test evidence with no mechanism to re-flag it. This reconciliation campaign's
  methodology (verify once, tick, move on) cannot catch this class by construction —
  it would require either a full-suite rerun before every wave close, or an explicit
  cross-reference from every step to every OTHER step touching the same file. Worth a
  process recommendation for future multi-step campaigns, not just a one-off fix.

## Resolved items and remaining open items

- **`W02.P04.S17`/`S18` — CLOSED.** The action-contract closure gates landed at
  commit `9b23233257` ("delete the legacy action-presentation bridge —
  ActionPresentation is MessageDescriptor alone, strict-contract tests prove
  rejection"): `ActionPresentation` narrowed to `MessageDescriptor` alone, the
  `LegacyActionPresentation` type and its normalize/construct functions deleted
  outright from `action.ts`, and `registry.test.ts` rewritten to prove rejection of
  a raw string label (not merely tolerate typed input) at three separate seams.
  Independently reverified: `git show 9b23233257 --stat` matches the reported 4
  files exactly, a source grep for the legacy bridge symbols across
  `action.ts`/`registry.ts` returns zero matches, `npx tsc --noEmit` is clean
  (excluding the unrelated, fenced `app/agent/Composer*`/`a2aTeam.ts` agent-lane
  WIP), and the live suite (`registry.test.ts` + `contextMenu.test.ts` +
  `keymapDispatcher.test.ts` + `actionCoverage.guard.test.ts` +
  `commandPalette.guard.test.ts` + `chromeActions.test.ts`) — 79/79 passed,
  matching the reported count. Ticked; exec records written for both steps.

  **Historical note (this section previously described the gate as blocked by
  consumer-fixture fallout in `stores/view/commandRegistry.test.ts` and
  `commandPaletteCommands.test.ts`, 8/14 and 1/41 red respectively, plus an open
  discrepancy on `stores/view/contextMenu.test.ts`).** At the point `S17`/`S18`
  closed, reconciliation incidentally reran all four of those files and found
  them ALL green (72/72 combined) — but the fixes were UNCOMMITTED working-tree
  changes at that update, not yet formally reported by the coding lane. Per the
  team's standing rule (cite only real landing commits, verify on report, not on
  working-tree discovery), this dossier did not mark those defect-ledger rows
  fixed or downgrade the W03/W04 WITHHELD verdict on the strength of that
  working-tree observation alone.

  **`stores/view/contextMenu.test.ts` — resolved.** The consolidated review's "2
  red to verify" reading of this file was a stale snapshot: it predated commit
  `9b23233257`, which is exactly the commit that carries opus-l10n's
  `contextMenu.test.ts` conversion (one of the four files in the S17/S18 close, see
  above). Reconciliation's post-commit rerun found it fully green (22/22), and per
  the team lead's ruling this post-commit result is the authoritative state — the
  discrepancy is closed, not merely moot.

  **Closed.** The former four-file red set was fixed and committed at
  `90f8a3d5d5` ("fix wave-review red set — stale casing/raw-string assertions +
  strict-contract fixtures to MessageDescriptors"): `FeatureSearchField.test.tsx`,
  `left/menus/leftMenus.test.ts`, `stores/view/commandRegistry.test.ts`, and
  `stores/view/commandPaletteCommands.test.ts`. Independently reverified against
  the commit (not the earlier working-tree observation): `git show 90f8a3d5d5
  --stat` matches the reported four files exactly, and the live suite reruns
  clean — 5/5, 34/34, 14/14, and 19/19 respectively (72/72 combined), plus
  `contextMenu.test.ts` 22/22 (94/94 across the full former red set, matching the
  consolidated re-review's figure). The W03/W04 WITHHELD verdict is now **PASS**
  (see Wave verdicts). Per the standing rule, the coding lane's own report on
  these four reconciles retroactively against this already-committed, already
  independently-verified state.

Two items remain open at this dossier's finalization, both explicitly out of the
reconciliation pass's own scope:

- **`tabs.test.ts`** — a red test unrelated to the localization scanner or catalog
  (`deriveDocTabScopeBadge` returns an empty label), tracked separately as a
  per-tab-scope-binding follow-up, not part of this plan.
- **Standing codification recommendation** — defect class 4 (stale render tests
  surviving behind a lint gate that never runs `vitest`) becomes a standing
  `vitest` step in `just dev lint frontend`; decided in `W06.P18`, not actioned by
  this dossier.

## Status

**FINAL pending Wave W06.** Every step outside Wave W06 is ticked (209/244,
85.7%). The consolidated wave review closed clean: W03 PASS, W04 PASS, W05 PASS,
retirements PASS, rescopes PASS, divergences PASS, the S183 amendment PASS, all
fix commits PASS (`3e66868d0f`, `578b4e5454`, `53426c75f8`, `556f8967d9`,
`90f8a3d5d5`), and scanner + catalog integrity PASS. `W02.P04.S17`/`S18` are
CLOSED. After this update, the localization plan's remaining surface is Wave W06
alone (`P18` enforcement tests, `P19` e2e specs, `P20`), in progress on the coding
lane and out of scope for this reconciliation pass by design.
