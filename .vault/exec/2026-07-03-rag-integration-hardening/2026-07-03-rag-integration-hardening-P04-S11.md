---
tags:
  - '#exec'
  - '#rag-integration-hardening'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S11'
related:
  - "[[2026-07-03-rag-integration-hardening-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace rag-integration-hardening with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S11 and 2026-07-03-rag-integration-hardening-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Add the engine rag-gated live success test: discover the resident machine-global rag, drive a real query through /search, assert annotation and index_state on the live envelope, and skip with a stated reason when no service is discovered and ## Scope

- `engine/crates/vaultspec-api/tests/` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the engine rag-gated live success test: discover the resident machine-global rag, drive a real query through /search, assert annotation and index_state on the live envelope, and skip with a stated reason when no service is discovered

## Scope

- `engine/crates/vaultspec-api/tests/`

## Description

- Add a new integration test file `rag_live_search.rs` holding one rag-gated live success test that drives a REAL query through the whole `/search` chain — engine route, resident rag over the bounded loopback transport, `flatten_and_annotate`, tiers envelope.
- Gate the test on machine-global discovery plus a live `/health` via `probe_machine_state` (the authoritative running-predicate), passing the fixture cell's `.vault` root so the home-anchored `~/.vaultspec-rag` service wins discovery.
- Follow the house env-gated pattern from the e2e suite for the skip path: on a non-Running machine state, `eprintln!` a stated reason including the observed state and early-`return`, since Rust has no native skip.
- Send the fixture cell's own root as `project_root` so a fresh fixture vault is an UNINDEXED scope, and assert the HONEST served contract rather than forcing an indexed match.
- Assert the served envelope shape: 200, a `tiers` object present, `data.results` always an array, the semantic tier availability reported as a boolean, and — on the resident-rag success — the semantic tier available, rag's `index_state` block forwarded verbatim as an object, `semantic_epoch` present as a number or an explicit null, and every hit carrying the annotated `node_id` key.

## Outcome

The live test ran LIVE on this machine against the resident rag 0.2.28 (port 8766, `/health` ready) and passed: the semantic tier came back available, results was an empty array (the fixture vault is an unindexed scope), `index_state.status` was `missing` with `target_matches` true, and `semantic_epoch` was null (the epoch cache slot was cold, honestly annotated as null rather than a fabricated value). The empty result set exercises the `node_id` per-hit assertion vacuously; it becomes load-bearing the moment a scope is indexed. On a rag-less machine the same test skips with the stated reason and the observed machine state. Gates: `cargo fmt --all --check` exit 0, `cargo clippy -p vaultspec-api --tests -D warnings` exit 0, and the full `cargo test -p vaultspec-api` green (324 + 8 + 2 + 5 + 1 + 5 + 5 across the suite binaries, 0 failed).

## Notes

The pre-flight probe against the running rag confirmed the two honest branches: a `project_root` without a `.vault/` directory is a rag 400 (which the loopback transport maps to a typed error and the route degrades on), while a valid-but-unindexed `.vault/` root is a 200 with an empty `results` array plus `index_state.status = "missing"`. The fixture creates a `.vault/plan` tree, so it takes the second branch — the asserted success path. The stderr noise during the run (watcher failing to start on the tempdir, the declared tier reporting core-graph unavailable) is expected fixture-scope noise from `build_state` on a bare tempdir and is unrelated to the search assertions.
