---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S24'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace user-state-persistence with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S24 and 2026-06-14-user-state-persistence-plan placeholders are machine-filled by
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
     The add a registry scope-switch and per-scope resume integration test and ## Scope

- `engine/tests/tests/e2e.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# add a registry scope-switch and per-scope resume integration test

## Scope

- `engine/tests/tests/e2e.rs`

## Description

- Added a `switching_active_scope_serves_that_worktree_and_resumes_its_own_clock` e2e test over the existing two-worktree landscape fixture (main plus a feature worktree whose plan diverges with a branch-only `src/new.rs` mention).
- Asserted the launch worktree is the active scope at boot, and main's graph carries no `src/new.rs` edge.
- Switched the active scope to the feature worktree through `PUT /session` `active_scope`, asserted the session now names the feature worktree.
- Asserted the feature scope's graph DOES carry the branch-only `src/new.rs` mention as a broken structural edge, proving the read was genuinely retargeted to that worktree's bytes.
- Added an `http_stream_capture` helper that connects to `/stream`, sends the request, and reads the SSE resume backlog within a bounded window.
- Asserted per-scope SSE `since=0` resume against the feature scope replays that cell's own monotonic-ascending delta ids, and that the main scope independently replays its own non-empty backlog — proving the two scopes never share a seq space.

## Outcome

The test passes: `cargo test -p engine-e2e --test e2e switching_active_scope` is green. The scope switch retargets reads to the correct worktree and per-scope `since=` resume is correct against each scope's own clock. No mocks, no skips; every assertion derives from the fixture's known divergence and the contract.

## Notes

- The divergent mention `src/new.rs` does not exist on disk, so it surfaces as a BROKEN structural edge (`dst: code:src/new.rs`) rather than a code node; the assertion checks the edge `dst`, which is the genuine per-scope divergence signal.
- The fixture worktrees have no `.vaultspec` dir, so the declared tier is truthfully unavailable; the structural graph (the divergence under test) is unaffected.
