---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S86'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace a2a-product-provisioning with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S86 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Keep the manifest-declared standalone MCP entrypoint inspectable but outside every dashboard start, adopt, stop, drain, and cleanup path and ## Scope

- `engine/crates/vaultspec-product/src/lifecycle.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Keep the manifest-declared standalone MCP entrypoint inspectable but outside every dashboard start, adopt, stop, drain, and cleanup path

## Scope

- `engine/crates/vaultspec-product/src/lifecycle.rs`

## Description

- Fence the caller-owned standalone MCP entrypoint in `lifecycle.rs`: expose
  `standalone_mcp_entrypoint` for INSPECTION only, alongside
  `owned_gateway_entrypoint` and `is_dashboard_owned`.
- Ensure no dashboard lifecycle path resolves or spawns the standalone MCP —
  `spawn_owned_gateway` and `GatewaySpec::from_manifest` build only from the
  gateway entrypoint, never the MCP.

## Outcome

The standalone MCP is inspectable but never dashboard-owned: `is_dashboard_owned`
is true only for the gateway entrypoint, and the owned launch resolution never
returns the MCP surface.

## Notes

None.
