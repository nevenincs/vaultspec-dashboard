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

**STATUS: DRAFT — pending the consolidated wave-review verdict and Wave W06 completion.**
This dossier pre-assembles the record of the reconciliation pass so the review verifies
against a compiled ledger instead of reconstructing history from commits and chat. It is
not itself a verdict. Sections below distinguish what is independently verified from
what is reported-but-not-yet-verified, and every open item is named so the review knows
exactly what remains.

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
below). Plan total: 207/244 (84.8%).

- **W01** (localization substrate and source-locale policy) — 23/23. Pre-existing:
  implemented and reviewed before the reconciliation pass began; the exhaustive
  per-step implementation review for this wave lives in the earlier
  `2026-07-14-frontend-localization-audit.md`.
- **W02** (shared action and presentation contracts) — 47/49. `P04` (action descriptor
  convergence) 13/15, `P05` (keymap/command/palette) 27/27, `P06` (shared presentation
  vocabularies) 7/7. Open: `P04.S17`/`S18`, the action-contract closure gates — see
  Open Items, not resolvable by reconciliation. This is now the ONLY open item outside
  W06.
- **W03** (core application surfaces) — 48/48, fully closed. `P07` (global chrome/kit/
  shell) 15/15, `P08` (left rail projects/browsing) 18/18, `P09` (stage graph/islands)
  15/15.
- **W04** (status, search, and temporal surfaces) — 45/45, fully closed. `P10` (right
  rail status/changes) 13/13, `P11` (search/palette) 9/9, `P12` (timeline/temporal)
  7/7, `P13` (store-produced messages) 16/16.
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
| `S216` | `stores/view/editor.ts` carried a hardcoded `STATUS_LABEL` map (`"Saved"`, `"Unsaved changes"`, `"Saving…"`, `"Save failed"`, `"Conflict — the file changed on disk"`) and `advisoriesLabel: "Conformance advisories"`; also collapsed a raw `fixableLabel`/`fixableSuffix` string pair into a `fixable: boolean` resolved at the render boundary | Fixed, working tree (uncommitted at this update); a latent em-dash in the conflict status was also caught and fixed during this pass (message-policy punctuation rule) |
| `S234` (blocked `S60`) | `stores/server/queries/gitchanges.ts` carried a hardcoded `GIT_CHANGE_BUCKET_LABEL` map (`"Staged"`, `"Modified"`, `"Deleted"`, etc.); `S60`'s `ChangesOverview.tsx` rendered these labels directly | Fixed, working tree (uncommitted at this update); both steps closed together |
| edgeMenu `edge:copy-id` (CMCS-001 follow-up, no new step) | `right/menus/edgeMenu.ts` still copies the raw internal edge id to the clipboard, same class as the already-fixed `S177`/`S179` — surfaced by the coder, out of `S183`'s original scope (that step's scanner pass predated the copy-safety audit) | **Open** — per the team lead's ruling, lands as an AMENDMENT to `S183`'s existing exec record when fixed, not a new tick |

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
   typed key descriptor). None of these represent a broken component — every
   component under test was independently confirmed correct — but the bulk migration
   commits changed the DOM/wire shape those tests assert against without touching the
   tests themselves. This class is architecturally distinct from 1–3 (it is a test-
   suite hygiene gap, not a scanner blind spot) but shares the same root cause: the
   bulk commits were not run through the tests they should have broken before
   landing.

Recommend the review decide, per class, whether W06.P18's enforcement suite should
encode a standing gate (e.g. a lint rule banning a bare string default on any prop
whose name matches `label`/`title`/`name` in an accessible-name position) or whether a
narrower rule promotion (`vaultspec-core vault rule promote`) suffices.

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

## Open at draft time

- **`W02.P04.S17`/`S18`** — the action-contract closure gates. NOT resolvable by
  reconciliation: `frontend/src/platform/actions/action.ts` still exports the full
  legacy compatibility bridge (`LegacyActionPresentation`, `legacyActionPresentation()`,
  `normalizeLegacyActionPresentation()`, `resolveActionPresentation()`'s legacy
  branch), and the `ActionDescriptor.label` contract type still admits that legacy
  union rather than requiring `MessageDescriptor` alone. No production producer calls
  the legacy helper anymore (confirmed by grep), but `registry.test.ts` (`S18`'s own
  scope) still exercises the bridge as first-class contract behavior across 10+ call
  sites. Closing this requires deleting the bridge type/functions and rewriting three
  test files to construct fixtures from real `MessageDescriptor` objects — a genuine
  code change, flagged to the team lead as needing the coding lane rather than
  bookkeeping.
- **`W06` (36 steps, `P18`/`P19`/`P20`)** — the final enforcement and cleanup wave, in
  progress on the coding lane, untouched by reconciliation by design per the original
  task brief.
- **The edgeMenu `S183` amendment** — the coding lane's one remaining stated target
  outside `S17`/`S18`/`W06`; reconciliation will amend `S183`'s exec record once it
  lands, per the team lead's ruling (not a new step tick).

**Status as of this update: every wave through W05 is fully closed except the
`S17`/`S18` action-contract bridge deletion (flagged as needing real code, not
bookkeeping). The only outstanding work outside that gate and W06 is the edgeMenu
amendment.** This dossier will be updated in place as the remaining opens close and
finalized once the consolidated wave review renders its verdict.
