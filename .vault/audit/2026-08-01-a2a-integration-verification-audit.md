---
tags:
  - '#audit'
  - '#a2a-integration-verification'
date: '2026-08-01'
modified: '2026-08-02'
body_schema: 'body-v1'
body_hash: 'sha256:63c526a2646fb476cfd4e11f98d70128fad5c67407c3b10519e0d257ea1aae38'
related:
  - "[[2026-07-31-a2a-integration-verification-plan]]"
---
# `a2a-integration-verification` audit: `W01.P01.S02` closure evidence

## Scope

This audit reviewed the `W01.P01.S02` execution record and its corresponding
plan completion marker. The review was limited to whether the recorded no-code
closure is supported by the earlier model-resolution evidence and whether both
Vault artifacts carry valid body attestations; it did not review or modify A2A
source code, and it does not assess the unstarted `W01.P01.S03` regression lock.

## Findings

### deterministic-terminal-reconciliation | high | The S05 completion bundle is not approvable

Manual inspection of the terminal bundle
`w01-p02-s05-deterministic-research-adr:deterministic-completion-86bb85a9391b4eb5b911df58eda83d18`
confirmed matching run identity, five manifest-backed artifacts, and materialized
research and ADR outputs. Its terminal snapshot nevertheless reports
`execution_readiness: needs_reconciliation`, `repair_status: needs_reconciliation`,
`snapshot_complete: false`, and the degraded reason
`terminal_thread_pending_permission_residue`.

The approved integration ADR makes a fully reconciled, manually approved artifact
a completion condition. A terminal `completed` status alone is therefore
insufficient. This finding rejects the proposed `W01.P02.S31` approval and blocks
downstream completion claims until the production terminal snapshot is reconciled,
the deterministic scenario is rerun, and a fresh bundle receives a manual approving
sign-off.

Status: remediated on 2026-08-02 by A2A revisions `a8426964` and `4a322775`,
which settle all durable approval metadata during verdict and terminal
transitions. The rejected bundle remains preserved as historical evidence.

### body-attestation | medium | The S02 execution record carries a stale body hash

`vaultspec-core vault check all` reports that the body of the uncommitted
`W01.P01.S02` execution record no longer matches its attested fingerprint. The
plan checkbox change is internally attested, but the execution record must be
re-attested before it can serve as accepted closure evidence for this Step.

Remediated on 2026-08-01: the feature-scoped frontmatter fixer reconciled the
execution record's body attestation, and the focused frontmatter check now
reports the feature clean. The finding remains here as the historical review
record; its required correction is complete.

## Recommendations

Accept the `W01.P01.S02` closure artifacts once the focused frontmatter,
annotation, and required-body-section checks remain clean and plan validation
confirms the completed Step maps to its execution record. Keep `W01.P01.S03`
open: the no-code conclusion in S02 does not replace its required regression
lock or deliberate-fault red proof.

## Manual sign-off: `W01.P02.S31`

- Reviewer: Codex, with independent Sol-medium code reviews of the lifecycle
  remediation and the S05 health guard.
- Artifact identity:
  `w01-p02-s05-deterministic-research-adr:deterministic-completion-c0e019c275e241c4991bcca2c6047316`.
- Scenario identity: `w01-p02-s05-deterministic-research-adr`.
- Run identity: `deterministic-completion-c0e019c275e241c4991bcca2c6047316`.
- Disposition: **approved**.
- Reason: all five artifact SHA-256 values independently match the manifest;
  the terminal result is `completed` with healthy repair/readiness and no
  degraded reasons; the recovered history reports `snapshot_complete: true`,
  healthy repair/readiness, and no degraded reasons; the bundle contains the
  exact scripted output and the materialized research and ADR. The real run
  used a fresh current-engine service record and was shut down through its own
  authenticated endpoint after collection.
