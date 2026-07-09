---
tags:
  - '#exec'
  - '#mobile-enrichment'
date: '2026-07-09'
modified: '2026-07-09'
step_id: 'S01'
related:
  - "[[2026-07-08-mobile-enrichment-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace mobile-enrichment with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S01 and 2026-07-08-mobile-enrichment-plan placeholders are machine-filled by
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
     The D2: surface document review metadata inline on compact (date + plain-language ADR acceptance / plan progress) as a second meta line and ## Scope

- `desktop one-value+tooltip untouched`
- `frontend/src/app/left/TreeBrowser.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# D2: surface document review metadata inline on compact (date + plain-language ADR acceptance / plan progress) as a second meta line

## Scope

- `desktop one-value+tooltip untouched`
- `frontend/src/app/left/TreeBrowser.tsx`

## Description

- Add `docCompactSubMeta` deriving the authored date + plain-language status word (ADR acceptance / plan done-of-total) from served fields only.
- Add a `subMeta` slot to the shared `VaultTreeRow`; when present, render the title over an inline meta line and suppress the desktop trailing signal/meta so a row never carries both.
- Branch `DocumentRow` on `useViewportClass()`: compact passes `subMeta`; desktop keeps its one-value + shape-mark + hover tooltip unchanged.

## Outcome

Compact document leaves surface the date + status word inline; the desktop density law is untouched. Verified live @390px (123 inline ADR-status words, 94 plan-progress values, 224 dates).

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
