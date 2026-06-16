---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S23'
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
     The S23 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Rebuild the app shell layout frame from its binding frame as a dumb projection over the preserved view stores and ## Scope

- `frontend/src/app/AppShell.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Rebuild the app shell layout frame from its binding frame as a dumb projection over the preserved view stores

## Scope

- `frontend/src/app/AppShell.tsx`

## Description

- Migrate the app shell layout frame onto the new W01.P01 Figma foundation: the deprecated alias type utility maps to the canonical caption role utility, and the deprecated radius alias maps to the canonical xs radius utility, so the shell consumes the generated foundation directly rather than the deprecated alias surface.
- Keep the four-region grid skeleton (left scope rail, center stage, right activity rail, bottom timeline) intact as a dumb projection over the preserved view stores: rail collapse is read from the view store and toggled through its mutators, the theme setting bridge and consumed-settings effects are called once at the shell top, and the shared backend-signal stream is mounted once here.
- Touch no fetch, no raw tiers read, and no stores shape: every region wires preserved hooks and shared-state intent only.

## Outcome

The app shell renders on the canonical Figma foundation utilities (caption type, xs radius) with the layout frame and store wiring unchanged. The shell remains a pure projection: it reads leftRailCollapsed and rightRailCollapsed from the view store, drives toggleLeftRail and toggleRightRail, and bridges the theme setting and the consumed settings effects without any direct engine access. The full frontend lint gate passes at exit 0 (eslint, prettier format check, tsc, token-drift, figma-registry) and the left-rail test suite stays green.

## Notes

Figma read tools were unavailable in this environment, so the rebuild was grounded in the existing shell (already restyled to the binding frame this cycle per research F3), the Code Connect registry, and the frozen contract reference. The right activity rail composition is imported from the P05-owned right-rail surfaces and was not modified; only the shell's own layout frame and its foundation token usage were migrated. Spacing utilities stay on the value-identical legacy aliases (research F1 records spacing as a MATCH family, outside the migration scope).
