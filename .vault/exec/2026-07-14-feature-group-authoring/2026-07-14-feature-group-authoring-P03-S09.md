---
tags:
  - '#exec'
  - '#feature-group-authoring'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S09'
related:
  - "[[2026-07-14-feature-group-authoring-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace feature-group-authoring with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S09 and 2026-07-14-feature-group-authoring-plan placeholders are machine-filled by
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
     The Thread the related parameter from the staged submission through the existing create mutation and receipt-driven coverage invalidation and ## Scope

- `frontend/src/stores/server/queries/mutations.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Thread the related parameter from the staged submission through the existing create mutation and receipt-driven coverage invalidation

## Scope

- `frontend/src/stores/server/queries/mutations.ts`

## Description

- Confirm the create mutation already threads `related`: its args, normalizer, and the direct-write create payload carry the `related` string list end to end to core's `--related`, so the staged submission's links reach the wire unchanged once the panel passes them.
- Deliver the receipt-driven coverage invalidation by enrolling the `features` family in the generation-refresh sweep the create receipt already fires (`onSuccess` on a `created` result runs the shared vault-mutation invalidation), so a just-created document surfaces in the panel's coverage without a bespoke one-off invalidation.
- Document the coverage refresh in the create mutation's contract comment so the receipt-driven behaviour is explicit and reviewable.

## Outcome

- A landed create refreshes feature-group coverage through the same generation-refresh boundary as the tree, graph, filters, and search reads, bounding the watcher latency between the write and the panel reflecting it (ADR constraint).
- No new invalidation path or wire field was needed; the existing ledgered create mutation carries the links and the enrolled subtree carries the refresh.

## Notes

- The `related` submission-to-mutate wiring at the call site belongs to the dialog rework (P04); this step covers only the mutation-layer thread (already present) and the coverage invalidation.
