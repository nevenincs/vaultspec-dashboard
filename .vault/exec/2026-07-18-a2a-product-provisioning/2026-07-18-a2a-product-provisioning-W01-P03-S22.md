---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S22'
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
     The S22 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Serve typed lifecycle status, run, and job endpoints with one atomic check-and-reserve admission critical section, capped output, TTL retention, deadlines, and component-scoped single-flight and ## Scope

- `engine/crates/vaultspec-api/src/routes/a2a_lifecycle.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Serve typed lifecycle status, run, and job endpoints with one atomic check-and-reserve admission critical section, capped output, TTL retention, deadlines, and component-scoped single-flight

## Scope

- `engine/crates/vaultspec-api/src/routes/a2a_lifecycle.rs`

## Description

- Implement `a2a_lifecycle.rs`: the `LifecyclePlane` (the `vaultspec-product`
  controller + a bounded job `Registry`), a bounded `LifecycleOpArg` wire enum
  (no free-form path/arg), and the typed status/run/job handlers.
- Serve `GET /a2a/lifecycle/status` as a backend projection (installed, readiness,
  ownership, active generation) over the shared tiers envelope.
- Implement the ONE atomic check-and-reserve admission critical section:
  `Registry::reserve` prunes, de-dups an identical in-flight op, enforces the
  component single-flight ceiling (`MAX_CONCURRENT = 1`), makes room under the
  retention cap, and inserts — all under one lock hold so no race can over-admit.
- Bound everything at creation: retention cap + TTL prune for completed jobs, a
  per-op wall-clock deadline on the background execution, and component-scoped
  single-flight (the identity is the A2A component, not the op label).
- Compose BOTH ownership gates before any mutation through the single
  `guard_mutation` seam (reads the discovery verdict + the ownership capability,
  then `guard_owned_mutation`); a refused mutation returns a typed refusal and
  never admits a job.

## Outcome

The plane serves typed lifecycle status/run/job endpoints; admission is atomic
and component-single-flight; mutations are gated by the composed owned+ownership
check; completed jobs are TTL-pruned and capped. Registry unit tests prove the
atomic reserve (de-dup, single-flight ceiling, retention cap, at-capacity).

## Notes

P03 wires the JOB PLANE; the gateway control effect for the process-lifecycle
operations (start/stop/restart/update/rollback) is applied by the seated
controller in W02.P04, so `apply` runs the operations fully owned by the product
crate today (doctor → readiness; remove → real removal) and reports the
authoritative state for the rest rather than a fabricated success. The discovery
verdict is read from a `gateway-discovery.json` the seated controller will publish
in W02.P04; absent it, a mutation gate honestly refuses (nothing owned+live to
mutate).
