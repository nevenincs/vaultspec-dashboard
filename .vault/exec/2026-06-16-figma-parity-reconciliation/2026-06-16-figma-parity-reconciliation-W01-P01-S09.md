---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S09'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

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
