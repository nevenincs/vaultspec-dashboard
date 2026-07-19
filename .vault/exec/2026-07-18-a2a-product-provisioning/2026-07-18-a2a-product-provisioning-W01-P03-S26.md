---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S26'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace a2a-product-provisioning with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S26 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Prove typed refusal, initial bootstrap, active-receipt mutation, at-cap atomic race rejection, and concurrent cross-operation single-flight using production routes and a real registry and ## Scope

- `engine/crates/vaultspec-api/src/lib_tests/a2a_lifecycle.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Prove typed refusal, initial bootstrap, active-receipt mutation, at-cap atomic race rejection, and concurrent cross-operation single-flight using production routes and a real registry

## Scope

- `engine/crates/vaultspec-api/src/lib_tests/a2a_lifecycle.rs`

## Description

- Add the `a2a_lifecycle` acceptance suite exercising the PRODUCTION routes and a
  REAL registry + `vaultspec-product` controller rooted at an isolated product
  home.
- Prove: an uninstalled mutation is a typed refusal (`not_installed`, still
  carrying tiers); the status projection serves the uninstalled bootstrap state;
  a doctor run is admitted and polled to `succeeded` through the real job route.
- Prove the combined gate: with a real active receipt + ownership credentials + a
  fresh OWNED gateway discovery record, a `stop` mutation is ADMITTED (both gates
  hold); with a FOREIGN discovery owner it is refused (`foreign_resident`), the
  attach gate blocking even though the authority gate could pass.
- Prove component single-flight at the route: while the slot is occupied, a
  different-op mutation is refused (`at_capacity`) and an identical op
  de-duplicates (`attached: true`).
- Registry unit tests (in the route module) prove the atomic reserve directly on
  a real registry: de-dup, single-flight ceiling, retention cap, and the
  at-capacity ceiling with nothing evictable.

## Outcome

Nine tests pass (three registry unit + six route acceptance): typed refusal,
bootstrap projection, admitted-and-completed job, the composed owned+ownership
mutation gate (admit when both hold, refuse when the attach gate fails), and
atomic component single-flight / at-capacity.

## Notes

Route-level at-capacity is proven by occupying the single-flight slot via a
`#[cfg(test)]` helper (`testonly_occupy`) because the fully-owned operations
complete too fast to catch a concurrent request mid-flight; the atomic reserve
itself is proven directly on the real `Registry`. Folded-in P02 review items:
SHOULD-FIX 3 (the combined gate) is composed in the route via `guard_mutation`
and proven here; SHOULD-FIX 2 was already satisfied — no public raw-path
`GatewaySpec` constructor exists and the API constructs no spec from a raw path.
