---
tags:
  - '#audit'
  - '#project-provisioning'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:0038ebafd67b452c0d6346f0bfc34297a1f2051f35bdf9bc1dd43a87bc1a0e1d'
related:
  - "[[2026-07-07-project-provisioning-adr]]"
  - "[[2026-09-06-agent-panel-no-legacy-curation-audit]]"
---
# `project-provisioning` audit: `setup receipt amendment review`

## Scope

Formal semantic review of documentation-only amendment commit
`4c373b914c89f41b5e95a4ec28c33df5ea89b9ae` against the accepted
project-provisioning decisions, the current-provider setup amendment, the
Dashboard no-legacy decisions, the actual project-locked Vaultspec Core 0.1.73
producer contract, and the single-home-fact boundary. Runtime and unrelated
concurrent graph/design work were excluded from the review and were not changed.

The review exercised the exact four-child safe sequence on a disposable clean
Git target, repeated that sequence on the now-healthy target, exercised the
force posture, and inspected fresh `spec doctor` and strict provider-manifest
evidence after installation. Structural checking was run on an isolated clean
worktree at the reviewed commit so unrelated dirty work remained outside the
acceptance evidence.

## Findings

### repeat-safe-setup | high | a healthy repeated setup cannot reach complete

Type: state-machine, idempotency, and replay robustness. The clean safe sequence
matched D8a: all four children exited zero with `vaultspec.install.v1`, status
`created`, action `install`, the expected provider set, and non-empty tuple
items. Repeating the same safe setup on the fully healthy target made
`install core` exit one with `vaultspec.error.v1` and an already-installed
message, while the three `--skip core` provider children again returned
`created`. D9a permits only a `created` child to succeed, and D9b says receipt
and postcondition disagreement is indeterminate. A normal second setup must
therefore classify a healthy target as indeterminate rather than complete.
This is not an ambiguous mutation or blind-replay case: fresh doctor and
manifest evidence already prove the requested current state. The amendment
does not define an idempotent already-satisfied receipt or a preflight path, so
its exact sequence cannot implement robust repeated setup.

### unsupported-installed-membership | high | complete can retain unsupported provider state

Type: no-legacy postcondition and closed-world authority. D9b requires each
selected current provider to be present in `.vaultspec/providers.json`, but it
does not require the installed set to equal the current Dashboard-owned set.
It also instructs Dashboard to ignore unrelated producer entries. As written,
an otherwise valid aggregate can report `complete` while an unsupported or
retired provider remains installed in the authoritative manifest. Ignoring an
open-world doctor projection is correct because Dashboard does not own Core's
diagnostic schema; accepting extra installed membership is different because
that membership describes target state. This violates the owner's no-legacy
mandate. Dashboard need not interpret, migrate, or remove the unsupported
entry, but it must fail closed and cannot attest complete while it remains.

### retired-provider-proof-wording | medium | accepted decision retains a named retired-provider capture

Type: architecture-corpus and no-legacy boundary. D8a records a named retired
provider's `not_installed` doctor entry as part of the clean-target proof. That
diagnostic field is unrelated open-world producer metadata and is neither a
Dashboard contract input nor a required success condition. Keeping the named
field in the active accepted decision turns a transient legacy producer detail
into current architectural evidence. The proof should instead state that
unrelated doctor entries were ignored and never exposed. The explicit D8 ban
on aggregate or retired-provider operations remains sufficient fail-closed
policy.

### live-capture-grounding | medium | producer evidence was placed in the ADR without a grounding home

Type: single-home-fact boundary. The amendment says project-locked live
disposable-target captures establish D8a-D9b and records their outcome, but no
related research, reference, or audit document previously carried those
captures. The exact accepted command and validation rules belong in the ADR;
the observed producer output and clean/force/repeat behavior are grounding and
belong in an audit or reference. This audit now records that evidence. A
corrected ADR should cite this audit stem rather than narrating the capture.

### current-clean-and-force-contract | low | current producer sequence otherwise matches the amendment

Type: producer-contract verification. On Vaultspec Core 0.1.73, clean safe and
force executions of the four D8a operations produced the stated install schema,
status, action, target path, provider identities, and tuple-shaped item lists.
Fresh doctor output used `vaultspec.spec.doctor.v1`, status `unchanged`, and a
present framework; current provider entries reported complete directory state,
coherent manifest entries, clean managed content, and `config` `ok`. The strict
2.0 manifest carried a positive serial and the three current installed provider
names. The fixed Dashboard sequence invokes no deprecated aggregate operation
and no retired-provider operation.

### setup-receipt-amendment-disposition | high | FAIL

Type: formal architecture-review disposition. Commit `4c373b91` correctly
binds first-install receipts to the current Core schema and strengthens
postcondition validation, but the two high findings prevent acceptance. No
runtime implementation should use this amendment as closure evidence until a
reviewed correction defines idempotent already-satisfied behavior and a
closed current installed-membership postcondition. The medium corpus findings
should be corrected in the same documentation pass.

## Recommendations

- Amend D8a-D9b with a current, supported idempotency rule that can classify an
  already healthy target as satisfied from authoritative preflight or
  reconciliation evidence without replaying an ambiguous mutation. Define the
  receipt shape and terminal classification explicitly, then test clean,
  repeated-safe, force, partial, timeout, and receipt/postcondition disagreement
  cases against real processes.
- Require aggregate completion to prove that strict manifest installed
  membership is exactly the Dashboard-owned current set. Treat any unsupported
  installed name as a typed fail-closed state; do not translate, expose, remove,
  or otherwise support it.
- Remove the named retired-provider doctor capture from the active amendment.
  State only that unrelated open-world doctor metadata is ignored and never
  exposed.
- Cite `2026-09-06-project-provisioning-setup-receipt-amendment-review-audit`
  as the home of the live producer evidence when correcting the ADR, and keep
  the ADR focused on the chosen contract.
