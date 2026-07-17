---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S133'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Remove manual singular, plural, and count sentence construction from production presentation paths

## Scope

- `frontend/src/stores/server/queries/gitchanges.ts`
- `frontend/src/stores/server/queries/gitchanges.test.ts`
- `frontend/src/stores/server/queries/pipeline.ts`
- `frontend/src/stores/server/queries/pipeline.test.ts`
- `frontend/src/app/right/PlanStepTree.tsx`
- `frontend/src/app/right/PlanStepTree.render.test.tsx`
- `frontend/src/app/right/StatusTab.tsx`
- `frontend/src/app/right/ChangesOverview.tsx`
- `frontend/src/app/right/rail.test.ts`
- `frontend/src/locales/en/common.ts`
- `frontend/src/localization/catalogPlural.test.ts`
- `frontend/src/localization/catalogShellKeys.ts`
- `frontend/src/localization/messagePolicy.shell.ts`
- `frontend/src/stores/view/nowStrip.ts` (deleted)
- `frontend/src/stores/view/nowStrip.test.ts` (deleted)

## Description

- Deleted `gitchanges.ts`'s `pluralLabel()` hand-builder outright; the changes
  summary's "N file(s) changed" total is now a `CountMessageDescriptor` via
  `createCountMessageDescriptor("common:changes.filesChanged", total)`.
- Rewrote `pipeline.ts`'s manual count/plural and raw-English-state-string
  builders as catalog descriptors: the open-plans status label
  (`"pipeline status unavailable"`, `"loading in-flight work"`,
  `"no in-flight work"`/`"reading in-flight work…"`/`"no plans in flight..."`, and
  the `` `${count} plan${s} in flight` `` count sentence) all resolve through
  `common:finalWave.pipeline.*` keys, the count arm via
  `createCountMessageDescriptor`; the plan-row aria labels/progress labels/toggle
  labels (`tierAriaLabel`, `openAriaLabel`, `progressLabel`, `toggleLabel`) and the
  plan-interior tree's loading/placeholder/empty/list-aria/truncated messages
  (`derivePlanInteriorView`) are now `MessageDescriptor`s under
  `common:finalWave.planInterior.*`, with stable module-level descriptor
  references so a memoizing consumer doesn't see a fresh identity every render.
- **`nowStrip.ts` DELETED outright** (228 lines) rather than localized: scouted as
  fully orphaned in production — grepped every importer in `src/`, confirmed only
  its own test file (`nowStrip.test.ts`, also deleted, 108 lines) ever imported
  it, and the live system-status renderer (`deriveSystemStatusRows`) is already
  descriptor-based and does not consume it. Approved by the team lead under the
  `S75`/`S236`/`S238` dead-code retirement doctrine rather than spending a fix on
  dead code.
- **Deliberately left as production-unconsumed dead code, out of scope**:
  `PipelineStatusView`'s `adrRows`/`workStatusTitle`/`workStatusDetail`/
  `liveMessage`/`workSurfaceAriaLabel` fields (and the `PipelineAdrRowView` type
  they depend on) remain raw strings. Verified: grepped every `app/` consumer of
  these fields — none exists outside `pipeline.test.ts` itself; the only
  production consumer of `derivePipelineStatusView`'s output is `StatusTab.tsx`,
  which reads `openPlansStatusLabel` (now localized) and nothing else from this
  set. This is genuinely dead/unconsumed code, not a missed production
  presentation path — recording the judgment per the team lead's instruction
  rather than silently expanding this step's scope to touch dead code.
- `newDocumentAffordances.guard.test.tsx`'s button-name assertions updated from
  `"Add to a feature"` to `"Add to a feature…"` — an unrelated stale-assertion
  fix bundled in the same commit (the catalog already appended the ellipsis per
  message policy for an action that opens a further dialog; the test hadn't been
  updated).
- `fallback.ts`: widened `MessageTranslator` from `Pick<i18n, "exists" | "t">` to
  a plain-string-keyed interface. This was a **project-wide `tsc` unblock**: the
  catalog's growing `MessageKey` union, structurally compared against i18next's
  own per-resource key-inferred `t` overload, blew past TypeScript's union
  comparison complexity budget (TS2859) once the catalog crossed roughly ~1600
  physical keys — meaning ANY further catalog growth (not just this step's) would
  have broken `tsc` project-wide. A real `i18n` instance still structurally
  satisfies the narrower interface (method-parameter bivariance), so nothing
  downstream changes behavior.

## Outcome

Every named manual plural/count/singular construction site in production
presentation paths is now a catalog descriptor; the one orphaned module in this
sweep was deleted rather than localized; one deliberately-out-of-scope dead-code
pocket is recorded rather than silently touched or silently ignored; and a
project-wide `tsc` blocker (unrelated to this step's own text, but that would have
gated every future catalog-growing step) is closed.

## Notes

Landed at commit `8c4220b333`, by `sonnet-finisher` after `opus-l10n`'s third
throttle. This record was authored during a fill pass reconciling the team lead's
verification request — no code changes by me.

Independently reverified, not relayed: read every named file's diff directly
(not just the commit summary); grepped `src/` myself for any remaining consumer
of the deleted `nowStrip.ts`/`nowStrip.test.ts` — only a stale prose comment in
`AppShell.tsx` mentions "NowStrip" conceptually, no functional import survives;
grepped `app/` myself for consumers of the dead `PipelineStatusView` fields,
confirming genuinely zero production consumers exist; live rerun of the full
touched-file test set — 77/77 passed
(`panels.derive.test.ts`, `VaultHealthPanel.localization.render.test.tsx`,
`ChangesOverview` via `rail.test.ts`, `PlanStepTree.render.test.tsx`,
`rail.test.ts`, `newDocumentAffordances.guard.test.tsx`, `gitchanges.test.ts`,
`pipeline.test.ts`, `catalogPlural.test.ts`); `npx eslint` on every touched
source file — clean; a scoped `scan-localization.mjs` run over just this step's
touched files — 0 findings; project-wide `npx tsc --noEmit` — clean (confirms the
`fallback.ts` unblock genuinely holds); `scan-module-size.mjs` — clean.

**Note on a separate, NOT-yet-landed finding** (relayed by the team lead, not
independently verified here since it has no commit to check against): a
pre-existing `errors:unexpectedSection` contract conflict, with a tokenless
ruling and a "vehicle-swap" fix reported in flight — described as a sixth
instance of the scanner-blind class-4 pattern (Codification candidates). Recorded
for visibility; will be independently verified against its own commit when it
lands, per this dossier's standing discipline (cite only real commits, verify on
report, not on relay).
