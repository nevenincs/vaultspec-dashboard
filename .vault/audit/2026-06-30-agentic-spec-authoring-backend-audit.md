---
tags:
  - '#audit'
  - '#agentic-spec-authoring-backend'
date: '2026-06-30'
modified: '2026-07-02'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# `agentic-spec-authoring-backend` audit: `W01 P01 authoring route shell review`

## Scope

W01.P01 authoring route shell implementation in `vaultspec-api`: the new
`authoring` module, `/authoring/status` route registration, API prefix gating,
route inventory, and route-shell tests.

## Findings

### w01-p01-route-shell | low | resolved residual route-negative coverage

The W01.P01 reviewer found no defects in the route shell and confirmed the shell
was bearer-gated, tiered, and compliant with the read-and-infer boundary. The
reviewer noted residual negative coverage for unknown `/authoring/*` paths and
unsupported methods. Those cases were added to the route tests and verified.

### w01-p02-typed-error-helper | medium | resolved canonical typed error delegation

The W01.P02 reviewer found that `typed_error` hand-built a JSON error body
instead of delegating to the canonical typed error helper. The helper now calls
`routes::api_error_kind`, preserving the established error shape.

### w01-p02-core-route-ownership-wording | medium | resolved misleading core route field

The W01.P02 reviewer found that the disabled authoring status field
`core_routes_exposed` could be read as claiming `/ops/core/*` does not exist
globally. The field now reports `core_routes_are_authoring_contract: false`,
which states the intended product boundary without denying the existing ops
proxy.

### w01-p02-provisional-public-api | low | resolved public crate exposure

The W01.P02 reviewer found that provisional authoring helpers were exposed as a
public crate module before the typed model and DTO phases. The crate root now
keeps the `authoring` module private, and the child modules are crate-private.
The response helper functions remain inside that private namespace for later
phases.

### w01-p03-aggregate-vocabulary | medium | resolved missing aggregate and interrupt identifiers

The W01.P03 sidecar review found that the typed identifier vocabulary omitted
`ChangesetId` and `InterruptId`, even though the accepted ledger and LangGraph
ADRs require stable changeset identity and interrupt-keyed resume decisions. The
model now includes both identifiers alongside proposal, approval, lease, receipt,
idempotency, revision, tool-call, and LangGraph refs.

### w01-p03-review-command-vocabulary | medium | resolved review edit vocabulary mismatch

The W01.P03 sidecar review found that `RequestChanges` did not match the
accepted approve, reject, edit, and respond review vocabulary. The model now uses
`EditProposal` for the command and `Edit` for the review decision, preserving the
ADR distinction between a reviewer edit and a clarification response.

### w01-p03-document-identity | medium | resolved provisional collision status gap

The W01.P03 sidecar review found that provisional create document refs lacked
the collision status required by the document identity ADR. `DocumentRef` now
carries `ProvisionalCollisionStatus` for provisional creates.

### w01-p03-command-surface | medium | resolved proposal cancellation and stream wording gaps

The formal W01.P03 review found that `cancelled` changesets had no semantic
proposal cancellation command and noted earlier event-publish wording that read
like internal outbox vocabulary. The command vocabulary now includes
`CancelProposal` and uses stream-oriented `SubscribeEvents` and
`RecoverEventStream` command names.

### w01-p03-status-prechecks | medium | resolved status-only eligibility overclaim

The formal W01.P03 review found that status-only helpers could be mistaken for
full review or apply eligibility, which later phases must compute from policy,
approval freshness, validation, actor authorization, and base-revision checks.
The model now exposes status candidate predicates and blocker-style status
prechecks. Approved changesets have no apply status-level blocker, but the model
does not return full `RequestApply` eligibility from status alone.

### w01-p03-follow-up-review | low | clean follow-up after status precheck fix

The W01.P03 follow-up reviewer confirmed the medium and low status-helper
findings were resolved and found no new blockers. Residual risk is the expected
later implementation work for full review and apply eligibility checks.

### w01-p04-multi-target-dto-contract | medium | resolved single-document proposal contract

The W01.P04 reviewer found that proposal, apply, and rollback DTO fixtures were
too single-document shaped for the accepted multi-document changeset, apply,
concurrency, and rollback ADRs. The V1 DTO fixtures now model proposal child
operations, per-target base and current revision fences, per-child apply
expectations, and explicit rollback source children.

### w01-p04-nested-unknown-fields | medium | resolved nested wire strictness gaps

The W01.P04 reviewer found that nested authoring wire objects could silently
accept unknown fields. The model now denies unknown fields for actor,
document-ref, receipt, LangGraph, and action-eligibility structures, and the API
DTO layer denies unknown fields for aggregate refs. Regression tests cover
unknown actor, LangGraph, document-ref, and aggregate fields.

### w01-p04-document-aggregate-identity | low | resolved document response identity loss

The W01.P04 reviewer found that the document response fixture mapped document
snapshots to a changeset aggregate, losing the structured document identity used
by snapshot routes. The API DTO fixtures now include a document aggregate
variant and the document response fixture preserves the reviewed document ref.

### w01-p04-follow-up-review | low | clean follow-up after DTO fixture fixes

The W01.P04 follow-up reviewer confirmed the multi-target DTO fixtures,
strict aggregate unknown-field handling, document aggregate identity, and
DTO-only phase boundary. No blockers remained after the aggregate strictness
fix.

### w02-p05-product-state-location | high | resolved authoring store cache placement

The W02.P05 reviewer found that the initial authoring database path used the
engine cache directory, which is documented as re-derivable. That conflicted
with the accepted authoring state-store ADR because proposals, approvals,
preimages, and audit records are product data. The store path now resolves to a
dedicated authoring product-state directory under `.vault/data/authoring-state`.

### w02-p05-migration-metadata-integrity | medium | resolved corrupt duplicate metadata acceptance

The W02.P05 reviewer found that a corrupted migration table shape with duplicate
rows could satisfy the original migration validation. Migration metadata
validation now rejects row-count mismatches, and a real SQLite test covers a
duplicate version row under a corrupt table shape.

### w02-p05-real-migration-ordering-test | medium | resolved helper-only ordering coverage

The W02.P05 reviewer found that the migration-ordering test only called a
private validation helper and did not prove database behavior. The test now
opens a real SQLite file, runs the migration runner with an invalid migration
list, and verifies no authoring tables were created.

### w02-p05-follow-up-review | low | clean follow-up after store binding fixes

The W02.P05 follow-up reviewer confirmed that the product-state location,
migration metadata integrity, and real migration-ordering coverage findings
were resolved. No blockers remained.

### w02-p06-unit-of-work-review | low | clean transaction boundary review

The W02.P06 reviewer found no blockers. The implementation rejects read-only
commands before opening a transaction, uses checked SQLite transactions for
product command work, commits only on successful closure return, rolls back
domain and SQLite errors, and keeps multiple repository adapters scoped to one
transaction. The review also confirmed the phase did not add idempotency,
outbox, changeset, approval, or apply domain tables.

### w02-p07-expired-conflict-ordering | high | resolved expired row conflict precedence

The W02.P07 reviewer found that `lookup_replay` classified scope or request
digest mismatches as conflicts before checking whether the existing row had
expired. Expired in-flight or recorded rows with a changed scope or request
could therefore block a fresh reservation. The repository now checks expiry
before conflict detection, and regressions cover expired recorded and expired
in-flight rows with changed scope and request digests.

### w02-p07-follow-up-review | low | clean follow-up after idempotency expiry fix

The W02.P07 follow-up reviewer confirmed that the high expiry/conflict finding
was resolved. The follow-up found no remaining blockers and confirmed the phase
stayed within the scoped idempotency repository boundary.

### w02-p08-rollback-limitation-upsert | high | resolved rollback limitation refresh overwrite

The W02.P08 reviewer found that a later retention metadata upsert could overwrite
a compacted rollback preimage limitation and make rollback appear available
again. The upsert conflict path now preserves compacted payload metadata and
preserves `rollback_available=false` plus its reason once recorded. A real store
regression covers rollback limitation survival across a later metadata refresh.

### w02-p08-backup-optional-omission | medium | resolved silent optional artifact omission

The W02.P08 reviewer found that backup exports silently omitted optional
generation artifacts even though the manifest shape carried inclusion and
omission fields. Backup exports now build a manifest over all retention records:
required product records are included, while optional generation artifacts are
represented with `included=false` and an explicit omission reason.

### w02-p08-follow-up-review | low | clean follow-up after retention fixes

The W02.P08 follow-up reviewer confirmed that the high rollback limitation
finding and medium backup omission finding were resolved. No blockers remained.

### w02-p09-concurrent-dedupe-replay | medium | resolved raw unique error on racing duplicate append

The W02.P09 reviewer found that a racing duplicate outbox append could miss the
pre-insert replay lookup and surface a raw SQLite unique constraint error
instead of returning the existing event or a structured conflict. The append
path now uses a targeted `ON CONFLICT(dedupe_key) DO NOTHING`, then replays and
compares the stored event when the insert affects zero rows. A real concurrent
SQLite test covers two store handles appending the same dedupe key.

### w02-p09-sequence-no-reuse-coverage | low | resolved high-water coverage after event removal

The W02.P09 reviewer found that sequence high-water behavior was not tested
after outbox rows are removed by a future compaction or retention path. A real
SQLite test now deletes an event row, verifies `latest_seq` still reports the
prior high-water mark, and confirms the next append receives the next sequence
instead of reusing the deleted row identity.

### w02-p09-lease-expiry-publication | low | resolved expired claim publish ambiguity

The W02.P09 reviewer noted that `mark_published` guarded claim identity but did
not make lease expiry semantics explicit. Publication now requires the stored
lease expiry to be greater than the publish timestamp, and a real SQLite test
proves an expired claim is stale until recovered and reclaimed.

### w02-p09-follow-up-review | low | clean follow-up after outbox fixes

The W02.P09 follow-up reviewer confirmed that concurrent duplicate replay,
sequence no-reuse coverage, and expired-claim publication semantics were
resolved. The reviewer also confirmed the phase boundary stayed limited to the
outbox primitive, with no authoring stream route, LangGraph adapter, publisher
thread, frontend projection, token stream, or proposal/session/apply domain
tables added.

### w03-p10-capped-identity-lookup | high | resolved listing cap leaking into identity resolution

The W03.P10 reviewer found that stem resolution and collision checks reused the
bounded listing catalog, so documents or duplicate stems beyond the listing cap
could be missed. The resolver now separates listing discovery from identity
lookup. `StemScan` walks the full worktree or ref namespace, retains only the
minimum matching candidates needed to prove uniqueness or ambiguity, and records
the total match count. Regression tests cover resolution, collision detection,
and duplicate-stem ambiguity beyond the listing cap.

### w03-p10-proposed-stem-validation | medium | resolved non-canonical rename and create stems

The W03.P10 reviewer found that proposed stems such as `taken.md`,
`adr/taken`, and `./taken` could bypass collision lookup and produce unstable
`doc:<stem>` identities. Provisional create and rename paths now normalize
proposed stems before building document refs, rejecting extension-suffixed,
path-shaped, whitespace, and unsafe values. Regression tests cover invalid
proposed stems for both create and rename.

### w03-p10-canonical-exact-paths | low | resolved silent exact-path normalization

The W03.P10 reviewer found that exact path lookup silently normalized
non-canonical inputs such as leading slash, trailing slash, backslash, and dot
segments. Exact path lookup now rejects those forms with `InvalidPath` before
reading bytes. Regression tests cover the rejected non-canonical path forms.

### w03-p10-follow-up-review | low | clean follow-up after resolver fixes

The W03.P10 follow-up reviewer confirmed that capped listings no longer drive
stem resolution or collision checks, proposed stems are normalized before
document refs are built, and exact paths reject non-canonical forms. No findings
remained. The reviewer noted residual ref-scope beyond-cap coverage risk, but
did not classify it as blocking because the ref scanner follows the same
uncapped scan shape as the covered worktree path.

### w03-p11-preimage-identity-integrity | medium | resolved preimage document-ref mismatch recovery

The W03.P11 reviewer found that recovered preimages verified payload hashes but
did not verify that stored `document_ref_json` matched the denormalized document
id, path, and base-revision columns. A corrupted store record could therefore
reconstruct rollback material for the wrong document while still passing payload
integrity. Preimage recovery now rejects non-existing document refs, mismatched
document id/path/base revision, and negative capture timestamps. A regression
tampering only `document_ref_json` now fails with a snapshot identity mismatch.

### w03-p11-follow-up-review | low | clean follow-up after snapshot integrity fix

The W03.P11 follow-up review found the phase aligned with the rewritten
walking-skeleton scope: full-document revision metadata, target snapshots,
preimage capture, hash verification, restart recovery, and rollback recovery
payloads are implemented without adding chunks, section edits, operation modes,
LangGraph, streams, leases, multiagent composition, or per-operation rollback
inverses. Focused and authoring-wide tests passed after the identity-integrity
fix.

### w03-p13-required-preimage | high | resolved missing rollback material on body replacement previews

The W03.P13 reviewer found that whole-document `replace_body` preview
materialization allowed a missing preimage even though the Increment 1 rollback
contract requires body-changing proposals to carry exact rollback material. The
materializer now requires a `PreimageRecord`, serializes a non-optional
preimage reference, and validates the preimage against the base snapshot before
review material can be built. Regression tests cover the required preimage path.

### w03-p13-preimage-changeset-binding | medium | resolved cross-changeset preimage attachment

The W03.P13 reviewer found that a content-matching preimage from another
changeset could be attached to the operation preview because validation did not
check the preimage's containing changeset. The materializer now takes the
changeset id and rejects preimages whose changeset, child key, document,
revision, payload, or recovery identity do not match the operation being
materialized. Regression tests cover cross-changeset and malformed preimage
identity rejection.

### w03-p13-diff-hunk-precision | medium | resolved non-contiguous changes collapsing into one noisy hunk

The W03.P13 reviewer found that the initial diff projection collapsed all lines
between the first and last difference into one hunk, so unchanged interior lines
could be rendered as add/remove noise. The review diff builder now emits
line-level hunks from a bounded LCS projection, and regression tests cover
non-contiguous changes producing separate hunks.

### w03-p13-review-diff-bounds | medium | resolved unbounded review diff strings

The W03.P13 follow-up reviewer found that line-count capping alone still allowed
huge changed lines to produce unbounded review diff strings. Review diffs now
carry explicit line and byte caps, preserve only bounded line material in hunks,
and emit truncation metadata while leaving the full target snapshot as the
authoritative apply input. Regression tests cover both line-cap and byte-cap
truncation.

### w03-p13-follow-up-review | low | clean follow-up after operation preview fixes

The final W03.P13 follow-up review found no blockers. It confirmed required
preimage rollback material, changeset-bound preimage validation, malformed
preimage identity rejection, separate non-contiguous hunks, and line plus byte
review-diff truncation. Focused operation tests, authoring-wide tests, and
clippy passed after the fixes.

### w03-p14-digest-material-binding | high | resolved validation digest under-binding

The W03.P14 reviewer found that validation digests initially omitted reviewed
diff material and preimage metadata, so misleading review diff content or
changed rollback metadata could preserve the same digest. Validation material
digests now bind the normalized review diff and preimage reference metadata, and
validation integrity checks reject preimage metadata that no longer matches the
reviewed base material. Regression tests cover reviewed-diff digest changes and
preimage metadata mismatch.

### w03-p14-latest-record-ordering | high | resolved timestamp-tie latest validation ambiguity

The W03.P14 reviewer found that `latest_for_changeset` ordered validation rows
by timestamp and lexical digest, so tied millisecond timestamps could return an
older approval-ready record instead of a newer stale or invalid record. The
validation store now has a monotonic `seq` column and latest lookup orders by
`seq DESC`. A regression stores approval-ready and stale validation records with
the same timestamp and verifies the stale record is latest.

### w03-p14-chunk-evidence-binding | medium | resolved current chunk evidence identity gap

The W03.P14 reviewer found that present chunk evidence was neither checked
against the operation document and base revision nor included in the validation
digest unless it produced a finding. Validation now rejects mismatched chunk
evidence as stale, includes normalized chunk evidence in the digest input, and
tests that current evidence changes alter the validation digest.

### w03-p14-frontmatter-parser | medium | resolved malformed YAML approval-readiness gap

The W03.P14 reviewer found that structural frontmatter checks could allow
malformed YAML to become approval-ready. Validation now parses the frontmatter
block as YAML after bounded structural checks and records malformed YAML as a
blocking invalid-frontmatter finding. Regression tests cover an unterminated
flow sequence becoming invalid and not approval-ready.

### w03-p14-yaml-parser-dependency | low | accepted temporary deprecated parser dependency

The W03.P14 follow-up reviewer found no remaining high or critical findings, but
noted that `serde_yaml` is deprecated and brings `unsafe-libyaml` into the API
crate. The use is narrow and solves the malformed-frontmatter blocker for this
phase, so it is accepted as a temporary validation dependency until the later
core conformance adapter becomes the authoritative metadata validation surface.

### w03-p14-follow-up-review | low | clean follow-up after validation fixes

The W03.P14 follow-up review confirmed the high digest-binding and latest-record
ordering findings were resolved, and confirmed the medium chunk-evidence and
malformed-frontmatter findings were resolved. Focused validation tests,
authoring-wide tests, store tests, and clippy passed after the fixes.

### w03-p15-child-key-normalization | medium | resolved whitespace-distinct child identities

The W03.P15 reviewer found that child duplicate rejection compared exact strings
after only rejecting empty trimmed values, so `child_1` and `child_1 ` could
be accepted as different child identities. Ledger child keys now use the shared
authoring token policy before duplicate detection and again during store
validation. Regression coverage rejects surrounding whitespace.

### w03-p15-ledger-column-split-brain | medium | resolved normalized-column and JSON drift

The W03.P15 reviewer found that history reconstruction selected JSON blobs while
the schema also stored normalized revision and child columns for projections.
Future projections could therefore read one truth while history returned
another. Ledger reads now select the duplicated revision and child columns,
decode the JSON, and fail reconstruction if columns and JSON disagree. Tamper
tests cover revision-column and child-column drift.

### w03-p15-child-fence-canonical-target | medium | resolved child revision-fence drift

The W03.P15 follow-up reviewer found that top-level child `base_revision` and
`current_revision` could still drift from the canonical target fence if both
JSON blobs and scalar columns were tampered while `target_json` stayed
unchanged. Reconstruction and store validation now require the top-level child
fences to match the target fence exactly. A tamper regression covers the gap.

### w03-p15-follow-up-review | low | clean follow-up after ledger integrity fixes

The final W03.P15 follow-up review found no remaining findings. Focused ledger
tests, authoring-wide tests, store tests, and clippy passed after the fixes.

### w03-p16-apply-completion | high | resolved applying state could not complete

The W03.P16 reviewer found that the transition engine could move an approved
changeset into `applying` but had no legal completion path from `applying` to a
terminal apply outcome. The transition table now allows apply completion to
`applied`, `failed`, or `conflicted`, while terminal states still refuse later
lifecycle mutation.

### w03-p16-review-decision-freshness | medium | resolved stale approve and reject decisions

The W03.P16 reviewers found that approve and reject decisions needed the same
reviewed-tuple freshness checks that protect apply: proposal revision, target
revisions, validation digest, policy version, and cancelled runs. The transition
helpers now require explicit review-decision freshness and validation freshness
for both approve and reject.

### w03-p16-rollback-source-binding | medium | resolved rollback eligibility overscope

The W03.P16 reviewers found that rollback eligibility was not tied tightly enough
to the applied source child. Rollback eligibility now receives explicit source
child data, requires the requested child key to exist on the applied source, and
refuses operations without a V1 preimage-restore inverse or available preimage.

### w03-p16-ledger-transition-boundary | high | resolved append bypass of lifecycle and apply-child guarantees

The W03.P16 reviewers found that command-level transition helpers were
insufficient if malformed append-only ledger revisions could be persisted
directly. Ledger append validation now calls the shared transition blocker before
insert, rejects illegal status skips, rejects V1 multi-child apply starts,
rejects narrowing a reviewed multi-child proposal into a single applying
revision, and rejects swapping the reviewed child during apply completion while
allowing each aggregate revision token to advance.

### w03-p16-draft-mutation-bypass | low | resolved broad draft rewrite arcs

The W03.P16 reviewer found that draft mutation commands were broader than the
review and rebase lifecycle requires. Draft append and replace commands now stay
limited to draft/proposed authoring states, while explicit edit and rebase
commands own review-state or conflict-state returns to draft.

### w03-p16-follow-up-review | low | clean follow-up after transition fixes

The final W03.P16 follow-up review found no remaining findings in the scoped
transition and ledger files. Focused transition tests, focused ledger tests,
authoring-wide tests, and clippy passed after the fixes.

### w03-p17-submit-validation-binding | medium | resolved submit could accept stale validation lookup

The W03.P17 reviewer found that submit-for-review originally used latest
validation lookup instead of the requested validation digest, so a repeated or
older digest could be masked by a different latest row. Submit now loads the
requested digest directly and then requires the latest aggregate revision's
children to bind the same material and validation digests before moving to
review.

### w03-p17-preimage-replay-collision | high | resolved repeated replacement snapshot collision

The W03.P17 reviewer found that repeated replacement of the same child and
document could collide with the snapshot table uniqueness constraint because the
preimage row identity was request-scoped while the stored operation identity was
child-scoped. Proposal materialization now keeps `operation_id` equal to the
child key as required by the materializer, uses a stable changeset plus child
preimage identity, and treats timestamp-only recapture differences as reusable
when document, base, and payload material are identical.

### w03-p17-follow-up-review | low | clean follow-up after proposal command fixes

The final W03.P17 S82 follow-up review found no critical, high, or medium
blockers. It confirmed the proposal module remains route-free and within the
grounded S81/S82 scope, idempotency reserves before side effects inside one
unit-of-work, preimage storage is compatible with replace-body materialization,
and submit-for-review binds the requested validation digest to the latest
aggregate revision. Authoring-wide tests and clippy passed after the fixes.

### w03-p17-s83-idempotency-and-snapshot-coverage | medium | resolved missing S81 coverage

The W03.P17 S83 reviewer found that the first test pass covered the plan row as
written but missed two explicit S81 grounding requirements: idempotency conflict
and backend-owned snapshot reconstruction. The proposal tests now cover changed
request material under the same idempotency key conflicting before a second
write, and `proposal_snapshot` rebuilding history plus latest validation from
the store.

### w03-p17-s83-approval-ready-gate | medium | resolved missing invalid validation command test

The W03.P17 S83 follow-up reviewer found that submit-for-review tests still did
not prove rejection of a latest validation digest whose validation record is not
approval-ready. The proposal tests now create malformed proposal material,
validate it through the real validation path, submit with the exact latest
non-reviewable digest, and assert refusal without appending a `needs_review`
revision.

### w03-p17-s83-follow-up-review | low | clean follow-up after proposal command tests

The final W03.P17 S83 follow-up review found no remaining critical, high, or
medium blockers against the plan row or S81 grounding. The test suite covers
ordered revisions, replayed writes, idempotency conflict, validation gates,
terminal refusal, supersession and cancellation, and backend snapshot
reconstruction using real store and worktree behavior. Focused proposal tests,
authoring-wide tests, and package-local no-deps clippy passed; full dependency
clippy remains blocked by unrelated local dependency warnings.

### w03-p17-s84-read-transaction-shape | low | future read helper needed for proposal snapshots

The W03.P17 S84 reviewer found no blocking issues, but noted that
`proposal_snapshot` is currently a read helper over `UnitOfWork`; tests open it
with a mutating command label because the store does not yet expose a read-only
transaction helper. The helper is non-mutating and does not fake an idempotent
command outcome, so this does not block P17. Future route work should attach
snapshot reads to an explicit read transaction/helper.

### w03-p17-s84-formal-review | low | clean proposal command handler review

The formal W03.P17 S84 review found no critical, high, or medium blockers. It
confirmed S82 and S83 stay within S81 boundaries, add no routes, approval/apply
handlers, core adapter calls, LangGraph state, operation modes, or new
lifecycle vocabulary, and keep idempotency reservation before proposal side
effects. It also confirmed replay and conflict paths exit before handlers,
accepted outcomes are recorded in the same unit-of-work, and submit binds the
requested validation digest to latest material and validation state.

### w03-p17-s85-replay-payload-proof | low | tightened replay outcome assertions

The W03.P17 S85 reviewer found no blocking issues, but noted that replay tests
would be tighter if they compared the stored idempotency payload against the
original accepted command outcome, not only receipt ids and ledger lengths. The
replay helper now compares recorded outcome kind, aggregate identity, schema,
HTTP status, and serialized `ProposalCommandOutcome` payload for validate,
submit, cancel, and supersede replays.

### w03-p17-s85-follow-up-review | low | clean lifecycle replay verification

The final W03.P17 S85 review found no critical, high, or medium blockers. It
confirmed the lifecycle replay test uses real store and worktree behavior,
actual proposal command handlers, recorded idempotency outcomes, preserved
receipt ids, unchanged ledger lengths, and backend-owned final lifecycle
statuses. Focused proposal tests, authoring-wide tests, and package-local
no-deps clippy passed after the replay proof was tightened.

### w03-p19-provenance-key-collision | high | resolved delimiter-collision provenance keys

The W03.P19 S94 reviewer found that `actor_provenance_key` concatenated raw
actor ids and delegated actor ids with textual delimiters even though actor ids
can themselves contain those delimiter characters. Provenance keys now derive
from serialized structured fields and a content hash, and an actor test covers a
delimiter-collision-shaped pair of distinct delegated actor refs.

### w03-p19-ledger-local-actor-guard | medium | resolved ledger append bypass

The W03.P19 S94 reviewer found that proposal commands checked actor status
before idempotency, but direct ledger appends still accepted any attributed
record. `LedgerRepository::append_revision` now validates the attributed actor
against `authoring_actor_records` before inserting a revision, and a ledger test
proves unregistered actors are rejected without inserting a revision.

### w03-p19-side-effect-coverage | medium | assigned to S95 mutation attribution verification

The W03.P19 S94 reviewer found remaining coverage gaps for the full mutation
side-effect matrix: proposal commands need explicit missing/stale actor tests
that prove no idempotency, preimage, validation, ledger, or outbox side effects;
ledger tamper tests should target actor/provenance fields specifically; and the
v8 populated-ledger migration guard needs regression coverage. These are scoped
to S95, whose row explicitly verifies every mutation can be attributed to a
stable actor and delegated scope.

## Recommendations

Continue the remaining implementation phases by wiring stores, repositories,
idempotency, retention, and outbox behavior without reintroducing core-shaped
verbs, cache-backed product state, or frontend-derived eligibility.
