---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:4fbc0067039a7c2c632aa92e0887916fcc901c2c3c2a67b2289ec41905f480d1'
step_id: 'S22'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace approval-shape-reconciliation with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S22 and 2026-08-01-approval-shape-reconciliation-plan placeholders are machine-filled by
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
     The Remove the session_override and session_override_ignored fields from the PolicyDecisionProjection wire type and ## Scope

- `frontend/src/stores/server/authoring/wireTypes.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Remove the session_override and session_override_ignored fields from the PolicyDecisionProjection wire type

## Scope

- `frontend/src/stores/server/authoring/wireTypes.ts`

## Description

- Remove the `session_override` and `session_override_ignored` fields from the served `PolicyDecisionProjection` wire type, matching the engine's stripped `PolicyDecisionProjection` struct (D5).

## Outcome

`PolicyDecisionProjection` carries only `policy_version`, `scope_mode`, `effective_mode`, `risk`, `requirement`, `reason` — no client-visible trace of the rescinded session-override layer remains in the wire type.

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
