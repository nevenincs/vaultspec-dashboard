---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S05'
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
     The S05 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Extend the Style Dictionary resolver and build to emit the four non-color families into the generated stylesheet regions and ## Scope

- `frontend/tokens/resolver.json` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Extend the Style Dictionary resolver and build to emit the four non-color families into the generated stylesheet regions

## Scope

- `frontend/tokens/resolver.json`

## Description

- Extended the Style Dictionary build with a third generated marker region (foundation) inside the static theme block of the stylesheet, alongside the existing color and theme-remap regions.
- Added a generateFoundation function that flattens the four new DTCG sources and emits font-family, per-role type (size, line-height, weight), radius, base elevation shadow, and spacing custom properties under the canonical -fg- foundation surface.
- Wired generateFoundation into the writeStyles splice path so a single build run regenerates color and foundation regions together, and added the foundation begin/end markers plus the generated declarations into the stylesheet.
- Bound the Tailwind font and text namespaces to the generated foundation so the font and role-named text utilities resolve to the canonical foundation tokens.
- Extended the drift gate to parse and compare the foundation region against a fresh regeneration, and hardened the shared declaration parser to coalesce prettier-wrapped multi-line values (font stacks, layered shadows) so wrapping is not reported as drift.
- Added unit coverage for deterministic foundation generation and for multi-line declaration coalescing.

## Outcome

The non-color foundation now generates mechanically from the DTCG sources into the marked stylesheet region exactly as color does, and the drift gate guards it: editing a non-color token without regenerating fails the gate. The full frontend lint gate passes at exit 0 (eslint, prettier, tsc, the extended token drift check covering color and foundation, and the figma registry check), and the token tests pass.

## Notes

The shared declaration parser previously assumed single-line declarations, which is true of the color region but not of the font-family and layered-shadow values prettier wraps across lines. The parser was generalised to accumulate a declaration from its opener to the terminating semicolon, which keeps the gate formatting-agnostic for both regions and is covered by a new test. The base elevation shadows are generated; per-theme shadow remaps stay hand-authored and are therefore not part of the drift comparison, matching the README scope boundary.
