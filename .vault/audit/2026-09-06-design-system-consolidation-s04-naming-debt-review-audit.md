---
tags:
  - '#audit'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:21936db9c34de530e557ae77556b247d75c76d2e96154af6c5452b4663c2eede'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
  - "[[2026-09-05-design-system-consolidation-adr]]"
  - "[[2026-09-05-design-system-consolidation-horizontal-polish-research]]"
  - "[[2026-09-05-design-system-consolidation-shipped-frontend-blueprint-reference]]"
---

# `design-system-consolidation` audit: `S04 campaign naming-debt review`

## Scope

Reviewed exact Step `W01.P01.S04`: the naming-debt schema and six entries in `consolidation-ledger.ts`, plus their focused contracts in `consolidation-ledger.test.ts`, against the accepted consolidation ADR, horizontal-polish research, shipped blueprint, implementation plan, and accepted Figma naming-contract ADR. Production and scene implementation remained read-only; unrelated graph and scene work stayed outside scope.

The campaign-scoped component-name set is exactly six. `TextField`, `TextArea`, and `OptionRow` are the only planned `app-kit` canonical owners referenced by the completed native-control classification, and the plan gives each an explicit future TSX implementation. `AppErrorBoundary` and `ModalSurface` are the only additional component exports newly named by this campaign's planned shared-chrome implementation. All five absent files are correctly `planned` and use `code-only-name`. `ActivityIndicator` already exists and is the one uncited kit component whose public-barrel exposure is explicitly introduced by this campaign, so its `existing` plus `unresolved-design-alias` classification is truthful.

All six entries use the owning component path and export name with the common semantic slot `component-export-name`; the resulting JSON tuple keys and code names are each unique. Owner layers, paths, names, and statuses agree with the plan and live source. Every `designAlias` is null because this ADR explicitly forbids Figma inspection and the available grounding does not establish an alias. Every disposition is `track-parity-debt` with exactly the required `summary`, `unresolvedBinding`, and `reconciliation` fields; the rationales state the concrete code-side role, the no-Figma limitation, and a separately authorized design-reconciliation path without claiming parity.

S180 remains the before-public-exposure gate for revalidating these planned primitive debts and recording any additional primitive introduced by implementation; it does not justify an ungrounded duplicate or a not-yet-named primitive in S04. S186 remains the introduction-time owner for token names and structures, so no token debt is classified early here. Existing shipped names outside this campaign are likewise not silently expanded into the bounded S04 set.

Independent evidence passed: the focused `consolidation-ledger.test.ts` suite passed 9/9; its exact-set, 5/1 kind split, planned-kit-owner parity, stable-key uniqueness, source/declaration status, null-alias, owner, disposition, and rationale assertions all held. `git diff --check` passed. Full `just lint frontend` exited 0 across ESLint, localization, px, domain, module-size, Prettier, TypeScript, token-drift, and Figma-name gates. The unrelated scene diff fingerprint remained exactly `30817224d9b653c7858a39d9a7458252dbca682f`.

## Findings

### s04-campaign-naming-debt | low | The bounded component-name debt ledger is complete and truthful

No corrective finding surfaced. The six-entry set is fully grounded in campaign-introduced or campaign-exposed component names, distinguishes absent planned exports from the existing uncited export, and records uncertainty rather than inventing a Figma name or alias. The tests meaningfully pin the exact identities and independently couple the three planned kit names to the native-control ledger while enforcing the common runtime schema and rationale contract.

## Recommendations

- At S180, revalidate the three planned kit entries immediately before export and update the existing debt records in place if implementation changes a name; add a new record only for a genuinely newly introduced primitive.
- Keep token naming debt under S186 at token introduction, and retire or replace these component entries only after separately authorized design reconciliation supplies a verified name binding.

Status: PASS.
