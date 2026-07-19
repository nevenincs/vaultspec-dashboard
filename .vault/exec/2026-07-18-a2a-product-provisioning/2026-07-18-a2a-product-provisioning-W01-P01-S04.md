---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S04'
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
     The S04 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Define the dashboard-owned complete release-set schema binding the dashboard build to the pinned A2A component manifest, runtime inputs, protocols, state schemas, digests, licenses, and SBOM and ## Scope

- `schemas/release-set-manifest.json` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Define the dashboard-owned complete release-set schema binding the dashboard build to the pinned A2A component manifest, runtime inputs, protocols, state schemas, digests, licenses, and SBOM

## Scope

- `schemas/release-set-manifest.json`

## Description

- Authored `schemas/release-set-manifest.json` (JSON Schema draft 2020-12): the
  dashboard-owned complete release-set contract for one target.
- Bound every ADR-required facet: `target` (five-triple enum), `dashboard` build
  (version/commit/digest), `a2a_component` (commit + release identity + references to
  the `S03` component lock and the A2A capsule manifest + emitted capsule digest),
  `runtimes` (cpython/node/acp, each exact version + license + digest), `protocol`
  (gateway API version range), `state_schema` (migration range), `licenses` (SPDX per
  component), and `sbom` (format/path/digest); optional `file_digests` table.
- Enforced no-floating pins through shared `$defs`: `GitCommit` (40-hex), `Sha256`
  (64-hex), `ExactVersion` (no range operator/wildcard/`latest`), `digest_algorithm`
  const sha256.

## Outcome

The release-set schema binds the dashboard build to the pinned A2A component and runtime
inputs with exact, digest-verifiable identities, and references the `S03` lock + the A2A
capsule manifest as the authoritative producer contracts. Verified: valid JSON, all eight
ADR-required top-level bindings present and required, runtimes cover cpython/node/acp, and
the exact-pin `$defs` reject a branch/tag commit, a non-64-hex digest, or a ranged version.
The `vaultspec-product` parser (`S06`) will consume this schema to reject unpinned
identity, target mismatch, or digest drift.

## Notes

Authored ahead of the `S06` parser (plan order), so the schema is grounded in the accepted
ADR's release-set-manifest binding clause; `S06` formalizes consumption and rejection.

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
