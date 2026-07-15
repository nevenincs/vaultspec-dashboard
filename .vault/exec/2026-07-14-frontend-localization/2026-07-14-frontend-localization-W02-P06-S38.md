---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S38'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize document-type vocabulary

## Scope

- `frontend/src/stores/server/docTypeVocabulary.ts`
- `frontend/src/stores/server/docTypeVocabulary.test.ts`
- `frontend/src/stores/view/filterSidebar.test.ts`
- `frontend/src/locales/en/documents.ts`
- `frontend/src/localization/testing/resources.ts`
- `frontend/src/localization/catalogKeys.test.ts`
- `frontend/src/localization/messagePolicy.ts`

## Description

- Define the exact frozen six-item document-type identity order.
- Add a separate exhaustive frozen presentation map of catalog descriptors.
- Reject non-displayable, unknown, padded, and null identities without token humanization.
- Add a separate generic Document catalog descriptor and safe temporary compatibility bridge.
- Add genuine English, French, and Arabic catalog and policy coverage.
- Preserve all consumer transport, filtering, cache, category, callback, and wire identities.

## Outcome

The canonical document-type contract now uses keys for Research, Decisions, Plans, Steps,
Audits, and References. Index, code, summary, and arbitrary tokens are not displayable and
cannot be echoed or title-cased. Later-owned consumers remain behaviorally stable through
a deprecated source-catalog bridge that safely uses generic Document for noncanonical data.

## Notes

Terra's rollout suite passed 67 tests across seven files and the complete frontend lint
recipe. Independent Sol review passed 50 tests across five files. The scanner remained
clean at 1,163 findings with no allowlist change, as expected for this documented blind spot.
