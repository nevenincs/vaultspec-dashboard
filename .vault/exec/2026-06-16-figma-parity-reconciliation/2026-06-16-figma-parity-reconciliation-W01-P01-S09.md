---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S09'
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
     The S09 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Migrate the ~167 radius usages to the Figma scale, re-keying and converting rounded-full to pill18 and ## Scope

- `frontend/src/` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Migrate the ~167 radius usages to the Figma scale, re-keying and converting rounded-full to pill18

## Scope

- `frontend/src/`

## Description

- Adopted the binding Figma radius scale (xs4, sm5, md7, lg10, pill18) as the canonical generated foundation, available as the radius foundation tokens.
- Applied the alias-over-sweep strategy: kept the legacy radius names as deprecated aliases onto the Figma scale rather than sweeping the radius usages across soon-rewritten files.
- Mapped the legacy steps onto the binding scale: legacy sm (4px) to xs, legacy md (6px) to md (now 7px), legacy lg (10px) to lg, and legacy xl (14px) to the nearest binding lg (10px).
- Left the new pill (18px) without a legacy alias because the prior code used a native fully-rounded utility; that rounded-full to pill18 re-key is part of the W02/W03 rewrite.

## Outcome

The current app stays green with no radius sweep while the canonical scale is the Figma xs4/sm5/md7/lg10/pill18 set. The retune (md 6px to 7px, xl 14px to nearest 10px) and the rounded-full to pill18 re-key land per surface in the view rewrite; the deprecated aliases are removed in W04.

## Notes

Alias-vs-sweep decision (recorded per the phase refinement): the radius family carries the largest blast radius (the research counted roughly 167 usages plus the rounded-full conversions across about 50 files), and those files are rewritten in W02 and W03, so a mechanical class sweep here would be discarded. Adopting the Figma scale as canonical with legacy aliases keeps the app green with only a negligible visual shift (legacy md 6px renders at the binding 7px, legacy xl 14px renders at 10px). The rounded-full to pill18 conversion is intentionally deferred to the rewrite because it is a per-shape decision, not a global rename. The styles.css alias block is co-located in the single stylesheet file and shipped in the S05 commit; this record and the plan checkbox close the step.
