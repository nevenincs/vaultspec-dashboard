---
tags:
  - '#exec'
  - '#status-overview'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S01'
related:
  - "[[2026-06-16-status-overview-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace status-overview with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S01 and 2026-06-16-status-overview-plan placeholders are machine-filled by
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
     The Add subject to CommitEvent and serve GET /history with bounded commit list, tiers, truncated block and ## Scope

- `engine tests`
- `engine/crates/vaultspec-api/src/routes/history.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add subject to CommitEvent and serve GET /history with bounded commit list, tiers, truncated block

## Scope

- `engine tests`
- `engine/crates/vaultspec-api/src/routes/history.rs`

## Description

- Add a `subject` field to `CommitEvent` in the git log walk, sourced from gix's `commit.message().summary()` (the first message line, trimmed), closing the previously-deferred commit-subject gap the event sourcer flagged.
- Construct the new field at the one `walk` call site and at the one direct test construction in the correlation module.
- Add the bounded, read-only `GET /history?scope=&limit=N` route serving `{commits:[{hash, short_hash, subject, ts, node_ids}], truncated?}`, newest-first, through the shared envelope with the tiers block on success and error.
- Bound the read at creation: a hard `MAX_HISTORY_LIMIT` ceiling (200) with a default of 20; an over-ceiling request is clamped and the clamp is reported in the truncated block.
- Reuse the existing commit→document correlation and the code-id cap so each commit cross-links into the graph without minting a new correlation.
- Degrade the structural tier honestly when the worktree git history is unreadable, returning a tiered 400 rather than a bare 500 or a healthy-looking empty list.
- Register the module and the route; add unit and route-level tests (subject is first message line; newest-first subject-bearing commits with doc correlation; over-ceiling clamp reporting; unknown-scope tiered 400).

## Outcome

Engine builds clean. New tests pass (`ingest-git` log: 6, `vaultspec-api` history: 4). `cargo fmt --check` and `cargo clippy` on the touched crates exit 0. The recommended new-route shape from the ADR is the one delivered; the subject datum is now on the wire.

## Notes

The Figma screenshot read tool was unavailable in this session, so the rail UI (P03) is replicated from the ADR contract and the established design-system token classes the existing rail surfaces already bind, rather than from a fresh screenshot read.
