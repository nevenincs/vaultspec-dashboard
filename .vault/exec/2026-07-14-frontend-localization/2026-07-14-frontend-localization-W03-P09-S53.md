---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S53'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize project setup guidance, progress, results, and recovery

## Scope

- Project setup presentation, catalogs, message policy, localization tests, and exact scanner allowlist.

## Description

- Replace static setup copy with typed project message descriptors.
- Suppress raw job labels, paths, process output, transport errors, and unknown tokens.
- Localize known completion states, plural item counts, progress, failure, and recovery.
- Provide genuine English, French, and Arabic resources.

## Outcome

Project setup now presents concise, actionable messages without exposing diagnostics,
platform details, commands, internal tools, or service vocabulary.

## Notes

This step shipped atomically with S57 and S241. The complete batch removed twenty exact
scanner rows and passed Sol review with no findings.
