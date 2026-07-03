---
tags:
  - '#exec'
  - '#rag-integration-hardening'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S02'
related:
  - "[[2026-07-03-rag-integration-hardening-plan]]"
---

# Swap the /search route onto the rag-client HTTP transport under rag_offload: map SearchBody query/target/max_results to rag's query/type/project_root/top_k vocabulary, introduce a warm-service SEARCH_HTTP_BUDGET, keep the pre-rag validation and typed-discovery availability gate, and delete the CLI spawn path (SEARCH_SIBLING_TIMEOUT and the rag_invocation search arm)

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Replaced the per-query CLI subprocess in the `search` handler with the `rag-client` `http_search` transport, run under `rag_offload` onto the blocking pool exactly like every other brokered rag read.
- Introduced `SEARCH_HTTP_BUDGET`, pinned to `rag-client`'s Tier-1 `READ_BUDGET` (10s), documenting that search now rides the warm resident service rather than a cold spawn, and that the client budget must strictly exceed it so the tiers envelope always lands.
- Rewrote `search_args_for` into `search_body_for`, which keeps every pre-rag bound (non-empty query, `MAX_SEARCH_QUERY_CHARS`, target whitelist, `MAX_SEARCH_RESULTS` ceiling) and builds rag's HTTP body `{query, type, project_root, top_k}`.
- Mapped the engine's `{vault, code}` target vocabulary to rag's `{vault, codebase}` type, folding the whitelist check into the mapping; an absent target defaults to `vault` (the app default), and absent `max_results` omits `top_k` so rag uses its own default. `project_root` is the engine-controlled scope root, never client-supplied.
- Preserved the availability gate through `rag_control_transport`: discovery `Unavailable` returns 200 with empty results and degraded tiers; a transport fault degrades the semantic tier via `degradation_reason`.
- Deleted the search-only `SEARCH_SIBLING_TIMEOUT` constant and the search arm's use of `rag_invocation` / `run_sibling_bounded_in_dir`; `rag_invocation` itself stays (the lifecycle, storage, and CLI-whitelist runners still use it).
- Updated the co-located unit test to assert the new HTTP body shape, the target-vocabulary mapping, the top_k omission, and the same bound rejections.

## Outcome

`/search` is now a bounded warm HTTP round-trip to the resident rag service, aligned with the accepted control-plane transport split, with per-query process + interpreter + model-attach latency removed. Every fault path still degrades the semantic tier truthfully as a tiers-carrying 200. `cargo fmt` clean, `cargo clippy -p vaultspec-api --all-targets -- -D warnings` clean, and `cargo test -p vaultspec-api` green (declared-tier-parity, salience, file-tree, and the search body test all pass).

## Notes

`flatten_and_annotate` and `hit_node_id` still read the CLI-nested `data.results` shape at this step; pointing them at rag's flat HTTP envelope and re-recording the fixture is S03. The tree stays green in between because the S03 change is isolated to the annotator and its own fixture tests.
