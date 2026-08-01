---
tags:
  - '#research'
  - '#a2a-integration-verification'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:be3f74b4677f02bae0834bd0ae82f8974055e87d15e0dc9d6ffb7f56c7017339'
related:
  - "[[2026-07-31-a2a-integration-verification-adr]]"
  - "[[2026-07-31-a2a-integration-verification-verification-surface-inventory-reference]]"
  - "[[2026-07-31-a2a-integration-verification-W01-P02-S04]]"
---

# `a2a-integration-verification` research: `deterministic completion review`

The question is whether the in-process deterministic provider can be the permanent
completion substrate and whether completion must include manual review of the emitted
artifact. The evidence favors that substrate: it preserves the real provider factory
and worker chain without the tape backend's container and skip paths. A terminal run
alone still cannot establish that the authored artifact is acceptable. The accepted
ADR needs an explicit amendment before implementation: make the deterministic provider
permanent rather than preferred pending fleet evidence, and define successful
completion as both automated chain proof and recorded manual artifact review.

## Findings

### The in-process deterministic provider closes the permanent-substrate gap

The accepted boundary is model-only determinism through the production provider
factory; protocol injection, worker substitution, and fake transport are forbidden
(`.vault/adr/2026-07-31-a2a-integration-verification-adr.md:117-127`,
`.vault/adr/2026-07-31-a2a-integration-verification-adr.md:149-156`). The in-process
provider meets that boundary without credentials, a container, or a separate service,
and returns role-keyed content usable by writers and the reviewer
(`.vault/adr/2026-07-31-a2a-integration-verification-adr.md:73-83`).

The tape-backed alternative is unsuitable as the permanent completion substrate. Its
current proof is absent from CI, can exit zero after skipping when the endpoint is
unreachable, and is not covered by the declared Docker-prerequisite enforcement
(`.vault/exec/2026-07-31-a2a-integration-verification/2026-07-31-a2a-integration-verification-W01-P02-S04.md:37-73`). It remains useful as secondary scenario coverage where its existing tapes add breadth, but it cannot supply an always-executed completion floor.

### Manual artifact review is a separate completion obligation

The first manual cold run demonstrated why terminal state and transport evidence are
insufficient: it proved admission, identity, lease, and failure propagation, while
proving no streamed frame, tool call, permission decision, stop, retry, or consuming
surface (`.vault/reference/2026-07-31-a2a-integration-verification-verification-surface-inventory-reference.md:62-81`). The ADR already requires exact scripted-content assertions and rejects connection or non-empty-transcript evidence as sole capability proof
(`.vault/adr/2026-07-31-a2a-integration-verification-adr.md:117-124`).

Manual review adds a different check: a reviewer inspects the emitted artifact rather
than inferring artifact acceptability from a completed run. Treating that inspection as
mandatory is the owner's supplied constraint; the sources establish the gap it closes,
not the review rubric. The ADR must define the review evidence, minimum artifact set,
reviewer action, and failure disposition so implementation cannot satisfy the gate with
an unrecorded visual glance.

### The ADR must turn two provisional boundaries into explicit decisions

The accepted ADR currently says the deterministic provider is only preferred where it
covers the scenario and leaves portability to fleet evidence
(`.vault/adr/2026-07-31-a2a-integration-verification-adr.md:149-156`). S04 later showed
that fleet-wide tape-stack portability remains undecided, while also showing the tape
proof is not required to execute
(`.vault/exec/2026-07-31-a2a-integration-verification/2026-07-31-a2a-integration-verification-W01-P02-S04.md:75-80`). The amendment must settle the deterministic provider as the permanent completion substrate and manual artifact review as a required completion gate. This research does not choose their detailed contracts.

Not investigated: provider implementation internals, the artifact-review rubric, UI
presentation of review evidence, or changes outside the cited integration records.

## Sources

- `.vault/adr/2026-07-31-a2a-integration-verification-adr.md:73-83`
- `.vault/adr/2026-07-31-a2a-integration-verification-adr.md:117-127`
- `.vault/adr/2026-07-31-a2a-integration-verification-adr.md:149-156`
- `.vault/exec/2026-07-31-a2a-integration-verification/2026-07-31-a2a-integration-verification-W01-P02-S04.md:37-80`
- `.vault/reference/2026-07-31-a2a-integration-verification-verification-surface-inventory-reference.md:62-81`
