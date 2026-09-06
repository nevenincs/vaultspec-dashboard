---
tags:
  - '#audit'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:c2e4dad24e2afc9107bef2113fe794ee1f363d8550de97778a16c45848199369'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
  - "[[2026-09-05-design-system-consolidation-adr]]"
---

# `design-system-consolidation` audit: `S180 public primitive naming-debt review`

## Scope

Reviewed exact plan step `W02.P03.S180`: only the changed naming-debt
rationales for `TextField`, `TextArea`, and `ActivityIndicator` in
`consolidation-ledger.ts`. The review compared them with the accepted narrowed
ADR, plan, horizontal-polish research, shipped-frontend reference, the settled
S04 naming-debt audit, and the live naming-debt and scanner checks. Production
components, public exports, consumer migrations, and deferred component debts
remained outside this step.

## Findings

### public-primitive-naming-debt | low | Exposure exceptions remain explicit and truthful

No corrective finding surfaced. The three records retain their stable
`component-export-name` identities, null design aliases, existing `app-kit`
owners, and `track-parity-debt` dispositions. `TextField` and `TextArea` remain
`code-only-name`; `ActivityIndicator` remains `unresolved-design-alias`. Their
updated summaries truthfully state that the component contracts now exist and
have focused verification, while their reconciliation text makes S21 public
exposure conditional on the explicit temporary exception rather than implying a
verified Figma binding. Each record still requires separately authorized design
reconciliation to confirm, rename, cite, or retire the debt.

The diff does not alter the deferred `OptionRow`, `AppErrorBoundary`, or
`ModalSurface` records and adds no new debt family. Independent verification
passed: focused ledger Vitest 13/13, production scanner clean at 127 native
controls with the scene guard enabled, and focused diff check clean. Executor
evidence also records typecheck and full `just lint frontend` at exit zero.

### public-primitive-naming-recheck | low | Ledger summaries now stand independently of plan numbering

The pre-commit wording refinement is resolved and introduces no new finding.
All three summaries now describe the existing, contract-tested exports as queued
for kit or public-boundary exposure without embedding a plan-step identifier in
the durable ledger. Their exception and reconciliation language is unchanged in
substance, no classification or owner field moved, and the deferred records remain
untouched. The final focused diff check is clean; executor recheck evidence records
ledger Vitest 13/13, the production scanner clean at 127, Prettier clean, and full
`just lint frontend` at exit zero.

## Recommendations

No S180 correction is required. S21 may expose the three existing components
through the canonical kit boundary while these naming debts remain active; they
must not be presented as Figma-verified names until separate reconciliation.

Status: PASS.
