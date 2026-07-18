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

**STATUS: FINAL pending Wave P20 completion.** `W06.P18` (13/13) and `W06.P19`
(14/14) are BOTH fully closed as of this update — every wave and every
reconciliation decision below has closed clean on the consolidated review's
re-verification. The dossier's only remaining open surface is `P20` (final
closeout), in progress on the coding lane and out of scope for this pass by
design. This dossier pre-assembles the record of the reconciliation pass so
the review verifies against a compiled ledger instead of reconstructing
history from commits and chat.

## Wave verdicts (consolidated review)

| Scope | Verdict |
| --- | --- |
| W02.P04.S17/S18 (action-contract closure gates) | **CLOSED** (post-review) — landed at `9b23233257`, independently reverified, 79/79 live; not part of the consolidated review's original scope, added here as it closed after |
| S17/S18 strict-contract fixture fallout, full sweep-proven closure | **PASS** — beyond the reviewer's named five files, a broad at-risk sweep found and fixed four MORE consumer fixtures (`ContextMenuHost.render.test.tsx`, `ContextMenuHost.interactive.test.tsx`, `seamTransit.test.tsx`, `globalTail.test.ts`), landed at `b264490da0`; independently reverified across the full 9-file set at 119/119, ESLint clean, scanner clean — see Ledger by wave for the closure argument |
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
below). Plan total: 235/244 (96.3%). Every step outside Wave W06 is ticked;
`W06.P18` (13/13) and `W06.P19` (14/14) are BOTH fully closed. `W06.P19`'s
final five steps (`S102`/`S103`/`S106`/`S107`/`S138`) closed in one batch
against the finisher's punch-list commit (`c169ad5a98`), verified cold per
the campaign's closing protocol — see the Ledger-by-wave `W06` entry and
Defect ledger for the complete evidence, including the settled
tick/reversal/restore history for `S140`/`S142`/`S143`/`S144` (all fully
resolved: reverified cold from a genuinely forced cold state — Files radio +
hidden rail — rather than merely restated).

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

  **Sweep-proven closure of the S17/S18 strict-contract fallout.** The reviewer's
  own recommendation — "run everything, not just the named suspects" — was
  vindicated: beyond the five files the consolidated review named
  (`commandRegistry.test.ts`, `commandPaletteCommands.test.ts`,
  `contextMenu.test.ts`, plus the two orphan/cross-step W03 files), a broad at-risk
  sweep found FOUR MORE consumer fixtures still asserting raw-string labels against
  the now-strict `MessageDescriptor`-only contract: `ContextMenuHost.render.test.tsx`,
  `ContextMenuHost.interactive.test.tsx`, `seamTransit.test.tsx`, and
  `app/menus/globalTail.test.ts`. All four fixed and landed at `b264490da0`. The
  closure argument: every consumer that registers, normalizes, or resolves an
  `ActionDescriptor`/`ActionPresentation` label was enumerated and swept; the only
  remaining raw-string label assertions left in `registry.test.ts` and
  `commandPaletteCommands.test.ts` are the INTENTIONAL rejection-proof tests (they
  assert the strict contract rejects a raw string, not that one is accepted).
  Independently reverified against the commit, not the report alone: `git show
  b264490da0 --stat` matches the reported four files exactly; a live rerun of the
  full 9-file former-fallout set (the five originally named plus these four) —
  119/119 passed; `npx eslint` on the same nine files — clean; `scan-localization.mjs`
  — clean. (Note: the reporting agent's own tally cited 161 tests across this set;
  my independent count of these exact nine files is 119/119 — the discrepancy is
  unresolved and likely reflects a broader file set on their side, flagged rather
  than silently adopted, but doesn't change the verdict since every test I ran is
  green.)
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
- **W06** (final enforcement and cleanup) — 13/36. `P18` 13/13, fully closed: `S251` pre-dates
  reconciliation; `S98` (allowlist mechanism removed outright — structural
  zero-literals, stronger than the step's own "empty allowlist" text), `S100`
  (locale-resource + production-source punctuation rejection), `S130`/`S135`/`S136`
  (action-verb/prohibited-vocabulary/raw-interpolation-safety enforcement over the
  full catalog), `S131` (exhaustive outcome-condition mapping), `S137`
  (verify-and-record: the three finding codes it asks for pre-existed from `S14`,
  confirmed live by the scanner's own fixture-union test), `S99` (verify-and-
  record: every named superseded-label-map candidate is already a typed
  `MessageDescriptor`, nothing to delete), `S101` (source guard swept clean over
  every production and auxiliary entry point; the six auxiliary HTML pages
  confirmed production-excluded by `vite.config.ts`), `S134` (verify-and-
  record: zero fixed-locale/manual-month-formatting sites remain, `SHORT_MONTHS`
  already dead-code-removed at `S70`), `S132` (fail-closed catalog vocabulary
  replaces the served-health-word `titleCase()` transform), and `S133`
  (gitchanges/pipeline count-plural builders and pipeline's raw state strings
  converted to catalog descriptors; `nowStrip.ts` resolved by deletion as
  orphaned dead code) all independently verified and ticked this update.
  **`W06.P18` is now 13/13, fully closed. `W06.P19` is now 14/14, FULLY
  CLOSED.** `S104`/`S105` (typical + expanded-copy/RTL layout, `164ea9fc1d`),
  `S139`/`S141` (loading + empty, `3aead802d2`), `S145` (responsive,
  `e9f64dec54`) landed clean on first verification. `S140`/`S142`/`S143`/
  `S144` (degraded, errors, confirmations, actions) went through a
  tick → reversal → restore → brief-untick → re-tick → brief-freeze →
  RE-TICK message-race sequence, settled FINAL by the team lead at
  `bc52be1f08`, and were then INDEPENDENTLY REVERIFIED COLD (Files radio
  selected + rail hidden, forced before each run) against the finisher's
  punch-list commit (`c169ad5a98`) as the campaign's one closing
  verification pass — 2/2, 4/4, 1/1, 2/2 individually plus 18/18 combined,
  all from a genuinely forced cold state, with `S144` specifically rerun
  cold TWICE to rule out its earlier flakiness. `S102`/`S103`/`S106`/`S107`
  closed in the same batch: the two catalog policy violations
  (`teamRunRefused`/`teamRunDismiss`) are fixed and reverified (91/91 across
  `S102`'s scope, 90/90 spot-checked for `S103`); `S107`'s scanner/lint gate
  is genuinely clean (`just dev lint frontend` and the broader `just dev
  lint all` both exit 0, independently reverified); `S106`'s full suite runs
  3682/3683 twice, with the one remaining failure
  (`authoring.happyPath.live.test.ts`) confirmed as concurrency-contention
  flakiness — unrelated to the punch list, passes 1/1 standalone twice with
  zero concurrent load. `S138` ticks alongside `S107` (its structural
  scanner-exclusion fix). See Defect ledger for the complete evidence and
  the "P19 e2e harness capabilities" section for the two new helpers
  (`ensureExpanded`, `bootHealthyThenBreakVaultTree`) recorded for future
  e2e specs. `P20` (9 steps) remains the coding lane's in-progress build,
  out of scope for this reconciliation pass by design.

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
| `S132` | `app/panels/VaultHealthPanel.tsx:42` ran a manual `titleCase()` on the served health word (line 57), a scanner-blind runtime-casing transform outside JSX literal text | Fixed, commit `8c4220b333`; `titleCase()` deleted outright, replaced with a fail-closed closed vocabulary (never echoes an unrecognized served token); independently reverified, part of the 77/77 combined batch run |
| `S133` | `stores/server/queries/gitchanges.ts:504`'s `pluralLabel()` and `stores/server/queries/pipeline.ts` (two inline `` `${count} item${s}` ``-shape builders) hand-built plural/count sentences in manual-string `.ts` modules — the same scanner-blind class as `S113`'s `freshness.ts`. `pipeline.ts` ALSO carried raw English state strings (`"pipeline status unavailable"`, `"loading in-flight work"`, `"no in-flight work"`, `"reading in-flight work…"`, `"no work in flight on this branch"`), fixed in the same commit | Fixed, commit `8c4220b333`; both hand-builders and the raw state strings now `CountMessageDescriptor`/`MessageDescriptor` catalog resolutions; independently reverified, part of the 77/77 combined batch run |
| `S133` | `stores/view/nowStrip.ts:176`'s `jobsLabel()` hand-built a `` `${jobs} job${s}` `` count sentence | Resolved by DELETION, commit `8c4220b333`: `nowStrip.ts` (228 lines) scouted as fully orphaned in production — only its own test imported it, the live status renderer (`deriveSystemStatusRows`) never consumed it — and deleted outright under the `S75`/`S236`/`S238` dead-code doctrine (team-lead approved) rather than localized. Independently reverified: grepped every importer in `src/`, confirmed none remain. `S192`'s exec record (which verified `nowStrip.test.ts` live) amended to note the ripple. |
| `S140`/`S142`/`S143`/`S144` shared-state test-infrastructure race | Four `W06.P19` e2e specs (degraded, errors, confirmations, actions) shared one root cause the scanner cannot see: `ensureBrowserVisible`'s postcondition (the vault-documents tree visible) could ONLY be satisfied by leftover server-persisted "Documents" tab state from an unrelated PRIOR test run — nothing the helper itself did switched tabs. Reconciliation reproduced this live: `S140`/`S142` failed 2/2 and 3/4 respectively across separate cold runs; `S144` flaked ~50% across three runs; `S143` passed once only because state was warmed by unrelated prior activity. `S142`'s file additionally had a partial-edit gap (a stray call to the old, now-undefined helper name, throwing `ReferenceError`) | **CLOSED — fixed AND independently reverified cold against the punch-list commit (tick → reversal → restore → brief untick → re-tick → brief freeze → re-tick → COLD REVERIFICATION, final).** `2890e92df6`'s `bootHealthyThenBreakVaultTree` helper closed the shared-tree-state race that had made these four flaky/red standalone, and the message-race sequence documented in this dossier settled FINAL (ticked) at `bc52be1f08`. Reconciliation then ran the campaign's ONE closing cold-verification pass against the finisher's punch-list commit (`c169ad5a98`, which further hardened `ensureBrowserVisible` to genuinely drive BOTH the rail-visibility lever and the Vault/Files radiogroup, with result-verified retries): forced a genuinely cold state (Files radio selected, rail hidden) before each spec, live — S140 2/2, S142 4/4, S143 1/1, S144 2/2 individually, `S144` specifically rerun cold TWICE given its earlier flakiness (2/2 both times), then the full nine-spec combined set cold — 18/18. This is the authoritative, cold-forced evidence the earlier ticks anticipated but could not themselves produce (every prior verification round was warmed by adjacent test activity, never a genuinely cold boot). |
| `S102` | `messagePolicy.test.ts`'s "accepts every production English catalog value" was red on `common:agent.composer.teamRunRefused` (`"The team run couldn't be started."` — no actionable recovery clause, `not-actionable` policy code); `actionVocabulary.test.ts`'s canonical-imperative-verb sweep was red on `common:agent.composer.teamRunDismiss` (`"Dismiss"` — not in the canonical imperative-verb inventory; `"Close"` is). Both keys traced to `dfed1ae3c0` ("live team selector — wire the composer onto the a2a team client"), an unrelated agent-lane commit that landed without running the localization suite | Fixed, commit `c169ad5a98`: `teamRunRefused` gained its actionable recovery clause; `teamRunDismiss` → `"Close"` (canonical verb); fr/ar test-resource mirrors updated. Fixing the key unmasked 21 further sentence-case reds in the same suite (the suite aborts at its first failing key) — also fixed in the same commit. Independently reverified: 91/91 across `S102`'s full scope. |
| `S103` | Same two red tests as `S102` fell within its "app suites" scope | Fixed alongside `S102` — 90/90 spot-checked (`PlanStepTree.render`, `pipeline`, `gitchanges`, `src/app/agent/`); the full `S106` suite run covers the rest of `src/app/` with no further reds. Also flagged, not blocking: `FeatureSearchField.test.tsx`/`leftRailActions.test.tsx` `vi.mock("stores/server/queries")`, pre-existing (predates this dossier's earlier tick of the former, confirmed via diff) — arguably covered by the project's unit-test pure-logic-isolation carve-out, in tension with `S103`'s literal "without mocks" text; routed to the team lead's judgment as a NAMED item for `P20`'s adjudication, not resolved here. |
| `S106` | The full frontend test recipe needed a clean run against the punch-list commit | Two independent full `frontend/` suite runs against `c169ad5a98` — 3682/3683 each, with the SAME single failure both times: `authoring.happyPath.live.test.ts`'s "propose → approve → apply → rollback → history" (`applied.kind` expected `"ok"`, got `"denied"`). Confirmed as resource-contention flakiness, not a regression: both full runs that surfaced it were racing CONCURRENTLY against the same live engine (a team-lead backstop run in parallel with reconciliation's own); the file is untouched by the punch-list commit, and reran standalone with zero concurrent load — 1/1 passed, twice. Recorded as an environmental/concurrency-sensitivity note for `P20`, not swept as a punch-list defect. |
| `S107` | `just dev lint frontend` failed at the `localization-scan` step before formatting/typecheck/tokens/figma ever ran: `Composer.tsx` 2 findings (`unsafe-dynamic-presentation`, unrelated commit `c608584cac`) plus `localization/testing/reviewStationResources.ts` 4 findings (`presentation-field`, new French/Arabic `requestChanges.body`/`placeholder` test-fixture fields from `164ea9fc1d`, not covered by the scanner's test-resource exclusion pattern) | Fixed, commit `c169ad5a98`: `Composer.tsx`'s served reason/preset-id now route through `authoredDisplayText` locals; the scanner's exact-file test-resource allowlist replaced by a structural `src/localization/testing/*Resources.ts` pattern. `e2fe6aa32b` additionally unblocked the tree-wide gate (a `group2.rs` module-size overflow from a parallel session's landed work, split into `group4.rs`; a legitimate Myers O(ND) term tripping the typos gate, allowlisted). Independently reverified: `just dev lint frontend` AND the broader `just dev lint all` (Rust fmt/clippy included) both exit 0. |
| `S138` | Its own commit (`164ea9fc1d`) is the one that introduced the `reviewStationResources.ts` scanner findings above | Fixed alongside `S107` — the structural `src/localization/testing/*Resources.ts` exclusion pattern (confirmed by reading `scan-localization.mjs` directly) closes the gap by shape+location rather than exact-file, so any future fixture in that directory is excluded automatically. Independently reverified: `lint:localization` clean; `S104`/`S105`'s e2e specs (driven by this fixture expansion) — 3/3 and 7/7. |
| `S157` (found during `P20` evidence audit, NOT swept) | `common:agent.transcript.team.degraded` (`"Live updates paused — showing status only."`) contains an em-dash (`—`), violating the project's own message-policy punctuation rule (`messagePolicy.ts`'s `em-dash` issue code). Introduced by `c169ad5a98` itself — the P19 punch-list commit's "actionable team-run copy" change — so it postdates every prior verification pass in this dossier. Both `messagePolicy.test.ts` ("accepts every production English catalog value", 25/26) and `catalogPunctuation.test.ts` (4/5) independently catch it live; the failure was NOT visible to `just dev lint frontend`'s `lint:localization` scanner step (a literal-syntax scanner, not a punctuation-policy check) — this is the same lint-gate-never-runs-vitest gap already codified below, now with a live instance that reached a commit already cited as a fix. | **OPEN — unfixed as of this audit.** No code fix authored (audit records evidence, does not touch `frontend/`); reported to the team lead for routing to a coding lane. |

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
   `timelineRangeMath.ts`'s `SHORT_MONTHS` (`S70`), `VaultHealthPanel.tsx`'s
   `titleCase()` (`S132`), and `gitchanges.ts`'s `pluralLabel()` plus
   `pipeline.ts`'s two inline count-plural builders and raw English state
   strings (`S133`) — a semantic-data or pure-utility module (or a component's
   own inline helper) that builds display strings by hand sits outside whatever
   JSX-focused heuristic the scanner uses, even when its output reaches the DOM
   through a perfectly ordinary render path. `S132` additionally carried a
   latent HONESTY gap the scanner is structurally blind to: a runtime
   title-case of an unrecognized served token can echo arbitrary served text
   verbatim, where a fail-closed catalog classification cannot — the fix
   pattern (classify into a closed vocabulary, never echo) is stronger than the
   step's own literal "remove title-casing" text.
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

**The vitest-gate recommendation now carries three live evidence instances**, each
an independent proof a red test can hide behind the reported-green "full gate":
(1) the original 9-file `S17`/`S18` strict-contract fallout (5 files the
consolidated review named plus 4 more found by `opus-l10n`'s broader sweep,
`90f8a3d5d5` + `b264490da0`); (2) the scanner-test discovery itself — `S98`'s
allowlist-removal work and `S137`'s verify-and-record pass both depended on
`scan-localization.test.ts` staying green, which it did, but the discovery
process that surfaced the fallout files above only ran because someone manually
invoked `vitest`, not because the gate did; (3) the reviewer's own 3-file sweep
(`ContextMenuHost.render.test.tsx`, `.interactive.test.tsx`, `seamTransit.test.tsx`
— a subset of the 4-file broader sweep in instance 1, re-surfaced independently by
the reviewer's own "run everything" pass before `opus-l10n`'s sweep landed).

**A sixth, related instance — a test-vehicle/production-key coupling, resolved.**
`runtime.test.ts` and `reactivity.test.tsx`'s interpolation-MECHANICS tests
(named-value substitution, RTL resolution, frozen-descriptor invariants, unsafe-
value handling) had commandeered `errors:unexpectedSection.message` — a REAL
production error-boundary message — purely as their test vehicle, because it
happened to have one named interpolation value (`{{section}}`). This created a
hidden contract conflict distinct from class 4 above: not a stale assertion
against a shape that changed, but an ONGOING coupling where any future edit to
this production error message's wording or interpolation shape would silently
break unrelated mechanics tests that have nothing to do with error-boundary
copy — and, symmetrically, the mechanics tests' assumptions could constrain how
the production message is allowed to evolve. Ruled and fixed at `47a055f58f`
("rework interpolation-mechanics vehicle off the tokenless recovery key —
errors:unexpectedSection contract conflict resolved per ruling"): the mechanics
vehicle moved to `common:finalWave.history.openCommit` (`"Open {{commit}}"`), a
key introduced by the `S133` batch with no other consumer, so the mechanics tests
now couple to nothing production-meaningful. `errors:unexpectedSection.message`
and `catalogInterpolation.test.ts` (which exercises it as the actual production
contract) are untouched by this commit. Independently reverified against the
landed commit, not the earlier relayed report: `git show 47a055f58f --stat`
matches the reported 2 files exactly; live rerun of `runtime.test.ts` +
`reactivity.test.tsx` — 17/17 passed, matching the claimed count, with every
structural mechanics assertion (named interpolation, RTL non-token-leak,
frozen-descriptor invariants, unsafe user-value passthrough) preserved on the new
vehicle; confirmed via `git status`/`git show` that `frontend/src/locales/en/errors.ts`,
`ErrorBoundary.tsx`, and `catalogInterpolation.test.ts` are genuinely untouched by
this commit; live rerun of `catalogInterpolation.test.ts` — 5/5 passed; confirmed
`common:finalWave.history.openCommit` is a real, already-shipped production
catalog key (added by the `S133` batch), not a test-only fabrication.

Recommend the review decide, per class, whether W06.P18's enforcement suite should
encode a standing gate (e.g. a lint rule banning a bare string default on any prop
whose name matches `label`/`title`/`name` in an accessible-name position, and the
project-wide `vitest run` gate above) or whether a narrower rule promotion
(`vaultspec-core vault rule promote`) suffices. `W06.P18` is now 13/13, fully
closed: the CATALOG/SCANNER/DEAD-CODE side of this campaign's invariants
(`S98`/`S99`/`S100`/`S101`/`S130`/`S131`/`S132`/`S133`/`S134`/`S135`/`S136`/`S137`,
alongside the pre-existing `S251`); the standing gate recommendation itself
remains a process decision for the review, not something any of those steps
encodes.

**Explicitly NOT a codification candidate, per the reviewer:** the non-`src/`-shape
dev-only harness pages (`filters-visual`, `graph-visual`, `status-visual`,
`viewer-visual`, `three-lab`/`three.html`, and the prototype shell that no longer
exists) are LEGITIMATELY out of scope for any future "fix" — `vite.config.ts`
restricts the production Rollup input to `index.html` only (confirmed under
`W05.P17.S94`–`S214`), so none of these pages ever ship. A future contributor
tightening scanner coverage should not spend effort localizing or gating them; the
correct action if one is ever found non-compliant is to confirm it stays excluded
from the production build, not to localize its content.

## P19 e2e harness capabilities

Two new shared helpers landed with the `2890e92df6` hardening pass, recorded here
as standing harness capabilities for any FUTURE e2e spec against the live corpus
tree, not just the four this pass fixed:

- **`ensureExpanded`** — checks a fold row's real `aria-expanded` attribute
  before clicking it, rather than blindly toggling. Fold headers TOGGLE on
  click, and the corpus tree's fold state is server-persisted across specs/
  workers, so a blind click from a spec assuming a fresh collapsed state can
  COLLAPSE a fold a prior spec already expanded. Idempotent regardless of what
  earlier specs left behind.
- **`bootHealthyThenBreakVaultTree`** — boots the app against the REAL, working
  wire first, switches to the Documents tab, confirms the vault-documents tree
  is genuinely visible, THEN installs a failing route and reloads. Its honesty
  rationale: a spec that starts already-broken (route intercepted before the
  first paint) never proves the app actually WORKED before it broke — it only
  proves a permanently-broken page renders a degraded notice, which is a weaker
  claim. This helper proves the genuine working→broken TRANSITION, matching the
  project's degradation-is-read-from-tiers, never-guessed-from-a-permanent-fault
  discipline at the e2e layer.

**A named pre-existing item for the `P20` review, not swept under the hardening
pass:** the live smoke suite (`smoke.spec.ts` + `perf.spec.ts`) under
`workers: 1` shows 4 failures — `smoke.spec.ts`'s constellation/WebGL-canvas
render, search-tab round-trip, and playhead-scrub tests, plus
`perf.spec.ts`'s graph-lab idle-and-interactive budget test — all WebGL-canvas-
render or stale-selector timeouts. Independently confirmed these predate this
pass entirely: neither `smoke.spec.ts` nor `perf.spec.ts` appears in
`2890e92df6`'s diff, and both were last touched by an unrelated graph-feature
commit (`132f31703e`). Recorded as 4 pre-existing failures (not the reported 3 —
`perf.spec.ts`'s failure is a distinct file from the 3 `smoke.spec.ts` ones),
named for `P20`'s review rather than silently absorbed into this pass's own
acceptance evidence.

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
  `vitest` step in `just dev lint frontend`. The recommendation now carries three
  independent live evidence instances (see Codification candidates); `W06.P18`'s
  catalog/scanner enforcement steps (`S98`/`S100`/`S130`/`S131`/`S135`/`S136`/`S137`)
  are verified and ticked as of this update, but the standing-gate DECISION itself
  (whether to add a project-wide `vitest run` to the lint recipe) remains open —
  not actioned by this dossier, still pending the review/coding lane's call.

## Status

**FINAL pending Wave P20 alone.** Plan total: 235/244 (96.3%). The
consolidated wave review closed clean: W03 PASS, W04 PASS, W05 PASS,
retirements PASS, rescopes PASS, divergences PASS, the S183 amendment PASS,
all fix commits PASS (`3e66868d0f`, `578b4e5454`, `53426c75f8`,
`556f8967d9`, `90f8a3d5d5`, `b264490da0`, `8c4220b333`, `47a055f58f`,
`c169ad5a98`, `e2fe6aa32b`), and scanner + catalog integrity PASS.
`W02.P04.S17`/`S18` are CLOSED, including the sweep-proven closure at
`b264490da0`. **`W06.P18` is 13/13, fully closed. `W06.P19` is 14/14,
FULLY CLOSED.**

`S104`/`S105`/`S139`/`S141`/`S145` landed clean on first verification.
`S140`/`S142`/`S143`/`S144` went through a full tick → reversal → restore →
brief-untick → re-tick → brief-freeze → re-tick message-race sequence,
settled FINAL by the team lead at `bc52be1f08`, then INDEPENDENTLY
REVERIFIED COLD against the finisher's punch-list commit (`c169ad5a98`) as
the campaign's one closing verification pass: genuinely forced cold state
(Files radio selected, rail hidden) before each spec — 2/2, 4/4, 1/1, 2/2
individually (`S144` cold-rerun twice given its earlier flakiness), 18/18
combined. `S102`/`S103`/`S106`/`S107`/`S138` closed in the same batch: the
two catalog policy violations are fixed and reverified (91/91, 90/90
spot-checked); the scanner/lint gate is genuinely clean (`just dev lint
frontend` and the broader `just dev lint all` both independently reverified
exit 0); the full test suite runs 3682/3683 twice, with the one remaining
failure confirmed as concurrency-contention flakiness unrelated to the
punch list (passes 1/1 standalone, twice, zero concurrent load); the
scanner's exclusion mechanism is now structural, closing `S138`'s gap by
shape rather than exact-file. See Defect ledger for the complete evidence
and the "P19 e2e harness capabilities" section for the two new helpers
(`ensureExpanded`, `bootHealthyThenBreakVaultTree`) recorded for future e2e
specs. A named pre-existing item is carried for the `P20` review, not
swept: 4 WebGL-canvas/stale-selector smoke/perf failures under `workers: 1`,
confirmed to predate this pass, plus the `authoring.happyPath.live.test.ts`
concurrency-flakiness note above. `P20` (9 steps) remains the coding lane's
in-progress build, out of scope for this reconciliation pass by design —
the frontend-localization plan's only remaining surface.

## `W06.P20.S111` — Audit: catalog completeness and source-literal evidence

**Requirement.** Every user-facing string resolves through the typed catalog
(no missing keys, no untranslated production literal anywhere in `src/`), and
the campaign's own scanner/catalog-integrity machinery is itself provably
sound (not merely quiet).

**Catalog completeness evidence.**
`catalogKeys.test.ts` (9 tests) proves the shipped catalog matches the
explicit namespace-qualified leaf-key contract, keeps locale/namespace
aggregates aligned with the source catalog, and provides every required
message directly in every shipped locale (English, French, Arabic) —
independently reverified live, 9/9. `catalogInterpolation.test.ts` (5 tests)
proves production interpolation syntax and shipped-locale token parity —
5/5. `catalogPlural.test.ts` (3 tests) proves every locale's complete
cardinal category family and a closed CLDR-cardinal-suffix vocabulary —
3/3.

**Source-literal (zero-literal) evidence.**
`scan-localization.mjs` reports "clean, 0 user-facing source literals" over
the full `src/` tree at the campaign's closing commit (`c169ad5a98` +
`e2fe6aa32b`) — independently reverified via `just dev lint frontend`
(exit 0) AND the standalone scanner invocation. The scanner's OWN test
suite (`scan-localization.test.ts`, 14 tests) proves the mechanism itself is
sound: it recognizes production translation bindings, detects every
production finding class from a real invalid-source fixture (the union of
every fixture-driven finding equals the full `FINDING_CODES` set — S137's
verify-and-record evidence), fails closed at expression/file/finding limits,
and excludes exact catalog test fixtures structurally
(`src/localization/testing/*Resources.ts`, S138's fix) rather than by an
ever-growing per-file allowlist. `S98` independently confirmed the
allowlist MECHANISM was removed outright (`git log --diff-filter=D` on
`localization-allowlist.json`), not merely emptied — the zero-literal
invariant is structural, with no exemption surface left to regress open.
`S101` confirmed the scanner's ONE production entry point
(`index.html`, per `vite.config.ts`'s `rollupOptions.input`) carries no
literal beyond the exempt product-name title, and the six auxiliary
dev-only HTML pages are genuinely production-excluded, not merely
unscanned.

**Verdict: PASS.** Catalog completeness and zero-literal enforcement are
both independently reverified live and structural (not merely
report-derived), at this update: the full `src/localization/` suite
(9 catalog-adjacent test files) plus `scan-localization.test.ts` — 10 files,
72 tests, all green; `just dev lint frontend`'s `lint:localization` step —
clean.

## `W06.P20.S156` — Audit: canonical action verbs and cross-ID synonym evidence

**Requirement.** Every action-role catalog message leads with a canonical
imperative verb, and any operation carrying synonym-drift risk (the same
underlying action reachable through multiple action ids/surfaces) uses
EXACTLY ONE verb across every one of those ids — never a mix of synonyms
(e.g. "Reload" on one surface, "Refresh" on another) for the same
operation.

**Evidence.** `actionVocabulary.test.ts` (5 tests, independently reverified
live) enumerates the REAL production catalog and the REAL production verb
table (`IMPERATIVE_ACTION_VERBS`) directly — not a hand-copied or shrinking
corpus — and proves: every action-role label (263 keys swept, non-vacuous)
leads with a canonical imperative verb; the canonical operation→verb
inventory is ACTIVE (each operation genuinely owns real action ids in the
current catalog, not a stale table); and, the specific cross-ID synonym
check this audit targets — `"uses one canonical verb per synonym-drift
operation across every action id"` — proves the recovery-verb-drift class
this campaign's own defect ledger caught (`S70`'s divergence, the
project-wide "Reload never Refresh" convention) holds across every action
id in the corpus, not just a spot-checked sample. Adverse coverage: the
same test suite proves the inventory REJECTS a crafted divergent synonym
(`"rejects a divergent synonym for an operation"`), so the check is
live-catching, not vacuously green. `S99` independently confirmed the four
candidate superseded-label-map sites this audit could have flagged as gaps
(`REGION_CYCLE_*_LABEL`, `GRAPH_WALK_*_LABEL`, `SYSTEM_ROW_LABELS`,
`COMMAND_PALETTE_SHORTCUT_LABEL`) are already typed `MessageDescriptor`s
resolving through this same catalog, not raw string maps bypassing the
verb inventory.

**Verdict: PASS.** Canonical-verb leading and cross-ID synonym-drift
rejection are both proven live over the FULL production catalog and verb
table, with adversarial proof the check is genuinely live-catching:
`actionVocabulary.test.ts` — 5/5, independently reverified at this update.

## `W06.P20.S157` — Audit: error, status, confirmation, actionability, and diagnostic-safety evidence

**Requirement.** Every error/status/confirmation message is concise and
plain-language, every actionable state carries a recovery clause where one
exists, and no served diagnostic (raw backend error body, network failure
detail, malformed response) ever reaches the screen unmasked.

**Diagnostic-safety evidence (live, e2e).** `localization-errors.spec.ts`
run live against the production `vaultspec serve` origin — 4/4: a
malformed vault-listing failure, a malformed status-endpoint failure, a
completely malformed non-JSON response body, and an aborted request all
resolve to the catalog's fixed-copy error message with no raw diagnostic
text reaching the DOM. `localization-confirmations.spec.ts` — 1/1: the
feature-archive destructive confirmation names the consequence, the
destructive verb, and a safe cancel path, live.

**Catalog-level evidence.** `outcomeMessages.test.ts` — 4/4, independently
reverified, over the production outcome-message set.
`catalogSafety.test.ts` — 5/5, independently reverified: the production
catalog carries no raw diagnostic/stack-trace-shaped value under any
error-role key. `messagePolicy.test.ts`'s actionability check
(`not-actionable` issue code — an error-role message with no recovery
clause) is enforced live across the full catalog; `S102`'s defect
(`common:agent.composer.teamRunRefused` lacking a recovery clause) is the
proof this check is genuinely live-catching, not vacuous — it caught a
real instance before this dossier's own P19 pass fixed it.

**Defect found, NOT swept.** Rerunning `messagePolicy.test.ts` and
`catalogPunctuation.test.ts` live at this audit surfaced a NEW failure
postdating every earlier verification pass in this dossier:
`common:agent.transcript.team.degraded` (`"Live updates paused — showing
status only."`) contains an em-dash, tripping the message policy's
`em-dash` issue code — `messagePolicy.test.ts` 25/26,
`catalogPunctuation.test.ts` 4/5. Traced via `git log -S` to `c169ad5a98`
itself (the P19 punch-list commit's "actionable team-run copy" change),
so this is a live regression introduced by a commit this dossier already
cites as a fix, not a pre-existing gap this audit merely rediscovered.
Recorded in the Defect ledger as `S157` (found during `P20` evidence
audit); no code fix authored here (audit records evidence only). This is
also a second live instance of the codified `lint:localization`-never-runs-
`vitest` gap below: the punctuation-policy violation is invisible to the
scanner and to `just dev lint frontend`, and reached a "fixed" commit
uncaught.

**Verdict: FAIL (open defect).** Diagnostic-safety, actionability, and
plain-language evidence are otherwise strong and live-proven (e2e 5/5,
catalog suites clean elsewhere), but the punctuation-policy check itself
is NOT clean at this update — one production catalog message violates it.
This step cannot be recorded PASS; the defect is open and routed to the
team lead for a coding-lane fix, not resolved by this audit.

## `W06.P20.S158` — Audit: locale-sensitive formatting and reactive locale behavior evidence

**Requirement.** Number, date, and count formatting is locale-sensitive
(never a hardcoded English format), and every mounted surface reacts
live to a locale change (text, `lang`, and `dir` all update together,
with no stale-locale surface left behind).

**Formatting evidence.** `formatters.test.ts` (5/5, independently
reverified) proves the shared formatter seam resolves through
`Intl`-backed, locale-parameterized formatting rather than a hardcoded
English shape. `localeController.test.ts` (7/7) proves preference
resolution reads only validated locale tokens from the synchronous cache
and fails closed on an invalid/corrupt cached token (`reason:
'cache-invalid'` observed live in this rerun — the fail-closed path is
exercised, not merely asserted). `runtimeFactory.test.ts` (1/1) proves
the runtime construction seam wires a real, non-default locale
correctly.

**Reactivity evidence.** `reactivity.test.tsx` (6/6, independently
reverified) proves mounted consumers re-render on a locale change without
a remount. `localization-layout.spec.ts` (7/7, live, dev-harness config)
proves this end-to-end in a real browser: French sets `lang` and keeps
`ltr`; Arabic sets `lang`, flips `dir`, and mirrors the computed
direction; keyboard focus order still lands the skip link correctly
under RTL; rich named interpolation resolves with real values in both
directions (no raw `{{token}}` leakage); the activity rail's live region
keeps a real translated accessible label under RTL; and resetting the
locale restores the source `lang`, `dir`, and English copy. One run of
this spec showed a single flake (`page.evaluate: Execution context was
destroyed, most likely because of a navigation` on the reset test) —
reran the single test standalone (1/1 passed) and the full file twice
more (7/7 both times), confirming a navigation-timing race in the
harness's `page.evaluate` helper, not a locale-reactivity regression.

**Verdict: PASS.** Locale-sensitive formatting and full reactive
locale-change behavior (text + `lang` + `dir` in lockstep, RTL mirroring,
focus order, live-region labels, interpolation) are proven live, both at
the unit/component level and end-to-end in a real browser: `formatters`
5/5, `localeController` 7/7, `runtimeFactory` 1/1, `reactivity` 6/6,
`localization-layout.spec.ts` 7/7 (one transient flake reproduced as
harness-timing, not product behavior, via standalone + repeated reruns).
