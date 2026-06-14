---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S10'
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
     The S10 and 2026-06-14-dashboard-workspace-registry-plan placeholders are machine-filled by
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
     The Mirror the /workspaces and extended /map and /session shapes in the frontend mock fixtures and ## Scope

- `frontend/src/stores/server/` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Mirror the /workspaces and extended /map and /session shapes in the frontend mock fixtures

## Scope

- `frontend/src/stores/server/`

## Description

- Add a `/workspaces` route to the frontend mock serving the same flat-with-tiers shape the live route serves: the registered roots (id, label, path, launch-default marker, reachability, reason) plus the active-workspace id.
- Add the `active_workspace` field to the mock `/session` data block, mirroring the live `/session`.
- Honor `active_workspace`, `add_workspace`, and `forget_workspace` in the mock PUT `/session`, mirroring the live route's validation, last-launch-root refusal, and read-only register semantics.
- Honor the optional `workspace=` param on the mock `/map`, 400ing an unknown registered id exactly like the live route, and add a `setWorkspaceReachable` test affordance for the degraded-root state.

## Outcome

The mock mirrors the live wire shape for `/workspaces`, the extended `/map`, and `/session` so the frontend stores adapters and hooks are exercised against the real wire shape through one client path. Mock + session frontend tests and the typecheck pass.

## Notes

The mock cannot probe a real filesystem, so `add_workspace` treats any non-empty path not prefixed `bad` as a valid project (deriving a stable id) and refuses `bad`-prefixed paths — enough to exercise the add/list/forget flow and the validation-refusal state through the real client path.
