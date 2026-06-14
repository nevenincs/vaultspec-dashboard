---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S05'
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
     The S05 and 2026-06-14-dashboard-workspace-registry-plan placeholders are machine-filled by
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
     The Roundtrip-test registry persistence and corrupt-store recreation and ## Scope

- `engine/crates/vaultspec-session/tests/` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Roundtrip-test registry persistence and corrupt-store recreation

## Scope

- `engine/crates/vaultspec-session/tests/`

## Description

- Add an integration test file exercising the registry through the public handle over the real on-disk SQLite store: order, reachability, and active-workspace selection all survive a reopen cycle.
- Add an idempotency test proving auto-register on reboot does not re-seed, reorder, or duplicate the launch root.
- Add a forget test proving the last-launch-root refusal and sibling removal across the real store.
- Add a corruption test proving a garbage db file recreates an empty registry without panic and that a re-launch re-seeds the launch root.

## Outcome

Registry persistence and corrupt-store recreation are proven against the real adapter with no mocks or doubles. All session-crate tests pass (15 unit, 4 registry integration, 3 store integration), and clippy is clean with warnings denied.

## Notes

The tests record, select, and forget registry rows only; they never touch any repository on disk, consistent with the registry-is-config-not-content posture.
