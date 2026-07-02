---
tags:
  - '#exec'
  - '#codebase-graphing'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S07'
related:
  - "[[2026-07-02-codebase-graphing-plan]]"
---

# Add the source-tree fingerprint cache key and the extraction orchestration with rayon parallel parse and honest counters, plus the scan example

## Scope

- `engine/crates/ingest-code/src/lib.rs`

## Description

Key extraction on the (path,len,mtime,cap-state) source-tree fingerprint; orchestrate walk → rayon parallel parse → resolve → mint with honest counters; add the scan example.

## Outcome

End-to-end polyglot fixture test green. Real-repo scan (release): 797 files → 882 nodes / 3165 edges in ~0.4s, 0 parse errors, 3034 internal / 1353 external / 128 unresolved (2.8%) imports.

## Notes
