---
tags:
  - '#exec'
  - '#feature-group-authoring'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S08'
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
     The S08 and 2026-07-14-feature-group-authoring-plan placeholders are machine-filled by
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
     The Rework the create-doc chrome store to the staged feature-first shape (feature stage, document stage, eligibility-aware type choice, editable related pre-fill derived from served coverage) with unit tests and ## Scope

- `frontend/src/stores/view/createDocChrome.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Rework the create-doc chrome store to the staged feature-first shape (feature stage, document stage, eligibility-aware type choice, editable related pre-fill derived from served coverage) with unit tests

## Scope

- `frontend/src/stores/view/createDocChrome.ts`

## Description

- Rework the chrome store to the staged shape: add `stage` (`feature`/`document`) with `goToDocumentStage`/`goToFeatureStage` back-and-continue transitions that clear any stale stage error, and an editable `related` string list with its own bounded normalizer and setter.
- Redefine the offered types as the pipeline order minus `exec` (`research`, `reference`, `adr`, `plan`, `audit`), removing the bare-exec offer per the ADR (a removed non-capability, not a disabled lie).
- Add the pure coverage-derived helpers the panel composes: `deriveOfferedCreateDocTypes` (offered rows with served eligibility/reason), `isCreateDocTypeEligible` and `reconcileCreateDocType` (revalidate a selection against served eligibility, resetting an ineligible type to the advised next step then first-eligible), and `seedRelatedFromCoverage` (the deterministic cross-link pre-fill: adr from newest research + reference, plan from newest adr, audit from newest plan; entry points seed none).
- Extend `deriveCreateDocSubmission` and the submission type to carry the normalized `related` list.
- Keep the one-shot `focusFeatureField` behaviour and the existing exported open/setter surface; add stage + related setters and expose `setCreateDocRelated`, `goToCreateDocDocumentStage`, `goToCreateDocFeatureStage`, `setCreateDocStage`.
- Rewrite the store unit tests to the staged shape and add coverage-derivation tests (offered set excludes exec, entry-point fallback with absent coverage, served-eligibility reads, reconciliation, and D5 seeding).

## Outcome

- The store holds raw draft state (stage, feature, docType, title, related, error, focus) with derivation kept in pure helpers the panel feeds back through setters, so the store stays wire-free and selector-law-clean.
- Eligibility and link-target stems are read from served coverage, never recomputed; an ineligible selection resets honestly and the pre-fill is seeded deterministically and remains editable.

## Notes

- The offered set now includes `audit` and `reference` (both always eligible / advisory), so the current dialog component and its render tests, which enumerate the prior option set, will disagree until the P04/P05 rework; per the task contract those app-layer files were left untouched and are flagged for P04/P05.
- The coverage-derived helpers import the `FeatureCoverage` type only (a type import from the server engine barrel), keeping the view layer free of any wire fetch.
