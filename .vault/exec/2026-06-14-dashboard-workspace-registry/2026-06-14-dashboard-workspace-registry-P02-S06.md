---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S06'
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
     The S06 and 2026-06-14-dashboard-workspace-registry-plan placeholders are machine-filled by
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
     The Add the GET /workspaces route returning id, label, path, launch-default marker, reachability, and the tiers block and ## Scope

- `engine/crates/vaultspec-api/src/routes/registry.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the GET /workspaces route returning id, label, path, launch-default marker, reachability, and the tiers block

## Scope

- `engine/crates/vaultspec-api/src/routes/registry.rs`

## Description

- Add the `routes/registry.rs` module and register it in the routes mod and the router.
- Add the `GET /workspaces` route returning each registered root's id, label, monospace path, launch-default marker, reachability, and unreachable reason, plus the active-workspace id, through the shared `{data, tiers}` envelope.
- Re-probe each root's reachability read-only on every enumeration (discover + enumerate, no mutation) and persist the refreshed state so a moved or missing root renders degraded and retry-able rather than vanishing.
- Add `/workspaces` to the bearer-gate API prefixes and the contract route inventory so it is gated and not shadowed by the SPA fallback.

## Outcome

The registry is enumerable on the wire with honest reachability and the tiers block on every response. A route test asserts the launch root, its marker, reachability, the active-workspace id, and the tiers block.

## Notes

`/workspaces` is read-only enumeration; registry mutation rides `/session` (config), never this route or the `/ops` proxy, keeping the read-and-infer fence intact.
