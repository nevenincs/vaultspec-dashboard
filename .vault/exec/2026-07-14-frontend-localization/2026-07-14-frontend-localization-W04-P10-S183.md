---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S183'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Standardize and localize connection menu actions without node, ID, or JSON vocabulary

## Scope

- `frontend/src/app/right/menus/edgeMenu.ts`

## Description

- Verified every action label and disabled reason resolves through a typed message-key
  descriptor (`common:actions.highlightOnStage`, `common:actions.goToDestinationNode`,
  `common:actions.copy`, `common:disabledReasons.noDestinationNode`,
  `common:disabledReasons.noRelation`, `common:disabledReasons.noDestination`) or the
  shared `copyAction` builder, never a raw English literal.
- Confirmed no visible label names "node", "ID", or "JSON" — the full-record copy
  action serializes structured data as the copy payload (not display text) under the
  same generic `common:actions.copy` label as the other copy actions.
- Ran the bounded localization scanner against the file and confirmed zero exact
  findings.
- Ran the live `rightMenus.test.ts` suite: it surfaced one stale assertion (expects a
  raw string `disabledReason` where the resolver now correctly returns a typed key
  descriptor) — a test-only defect reported separately under `W04.P10.S185`, not a
  defect in this file.

## Outcome

The connection (edge) menu renders only localized, typed-descriptor copy with no
internal-vocabulary leakage.

## Notes

Reconciliation pass (bookkeeping only, no code changes). The work landed in bulk commit
`3562d0262a` ("localize frontend and split oversized modules"), building on the earlier
`fca95b4c66` ("feat(localization): migrate clipboard action language") shared-builder
migration. This record retroactively documents and ticks the plan step; verification
was file inspection, a scoped scanner run, and a live focused-test run, not a fresh
implementation.

AMENDMENT (2026-07-17): the original verification above accepted `edge:copy-id`
(copying the raw internal edge id) and `edge:copy-full` (a JSON dump of
`{id, relation, dst, tier}`) as compliant because they used the generic
`common:actions.copy` label rather than a literal word "node"/"ID"/"JSON" — but the
2026-07-15 context-menu-copy-safety audit's CMCS-001 finding is broader than
vocabulary: the clipboard is user-facing output, so a raw internal identifier or a raw
structured-data dump is never copied regardless of its label wording. This is the same
defect class already fixed on `graphNodeMenu.ts`/`metaEdgeMenu.ts` under `W03.P09.S177`/
`S179`; `edgeMenu.ts` was missed at the time because this step's own verification pass
predated the copy-safety audit.

FIX (copy-safety follow-up, landed this session): `edge:copy-id` and `edge:copy-full`
were removed outright. `edge:copy-destination` was changed from copying the raw
`normalizedEntity.dst` node id to copying the destination's DOCUMENT NAME via the
shared `docStemFromNodeId` seam (the same helper `W03.P09.S177`'s `node:copy-
document-name` fix uses), under the existing `common:actions.copyDocumentName` label —
disabled-with-reason (`common:disabledReasons.noDestination`) when the destination is
absent or is not a document. `edge:highlight`, `edge:goto-destination`, and
`edge:copy-relation` (a genuine user-facing semantic label, not raw identity) are
unchanged. No catalog change was needed — both `docStemFromNodeId` and
`common:actions.copyDocumentName` already existed.

Independently reverified: `git diff` matches the reported change exactly, the
localization scanner is clean, and the live suite (`rightMenus.test.ts` +
`rightMenus.localization.test.ts` + `actionCoverage.guard.test.ts` +
`commandPalette.guard.test.ts`) — 39/39 passed, matching the reported count. Landed
at commit `556f8967d9` ("remove raw edge-id copy actions, copy destination document
name instead"), reverified against that commit after it landed (the initial
verification pass above was against matching working-tree state, per the team's
rule that a citation always names the real landing commit, never working-tree
state). Fixed by opus-l10n; this amendment documents the fix, not a fresh
implementation on my part.

