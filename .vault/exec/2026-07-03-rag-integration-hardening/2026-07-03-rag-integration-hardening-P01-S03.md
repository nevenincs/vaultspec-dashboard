---
tags:
  - '#exec'
  - '#rag-integration-hardening'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S03'
related:
  - "[[2026-07-03-rag-integration-hardening-plan]]"
---

# Point flatten_and_annotate and hit_node_id at the flat HTTP response shape (top-level results, snippet field, source as the vault/codebase discriminator), re-record the live-response fixture from the HTTP path, and keep the SearchShapeMiss stated-reason degradation for every shape drift

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Pointed `flatten_and_annotate` at rag's flat HTTP `/search` envelope: it now reads the top-level `results` list (not the CLI-nested `data.results`) and annotates in place, so every flat top-level field (`request_id`, `summary`, `timing`, `index_state`) passes through verbatim.
- Removed the dead `ok:false` in-band error arm and the `SearchShapeMiss::RagError` variant: a rag HTTP-level failure is now caught by the loopback transport as a typed error the handler degrades on before annotation, so the only remaining shape miss is a 2xx body missing its `results` list.
- Kept `hit_node_id` and `RagHitShape` byte-for-byte unchanged — the hit item vocabulary (`source` discriminator, `path`, `function_name`, `class_name`, `source_path`) is identical between the flat and old-nested shapes; only the envelope wrapper changed. The vault→`doc:{stem}`, code/codebase→`code:{path}[#symbol]`, unknown→null-floor semantics are preserved exactly.
- Re-recorded the `RAG_REAL` fixture from a live capture against rag 0.2.28 (`POST /search` on the resident service): real flat top-level keys, the real `.vault/`-prefixed vault path, the live `codebase` discriminator with null code symbols, plus a synthetic `code`+`function_name` hit and an unknown-discriminator hit to pin every annotation branch.
- Rewrote the fixture tests: flat top-level pass-through and the five node-id branches; a missing / non-array `results` as a typed `NoResults` miss; and a new test asserting an empty `results` array is a healthy zero-match, never a miss.

## Outcome

The engine annotator now consumes exactly the wire shape rag's HTTP `/search` returns, verified against a live capture, with the node-id contract unchanged. Shape drift still degrades the semantic tier with a stated reason; an empty result set is honestly a success. `cargo fmt` clean, `cargo clippy -p vaultspec-api --all-targets -- -D warnings` clean, and `cargo test -p vaultspec-api --lib` green at 321 passed.

## Notes

Captured the live fixture read-only over the resident rag on port 8766 (POST /search with the worktree as project_root); no service was started or stopped. The live capture confirmed the flat envelope keys (`request_id`, `results`, `summary`, `timing`, `index_state`) and that live `codebase` chunk hits carry null `function_name`/`class_name`, which the fixture mirrors. The `flatten_and_annotate` name is retained per the plan even though the flat envelope needs no un-nesting; it now annotates in place.
