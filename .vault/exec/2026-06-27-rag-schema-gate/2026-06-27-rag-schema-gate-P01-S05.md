---
tags:
  - '#exec'
  - '#rag-schema-gate'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S05'
related:
  - "[[2026-06-27-rag-schema-gate-plan]]"
---

# Unit-test the extractor and the gate across compatible, newer-version, dim-mismatch, missing-dense-name, and malformed-descriptor cases

## Scope

- `engine/crates/rag-client/src/vectors.rs`

## Description

- Added nine unit tests in `vectors.rs`: the version gate (equal/older/none compatible, newer degrades); the extractor (reads version/name/dim from a real descriptor; tolerant of an absent schema block); and the full gate (compatible passes, pre-contract passes additively, newer-version degrades, dim-mismatch hard-refuses, wrong/missing dense name degrades, advertised-but-missing dim degrades).

## Outcome

All 46 rag-client tests pass (9 new), `cargo clippy -D warnings` is clean, and `cargo fmt --check` is clean for the crate.

## Notes

No mocks of engine logic; the gate is pure and the extractor reads real `serde_json::json!` descriptors.
