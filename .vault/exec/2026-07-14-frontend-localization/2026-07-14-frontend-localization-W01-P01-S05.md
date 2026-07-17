---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S05'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

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
hostile reflected input. Locale identifiers are capped before canonicalization and cache
insertion so every retained formatter key has a finite size bound.

## Notes

Targeted Prettier, ESLint, isolated strict TypeScript 6, and real production-module
Vitest assertions passed. The runtime assertions covered Proxy-backed inputs, unknown
and oversized options, singular relative-time units, valid family-specific options, a
90,000-character valid private-use locale, and an ordinary complex BCP 47 locale.
