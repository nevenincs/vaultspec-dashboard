---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S06'
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
     The S06 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Extend the Figma token mirror to carry the type, spacing, radius, and elevation families alongside color and ## Scope

- `frontend/tokens/figma/tokens.json` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Extend the Figma token mirror to carry the type, spacing, radius, and elevation families alongside color

## Scope

- `frontend/tokens/figma/tokens.json`

## Description

- Extended the Figma export generator to mirror the four non-color families alongside color, emitting a single foundation set in the Tokens Studio file.
- Mapped the binding type roles to Tokens Studio typography composites (font family, size, line-height, weight per role) plus a font-family set, radius to a borderRadius set, elevation to a boxShadow set, and spacing to a spacing set.
- Added the foundation set to the token-set order and marked it as an always-active source across all three theme modes so the non-color foundation is present regardless of the selected color mode.
- Regenerated the committed Figma mirror so it now carries the type, radius, elevation, and spacing families alongside the existing color collections.

## Outcome

The Figma mirror now carries the full design-system foundation, not just color, so the binding type/radius/elevation/spacing families round-trip into Figma Variables through Tokens Studio exactly as color already does. The mirror regenerates deterministically from the same DTCG sources the stylesheet generator consumes, keeping code and Figma in lockstep.

## Notes

The mirror remains a one-way code-to-Figma projection generated from the DTCG sources; no value is authored in the export. The typography roles are emitted as composite Tokens Studio typography tokens (the idiomatic Figma text-style shape) rather than loose size/line-height numbers, so they import as Figma text styles. The W04 governance step flips the documented source-of-truth direction to name Figma as binding; this step only extends what the mirror carries.
