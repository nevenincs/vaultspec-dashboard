---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S14'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace figma-parity-reconciliation with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S14 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Add the bounded read-only historical text-diff route as a two-rev git diff whitelist extension, read-and-infer with no vault writes and ## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the bounded read-only historical text-diff route as a two-rev git diff whitelist extension, read-and-infer with no vault writes

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Add a `histdiff` verb to the read-only git whitelist that runs a two-rev `git diff <from> <to> -- <path>` over the git object DB, with no working-tree mutation flag.
- Add a `validate_rev` guard rejecting an empty token, a leading `-` (flag injection), a `..`/`...` range expression, and any whitespace-bearing token, so each rev is a single bounded revision.
- Extend `git_args_for` to append the two validated revs before the `-- <path>` separator for rev verbs, rejecting revs handed to a non-rev verb and a rev verb missing its revs.
- Extend `GitOpBody` with optional `from`/`to` rev fields and update `ops_git` to require BOTH revs for a historical diff (either alone is a 400 before any subprocess) and reject a non-rev verb handed revs.
- Add unit tests for the two-rev arg builder and the rev validator, and an integration test forwarding a real two-rev historical diff verbatim.

## Outcome

The bounded read-only historical text-diff route is served as a `git diff <from> <to> -- <path>` whitelist extension with both revs and the path validated. It stays read-and-infer: no whitelisted git verb mutates the working tree or refs, enforced by the existing read-only-whitelist test. The engine crate builds, the ops tests pass, and `cargo fmt --check` plus `cargo clippy -D warnings` are clean on the touched crate.

## Notes

The route reuses the existing bounded git runner (output cap plus wall-clock timeout), so a hung or runaway git on a large historical diff degrades the same way the working-tree diff does. The tiers carriage on the route's envelopes is closed in S15.
