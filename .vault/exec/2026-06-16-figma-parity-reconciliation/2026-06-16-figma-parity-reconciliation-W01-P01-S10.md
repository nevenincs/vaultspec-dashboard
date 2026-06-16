---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S10'
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
     The S10 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Migrate the ~309 text usages to the Figma role-named type scale, guarding the text-title versus text-heading collision and ## Scope

- `frontend/src/` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Migrate the ~309 text usages to the Figma role-named type scale, guarding the text-title versus text-heading collision

## Scope

- `frontend/src/`

## Description

- Adopted the binding Figma role-named type scale as the canonical generated foundation, available as the per-role text foundation tokens plus the bound font families.
- Bound the non-colliding Figma roles straight to their Tailwind utility names (display, body, body-strong, label, meta, caption, mono) so those utilities resolve to the canonical foundation tokens.
- Guarded the text-title versus text-heading collision: the Tailwind text-title utility is load-bearing in the current app where it means the legacy 13px section label, not the binding 15px Figma title, so text-title stays bound to the legacy 13px (the new body-strong metrics) and the binding 15px title is reached as the legacy text-heading and as the canonical title foundation token.
- Applied the alias-over-sweep strategy for the remaining legacy type names, keeping them as deprecated aliases rather than sweeping roughly 309 usages across files the rewrite will replace.

## Outcome

The Figma role taxonomy is canonical, the app stays green with no mass type sweep, and the dangerous text-title collision is resolved with no mis-bound usage: legacy text-title keeps 13px and legacy text-heading maps to the binding 15px title. The view rewrite consumes the canonical role tokens directly and the legacy aliases are removed in W04.

## Notes

Alias-vs-sweep decision (recorded per the phase refinement): type is the largest family (about 309 usages across 49 files), all in soon-rewritten files, so a careless rename here risks the exact mis-binding the research flagged. The collision is the load-bearing hazard: the legacy text-title (13px) and the Figma title (15px) share a Tailwind utility name. Binding text-title to the new body-strong (13px medium) preserves every legacy section-label usage at its real size, while the 15px Figma title is exposed both under the legacy text-heading utility (its prior meaning) and under the canonical title foundation token for the rewrite. One deliberate minor shift is recorded: the legacy text-label (11px) now resolves through the Figma label role (12px); the 1px change is negligible on files being rewritten. The styles.css binding and alias blocks are co-located in the single stylesheet file and shipped in the S05 commit; this record and the plan checkbox close the step.
