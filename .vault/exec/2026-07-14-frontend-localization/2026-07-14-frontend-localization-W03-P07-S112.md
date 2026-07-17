---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S112'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize the pre-hydration boot shell or make it locale-neutral so static HTML never flashes English

## Scope

- `frontend/index.html`

## Description

- Verified the pre-hydration boot shell renders no on-screen or announced text at all: a
  purely visual, `aria-hidden` spinner with no label, documented inline as
  "locale-neutral pre-hydration chrome".
- Confirmed the only static string is the browser tab `<title>`, which is not in-app UI
  chrome.
- Confirmed the document's `lang` attribute is reactively corrected post-hydration by
  the localization runtime (`documentLanguage.ts`, `W01.P01.S118`).
- Ran the bounded localization scanner against the file and confirmed zero exact
  findings.

## Outcome

The static shell never flashes a source-language string before React commits the
localized loading state, satisfying the step's locale-neutral requirement without
needing runtime localization in static HTML.

## Notes

CORRECTION (2026-07-17): the original reconciliation pass read this file after an
uncommitted fix from the coding lane had already landed in the working tree and
incorrectly attributed the file's compliance to prior work. The scanner never catches
`index.html` (it is outside the `src/` scan root) — the shell's `<div id="boot-shell">`
element originally carried `role="status" aria-label="Loading vaultspec dashboard"`, a
raw English string that this scanner-blind gap let through undetected. The coding lane
removed the `role`/`aria-label` pair entirely (the spinner is purely decorative and
`aria-hidden`), which is the correct fix — this shell is intentionally locale-neutral
by omission rather than by localized string, so there is nothing for the runtime to
resolve pre-hydration. Re-verified independently: `git diff` confirms the fix, `tsc
--noEmit` and the full localization scanner are clean, and no test regressed. Reconfirmed
tick stands.
