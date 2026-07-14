---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S122'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize host shell actions

## Scope

- Reveal and open-in-editor action descriptors
- Shell action real-behavior and localization-runtime tests
- The exact localization scanner baseline

## Description

- Replaced the reveal label with `common:actions.showInFileManager`.
- Replaced the open-in-editor label with `common:actions.openInEditor`.
- Replaced the shared browser-oriented unavailable message with distinct, actionable desktop-app guidance for each action.
- Removed all three temporary action-presentation bridge calls and their exact allowlist entries.
- Added raw descriptor assertions and real localization-runtime resolution coverage.
- Preserved action IDs, fallback IDs, icons, sections, dispatch types, path bytes, host availability behavior, and degraded results when no host is present.
- Removed the touched test's synthetic host implementation because the repository has no live desktop-host integration surface.

## Outcome

Shell actions now resolve short, sentence-case catalog messages and explain how users can complete unavailable actions without exposing browser or host-bridge implementation details.

The focused run passed 68 tests across three files. The complete frontend lint recipe passed, including localization scanning and TypeScript checks. The scanner baseline decreased from 1,519 to 1,516 findings, and the temporary action bridge decreased from 165 to 162 entries.

## Notes

Terra performed the bounded inventory and mechanical migration. An independent Sol review identified and then verified removal of the synthetic host test; the final review reported no findings.
