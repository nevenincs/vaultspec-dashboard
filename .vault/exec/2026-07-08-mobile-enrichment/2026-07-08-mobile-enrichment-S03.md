---
tags:
  - '#exec'
  - '#mobile-enrichment'
date: '2026-07-09'
modified: '2026-07-09'
step_id: 'S03'
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
     The S03 and 2026-07-08-mobile-enrichment-plan placeholders are machine-filled by
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
     The D3: hoist the canonical Vault/doc-type/title trail into a shared helper consumed by DocPanel and CompactDocReader, retiring the bare 2-item breadcrumb and ## Scope

- `frontend/src/app/viewer/docTrail.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# D3: hoist the canonical Vault/doc-type/title trail into a shared helper consumed by DocPanel and CompactDocReader, retiring the bare 2-item breadcrumb

## Scope

- `frontend/src/app/viewer/docTrail.ts`

## Description

- Hoist the canonical Vault / doc-type / title trail into a shared `buildDocTrail` helper.
- Consume it from `DocPanel` (replacing the inline `docTrail`) and `CompactDocReader` (replacing the bare 2-item breadcrumb).

## Outcome

Both the desktop dock reader and the compact slide-in reader derive ONE 3-segment trail; the compact reader shows Vault › <doc-type> › title.

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
