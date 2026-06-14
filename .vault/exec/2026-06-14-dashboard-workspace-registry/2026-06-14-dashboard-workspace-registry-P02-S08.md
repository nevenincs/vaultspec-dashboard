---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S08'
related:
  - "[[2026-06-14-dashboard-workspace-registry-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-workspace-registry with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S08 and 2026-06-14-dashboard-workspace-registry-plan placeholders are machine-filled by
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
     The Add the active_workspace field and its PUT handling to the session endpoint and ## Scope

- `engine/crates/vaultspec-api/src/routes/session.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the active_workspace field and its PUT handling to the session endpoint

## Scope

- `engine/crates/vaultspec-api/src/routes/session.rs`

## Description

- Add the `active_workspace` field to the `/session` GET data block beside the active scope, read from the global-settings surface.
- Add `active_workspace` to the PUT `/session` update body: validate it names a registered root (an unregistered id is a tiered 400 leaving the selection unchanged), then persist the active-workspace pointer.

## Outcome

`/session` now carries the active-workspace selection both ways. A route test exercises the active-workspace validation via the registry-mutation tests; selection persists through the same user-state config mechanism the active scope already uses.

## Notes

The active-workspace selection is a config write only; the engine never re-points scope or resets state on selection — the frontend's wholesale reset owns that, so the engine just records the chosen root.
