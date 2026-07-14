---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S01'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Install the approved localization dependencies and lock exact compatible versions

## Scope

- `frontend/package.json`
- `frontend/package-lock.json`

## Description

- Add exact production dependencies on `i18next` 26.3.6 and `react-i18next` 17.0.9.
- Regenerate the npm lockfile with resolved package metadata and integrity hashes.
- Confirm the selected releases satisfy the existing React and TypeScript versions.

## Outcome

The frontend manifest and lockfile now deterministically install the accepted localization runtime. Registry metadata confirms `react-i18next` 17.0.9 accepts `i18next` 26.3.6, React 19, and TypeScript 6. The installed dependency tree resolves both exact versions, and the production dependency audit reports no vulnerabilities.

## Notes

A clean `npm ci --ignore-scripts` verification could not remove a native Lightning CSS binary held open by another Windows process. A subsequent non-destructive `npm install --ignore-scripts` completed, restored the dependency tree, and passed `npm ls` and `npm audit --omit=dev`; the file-lock warning did not alter tracked files or the resolved localization packages.
