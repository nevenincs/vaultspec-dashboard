---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S17'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# After every action producer through S82 is migrated, remove the legacy bridge and require bounded typed labels, reasons, and confirmations in the final action contract

## Scope

- `frontend/src/platform/actions/action.ts`
- `frontend/src/platform/actions/registry.ts`

## Description

- `ActionPresentation` narrowed from `LegacyActionPresentation | MessageDescriptor`
  to `MessageDescriptor` alone — `export type ActionPresentation =
  MessageDescriptor;` — so `ActionDescriptor.label` and `disabledReason` can no
  longer admit a legacy string.
- Deleted the entire legacy bridge: the `LegacyActionPresentation` branded string
  type, `legacyActionPresentation()`, `normalizeLegacyActionPresentation()`, and
  `LEGACY_ACTION_PRESENTATION_MAX_CHARS`.
- `normalizeActionPresentation()`/`resolveActionPresentation()` collapsed to the
  single typed-descriptor path (no more `typeof presentation !== "string"` branch).
- `registry.ts` carries no bridge references of its own (confirmed by grep);
  registration/resolution flows entirely through the narrowed `ActionPresentation`.

## Outcome

The final action contract requires a bounded typed `MessageDescriptor` for every
label, reason, and confirmation — no producer can construct an `ActionDescriptor`
carrying a raw string anymore, closing the gap S22's held-open note and the
reconciliation dossier's earlier findings both flagged.

## Notes

Landed at commit `9b23233257` ("delete the legacy action-presentation bridge —
ActionPresentation is MessageDescriptor alone, strict-contract tests prove
rejection"), alongside `S18`, `stores/view/contextMenu.test.ts`, and
`stores/view/keymapDispatcher.test.ts` (fixture fallout in the latter two,
converted from raw-string to `MessageDescriptor` fixtures). Independently
reverified: `git diff` matches the reported change exactly (confirmed via
`git show 9b23233257 --stat` — 4 files, matching the report precisely), a source
grep for `LegacyActionPresentation`/`legacyActionPresentation` across
`action.ts`/`registry.ts` returns zero matches, `npx tsc --noEmit` clean (the only
project-wide errors are in `app/agent/Composer*`/`a2aTeam.ts`, unrelated fenced
agent-lane WIP, confirmed not touched by this change), and the live suite
(`registry.test.ts` + `contextMenu.test.ts` + `keymapDispatcher.test.ts` +
`actionCoverage.guard.test.ts` + `commandPalette.guard.test.ts` +
`chromeActions.test.ts`) — 79/79 passed, matching the reported count. Fixed by
opus-l10n; this record documents the fix, not a fresh implementation on my part.
This closes `W02.P04.S17`/`S18`, the plan's final closure gates outside W06 — see
the corrected Open Items section of the 2026-07-17 reconciliation closing dossier
for the full history of this gate's mis-description and correction.
