---
tags:
  - '#audit'
  - '#project-provisioning'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:53407172e18cd63f18343ba89559a18bec4f315ccf25acfc6ee6a0d392d6c1a0'
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

## 2026-09-06 re-review of idempotent-preflight correction

Review target: `794b701b4be49ec9156bee8719aa01b0782c3077`, parent
`a062b935`. This re-review tested the corrected D8b/D9c contract against live
Vaultspec Core 0.1.73 healthy and partial targets and reconciled each finding
from the first review. Runtime and unrelated concurrent work remained outside
the review.

### healthy-dry-run-preflight | low | verified

Type: producer-contract and idempotency evidence. On a fully healthy target,
all four fixed previews exited zero with `vaultspec.install.v1`, status
`unchanged`, action `dry_run`, the exact target, non-empty exact two-string
item tuples, and no missing producer-declared paths. Doctor and the strict
manifest met the D9b/D9c current-state requirements. Four Dashboard-local
`reconciled_existing` receipts are accurately distinguished from Core install
receipts, so the correction closes the original repeated-healthy-target case
without accepting Core's already-installed error as success.

### partial-current-target-convergence | high | all-or-nothing preflight still falls into the blocked core mutation

Type: state-machine, partial-state recovery, and replay robustness. D8b emits
`reconciled_existing` only when the entire four-ordinal preflight is already
healthy. Any valid partial current target therefore falls through wholesale to
D8a. A live core-only target proved the defect: the core preview was unchanged
with zero missing paths; the three provider previews identified their missing
paths; fallback `install core` then exited one with
`vaultspec.error.v1` already-installed; and the three additive installs exited
zero and produced a final healthy doctor/manifest state. D9a/b still require
the core receipt and postcondition to agree, so that successful convergence is
classified indeterminate. The same failure shape applies when one or several
provider ordinals are missing from an otherwise valid current target. This
leaves the original high-severity robustness defect open for partial state.

### unsupported-membership-preflight-order | high | extra membership is not unambiguously terminal before mutation

Type: no-legacy state machine and contract conflict. D9c correctly defines
exact manifest equality and says extra or unsupported membership fails closed,
but D8b says every preflight that does not prove the entire current state
follows D8a. Read literally, a manifest with extra membership can therefore
enter the mutating sequence before the aggregate later refuses completion.
That conflicts with the no-legacy requirement: unsupported membership must
produce a terminal typed contract disagreement before any child mutation.
Failing completion after current-provider writes is insufficient and needlessly
alters a target that setup has already declared outside its closed world.

### no-retired-provider-retention | low | verified

Type: no-legacy architecture corpus. The correction removes the named retired
provider diagnostic capture from active decision evidence. It keeps the fixed
current command set, consumes no deprecated aggregate or retired-provider
operation, discards unrelated doctor fields without naming, interpreting,
storing, or returning them, and defines exact current manifest equality. The
accepted rejection clauses remain fail-closed policy rather than a
compatibility surface.

### evidence-home-citation | low | verified

Type: single-home-fact boundary. The correction identifies
`2026-09-06-project-provisioning-setup-receipt-amendment-review-audit` as the
home for live clean, force, repeated, and dry-run evidence, while the ADR keeps
the chosen command and validation rules. The audit already relates to the ADR
and the project-provisioning feature index links both artifacts, so the
correction does not fork the observed evidence into a second lifecycle home.

### idempotent-preflight-correction-disposition | high | FAIL

Type: formal architecture-review disposition. Commit `794b701b` closes the
fully healthy repeat, exact membership, named retired-provider evidence, and
grounding-home findings, but it does not converge supported partial current
states and does not make unsupported extra membership terminal before any
mutation. Those two high findings prevent the ADR from authorizing runtime
closure.

## Re-review recommendations

- Make preflight authoritative per ordinal. Emit `reconciled_existing` for each
  already-valid current component and execute only missing current ordinals.
  A core-only, one-provider-missing, or multiple-providers-missing target must
  converge without spawning an already-valid core install and without
  accepting an already-installed error.
- Make unsupported manifest membership a terminal typed preflight result before
  any mutation. Do not translate, remove, expose, or otherwise support the
  unsupported entry.
- Require live real-process proof for healthy repeat, core-only, each
  single-provider-missing case, multiple-provider-missing state, unsupported
  extra membership with zero child mutations, clean install, force install,
  timeout, and receipt/postcondition disagreement.
