---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S98'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Remove every temporary scanner exemption and require zero production user-facing literals

## Scope

- `frontend/scripts/scan-localization.mjs`
- `frontend/scripts/scan-localization-policy.mjs`
- `frontend/scripts/scan-localization.test.ts`
- `frontend/scripts/localization-allowlist.json` (deleted)
- `frontend/scripts/fixtures/localization/invalid/legacy-action-presentation.ts` (deleted)

## Description

- Deleted `localization-allowlist.json` outright (git-confirmed file deletion, not
  an emptying) — the scanner carries no allowlist/exemption data file at all.
- Deleted the now-dead legacy-bridge exemption rule from
  `scan-localization-policy.mjs` and its fixture
  (`legacy-action-presentation.ts`), since the bridge it exempted was itself
  deleted in the S17/S18 cutover.
- The step's own text asks to "require zero production user-facing literals" (i.e.
  an emptied-but-present allowlist enforcing zero exemptions); the landed outcome
  is STRONGER — the allowlist mechanism itself no longer exists in the scanner, so
  there is no exemption surface to leave empty or to regress back open.

## Outcome

Zero-literal enforcement is now structural: the scanner has no allowlist/exemption
code path to bypass, rather than a policy of keeping an allowlist file at zero
entries. Stronger-than-asked outcome, recorded per the team lead's instruction.

## Notes

Landed at commit `c8320e07de` ("scanner — remove obsolete allowlist +
legacy-bridge rule (structural zero-literals), add punctuation rule with adverse
fixture, l10n S98/S100/S137 batch"). This record was authored during a fill pass
(bookkeeping only, no code changes by me).

Independently reverified: confirmed via `git log --diff-filter=D` that
`localization-allowlist.json` was genuinely deleted (not just edited) at this
commit; grepped `scan-localization.mjs` for any remaining allowlist/exemption
reference — the only hit is a comment stating there is none; live rerun of
`scripts/scan-localization.test.ts` — 14/14 passed; `scan-localization.mjs` run
against the live production source — 0 findings.
