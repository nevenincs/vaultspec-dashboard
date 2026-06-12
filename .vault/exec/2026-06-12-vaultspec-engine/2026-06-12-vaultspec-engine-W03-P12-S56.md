---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S56'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Wire engine build, test and lint into the just pipeline and CI

## Scope

- `justfile`

## Description

- Extend the just pipeline: rust test target now includes the e2e package; new `dev test bench` target prints the baseline.
- Add GitHub Actions workflow `engine-ci.yml`: fmt, clippy -D warnings, build, full workspace test on ubuntu + windows with cargo caching, path-filtered to engine changes.

## Outcome

Engine build, lint, and test wired into both the local pipeline and CI; the e2e and bench suites ride the standard workspace test invocation.

## Notes

Carries closed this phase, recorded here: W01P04-104 (resolver memoizes file reads per pass; bounded root-.gitignore honoring - bare directory entries; glob/negation explicitly out of v1), and the DF-4 residual (watcher JoinHandle held in serve state; /status reports a dead watcher as running:false with reason instead of claiming residency).
