---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S125'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize document link actions

## Scope

- The shared document copy-link action
- Wiki-link, descriptor, and localization-runtime tests
- The exact localization scanner baseline

## Description

- Replaced the copy-link label with `documents:actions.copyLink`.
- Replaced the source-type error with the actionable `documents:disabledReasons.selectDocument` message.
- Removed arbitrary caller label ingress, the unused label constant, and the temporary action-presentation bridge import.
- Preserved the default and surface-specific action IDs, wiki-link bytes, section anchors, Link icon, copy section, enabled run path, and disabled no-run path.
- Explicitly verified that this non-mutating clipboard action has neither legacy nor typed confirmation and remains run-based without a dispatch descriptor.
- Added raw descriptor and real localization-runtime coverage without invoking or substituting clipboard behavior.
- Removed exactly two matching temporary bridge entries from the scanner allowlist.

## Outcome

Document link actions now use catalog-owned Copy link messaging and tell users to select a document when the action is unavailable. No source-type or implementation terminology is shown.

The focused run passed 55 tests across six files. The complete frontend lint recipe passed, including localization scanning and TypeScript checks. The scanner baseline decreased from 1,503 to 1,501 findings, and the temporary action bridge decreased from 149 to 147 entries.

## Notes

Terra performed the bounded migration. Sol confirmed that adding confirmation would be incorrect for a non-mutating copy action and reported no findings in the final review.
