---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S52'
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
     The S52 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Rebuild the graph controls shell from the binding graph Controls frame 88:2 with the Navigate, Layout, Zoom, and Tune groups and ## Scope

- `frontend/src/app/stage/GraphControls.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Rebuild the graph controls shell from the binding graph Controls frame 88:2 with the Navigate, Layout, Zoom, and Tune groups

## Scope

- `frontend/src/app/stage/GraphControls.tsx`

## Description

- Refine the consolidated graph-controls shell `GraphControls.tsx` over the regenerated Figma foundation, keeping the binding `graph/Controls` 88:2 group structure: Navigate (camera icon row plus freeze toggle), Layout (the grouped representation picker), Zoom (the two-stop LOD descent), and Tune (the plain-language d3-force sliders), with Overview collapsed beside Tune.
- Migrate the control type usages off the deprecated legacy aliases the W01.P01.S10 type migration scheduled for W04 removal: the segment and popover-trigger labels move from `text-xs` to the Figma role token `text-label`, and the quiet slider readout and end captions move from `text-2xs` to `text-caption`.
- Confirm the radius and elevation classes (`rounded-vs-*`, `shadow-float`, `shadow-card`) resolve through the foundation alias layer onto the Figma xs/sm/md/lg/pill radius scale and three-level raised/overlay/popover elevation, so the shell rides the generated foundation rather than hand-authored values.
- Record the refinement provenance in the module header and note that S53 supplies the canonical Network/Tree/Grouped/Timeline Layout picker.

## Outcome

The controls shell remains a dumb projection over the preserved `SceneController` and view stores: camera and layout affordances emit `SceneController.command()` only, granularity and representation mode are stores writes, and the shell fetches nothing and reads no raw `tiers` block. Icons stay Lucide structural marks; no raw hex. Scope-limited gate is green: `tsc -b` exit 0, eslint clean, prettier clean.

## Notes

The header comment carries a forward reference to the S53 Layout picker; the actual delegation of the Layout group to the binding `LayoutSelector` lands in the S53 commit (both files are in this phase's scope). No behavioural change to the camera, granularity, or Tune-knob wiring in this step; the refinement is foundation-token fidelity and the binding group structure.
