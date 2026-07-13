---
tags:
  - '#exec'
  - '#management-engine-optimization'
date: '2026-06-17'
modified: '2026-07-12'
related:
  - "[[2026-06-17-management-engine-optimization-plan]]"
---

# `management-engine-optimization` `W03.P05` summary

Salience coreness no longer uses a quadratic peel and retains scale invariant coverage.

- Modified: `engine/crates/engine-query/src/salience.rs`

## Description

S07 replaced quadratic coreness peeling with a bounded bucket-queue implementation. S08
added a dense-core plus pendant-leaf invariant test to prevent fan-out from inflating
core salience. Verification passed with targeted coreness tests and the full
`engine-query` lib suite.
