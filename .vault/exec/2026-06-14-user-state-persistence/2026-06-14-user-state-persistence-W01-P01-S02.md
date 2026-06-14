---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S02'
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
     The S02 and 2026-06-14-user-state-persistence-plan placeholders are machine-filled by
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
     The register the new crate in the workspace members and ## Scope

- `engine/Cargo.toml` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# register the new crate in the workspace members

## Scope

- `engine/Cargo.toml`

## Description

- Add a `vaultspec-session` entry to the workspace `[workspace.dependencies]` table in `engine/Cargo.toml`, path-only as the sibling internal crates are declared.
- Confirm the crate builds via the existing `members = ["crates/*"]` glob.

## Outcome

The workspace now exposes `vaultspec-session` as a path dependency so `vaultspec-api` can consume it in W02 without re-declaring the path. The crate compiles cleanly under the workspace lints. No inference crate was touched.

## Notes

None. The members glob already discovered the crate in S01; this entry only wires the consumable dependency name for later waves.
