---
tags:
  - '#exec'
  - '#codebase-graphing'
date: '2026-07-02'
modified: '2026-07-02'
body_hash: 'sha256:a2460b044f6719a844a236d0e6747f1dba13d6c66284f8cc6e0a2708565a77d8'
step_id: 'S14'
related:
  - "[[2026-07-02-codebase-graphing-plan]]"
---

# Scan this repository with the release example and record extraction scale and accuracy counters

## Scope

- `engine/crates/ingest-code/examples/scan.rs`

## Description

Scan this repository with the release example.

## Outcome

797 files → 882 nodes / 3165 edges (2307 imports, 858 contains) in 397ms; 0 parse errors; 2.8% unresolved. Well under the 5000-node ceiling at file granularity.

## Notes
