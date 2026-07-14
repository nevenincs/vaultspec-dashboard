---
tags:
  - '#exec'
  - '#activity-rail-realignment'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S10'
related:
  - "[[2026-07-14-activity-rail-realignment-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace activity-rail-realignment with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S10 and 2026-07-14-activity-rail-realignment-plan placeholders are machine-filled by
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
     The Build the Vault health panel body - served vault health word plus the existing vault-check ops verb with receipt and ## Scope

- `frontend/src/app/panels/VaultHealthPanel.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Build the Vault health panel body - served vault health word plus the existing vault-check ops verb with receipt

## Scope

- `frontend/src/app/panels/VaultHealthPanel.tsx`

## Description

<!-- Succinct line-by-line list of steps executed. Use imperative language, mirroring git commit summary lines. -->

## Outcome

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->

## Description

- Build the Vault health body: served vault-health word row via `useCoreStatus`, plus the EXISTING whitelisted `vault-check` core ops verb dispatched through `useOpsRunMutation` with the shared `OpsReceipt` idiom.

## Outcome

Green (pure-derive tests). Executed by rail-chrome-coder; verified independently.

## Notes

No new wire call - the verb was already whitelisted (OPS_WHITELIST).
