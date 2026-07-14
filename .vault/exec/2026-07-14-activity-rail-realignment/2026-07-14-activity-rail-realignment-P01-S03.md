---
tags:
  - '#exec'
  - '#activity-rail-realignment'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S03'
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
     The S03 and 2026-07-14-activity-rail-realignment-plan placeholders are machine-filled by
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
     The Design the Backend health and Vault health panel frames - plain-language per-tier availability rows with reasons, core reachability, vault health word plus check verb row and ## Scope

- `Figma SlhonORmySdoSMTQgDWw3w BackendHealthPanel VaultHealthPanel` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Design the Backend health and Vault health panel frames - plain-language per-tier availability rows with reasons, core reachability, vault health word plus check verb row

## Scope

- `Figma SlhonORmySdoSMTQgDWw3w BackendHealthPanel VaultHealthPanel`

## Description

<!-- Succinct line-by-line list of steps executed. Use imperative language, mirroring git commit summary lines. -->

## Outcome

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->

## Description

- Create `BackendHealthPanel` (1089:4474): modal shell with six health rows - Engine, Documents, Links, History, Semantic search, Framework core - each a tone dot (status/health-* triad) + plain-language name + status word, with quiet reason text on degraded rows (Refreshing - rebuilding after edits; Offline - service not running). Internal tier names never appear.
- Create `VaultHealthPanel` (1089:4504): modal shell with the served health word row (Vault documents - Healthy), a Run check Secondary button, and a quiet receipt line (Last check: clean - 2h ago).

## Outcome

Both dark health planes now have bound designed panels; screenshot verified.

## Notes

Vault-health detail beyond the served health word is out of scope per the ADR constraint.
