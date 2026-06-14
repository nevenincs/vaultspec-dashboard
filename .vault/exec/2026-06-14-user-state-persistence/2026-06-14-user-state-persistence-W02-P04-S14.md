---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S14'
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
     The S14 and 2026-06-14-user-state-persistence-plan placeholders are machine-filled by
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
     The make the SSE stream and since resume per-scope from the cell ring and ## Scope

- `engine/crates/vaultspec-api/src/routes/stream.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# make the SSE stream and since resume per-scope from the cell ring

## Scope

- `engine/crates/vaultspec-api/src/routes/stream.rs`

## Description

- Add an optional `scope` query parameter to `/stream`: an explicit scope
  resolves its cell through the registry (warming it if cold); absent or
  unresolvable, the active scope's cell is the fallback so the SSE handshake is
  never an error surface.
- Subscribe to THAT cell's broadcast `tx` and replay `since=` from THAT cell's
  ring, so resume and gap-detection run against the scope's OWN monotonic clock —
  per-scope resume is correct and independent.
- Preserve the subscribe-first-then-snapshot ordering, the sequence-threshold
  de-duplication, and the lagged-to-gap behavior intact on the per-cell channel.
- Re-point `/status` to the active scope's cell for its index counts,
  generation, watcher residency, and `last_seq`, reading from the always-pinned
  active cell.

## Outcome

`/stream` is per-scope: a client streams a named scope and resumes against that
scope's own clock; the existing stream tests (lag-to-gap mapping and the real
broadcast overflow) stay green against the per-cell shape. `/status` reports the
active scope truthfully.

## Notes

WIRE CHANGE flagged for the W04 mock-parity work: `/stream` now accepts an
optional `scope` query parameter; the client must pass `scope` to stream a
specific worktree, and the mock engine double must mirror this. Absent `scope`
falls back to the active scope, so a single-scope client stays backward
compatible. `/status`'s `scope` field already echoes the served scope token; it
now reflects the ACTIVE scope, which the mock should mirror as the selected
worktree.
