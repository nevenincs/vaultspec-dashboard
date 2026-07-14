---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S05'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace frontend-localization with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S05 and 2026-07-14-frontend-localization-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Implement locale-aware number, date, relative-time, list, duration, percentage, and byte formatters and ## Scope

- `frontend/src/platform/localization/formatters.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Implement locale-aware number, date, relative-time, list, duration, percentage, and byte formatters

## Scope

- `frontend/src/platform/localization/formatters.ts`

## Description

- Add locale-explicit formatters for numbers, dates, relative time, lists,
  percentages, durations, and byte sizes.
- Reject invalid locale and value inputs before they can render `NaN` or invalid dates.
- Compose durations from localized unit and list formatters without relying on
  `Intl.DurationFormat`.
- Bound every retained `Intl` formatter cache and every formatted list.

## Outcome

The localization platform now owns pure formatting functions that accept the active
locale explicitly and return `null` for invalid input. Percentages use a documented
ratio contract, durations use deterministic millisecond-based units, and byte sizes use
a bounded base-1024 scale with localized unit labels. Each Intl formatter family admits
only its documented option names, bounds retained string values, and safely rejects
hostile reflected input.

## Notes

Targeted Prettier, ESLint, isolated strict TypeScript 6, and real production-module
Vitest assertions passed. The runtime assertions covered Proxy-backed inputs, unknown
and oversized options, singular relative-time units, and valid family-specific options.
