---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S18'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace figma-parity-reconciliation with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S18 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Add conformance tests feeding a captured live sample of both new shapes through the shared client adapter path and ## Scope

- `frontend/src/stores/server/liveAdapters.test.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add conformance tests feeding a captured live sample of both new shapes through the shared client adapter path

## Scope

- `frontend/src/stores/server/liveAdapters.test.ts`

## Description

- Add a conformance test feeding a captured live enriched node-evidence envelope through the shared `unwrapEnvelope` client path and asserting the GUI `NodeEvidence` shape (documents `{ path, doc_type }`, code_locations keyed on `path` with the optional `symbol`, commits with `subject`).
- Add a paired test driving the mock through the `EngineClient.nodeEvidence` path and asserting the same enriched shape, proving the mock mirrors live byte-for-byte (no legacy `target` field, the symbol case present, subjects non-empty).
- Add a conformance test feeding a captured live historical text-diff envelope through `unwrapEnvelope` + `adaptGitOp` and asserting the verbatim two-rev unified diff.
- Add a paired test driving the mock `opsGit("histdiff", { path, from, to })` through the client and asserting the same shape plus the live route's validation (a missing rev 400s, a non-whitelisted verb 403s).

## Outcome

Both new wire shapes are proven byte-for-byte against the shared client adapter path: a captured live sample and the mock both flow through the same `EngineClient` and resolve to the identical consumed shape. The `liveAdapters` suite passes (54 tests) and the mockEngine suite passes (24 tests); eslint is clean across src, tsc reports zero errors in any non-scorecard file, and prettier is clean on every file this phase touched.

## Notes

The full `just dev lint frontend` recipe currently fails ONLY on untracked files under `src/scene/field/scorecard/` — a concurrent W03 executor's incomplete, uncommitted work in a directory this phase is forbidden to touch. Every file this phase authored or modified passes eslint, prettier, and tsc; the foreign scorecard failures are outside this phase's scope and ownership.
