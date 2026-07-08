---
tags:
  - '#audit'
  - '#rag-console-review'
date: '2026-07-02'
modified: '2026-07-02'
related:
  - '[[2026-06-26-rag-service-management-adr]]'
  - '[[2026-06-26-rag-service-management-research]]'
  - '[[2026-06-16-graph-semantic-embeddings-adr]]'
  - '[[2026-06-27-rag-schema-gate-adr]]'
---

# `rag-console-review` audit: `rag operations console and degradation`

## Scope

One surface of the standing architecture-review program (siblings: graph/GIR,
global-state/GS, test-infra/TIH, timeline-temporal/TTR): the RAG OPERATIONS
CONSOLE and the DEGRADATION path, audited end to end against the governing
rules `rag-is-a-machine-singleton-the-dashboard-attaches-never-owns`,
`dashboard-does-not-override-rag-status-dir`,
`rag-data-rides-the-codified-contract-not-the-qdrant-shape`,
`degradation-is-read-from-tiers-not-guessed-from-errors`,
`every-wire-response-carries-the-tiers-block`,
`bounded-by-default-for-every-accumulator`,
`subprocess-calls-carry-cap-and-timeout`, and `engine-read-and-infer`.

Surfaces read in full:

- rag lifecycle: `engine/crates/rag-client/src/client.rs` (discovery,
  `probe_machine_state`, the loopback transport) and the lifecycle handlers in
  `engine/crates/vaultspec-api/src/routes/ops.rs` (`start_rag_service`,
  `stop_rag_service`, `run_rag_lifecycle_capture`, `reprobe_rag_until_running`).
- The ops console backend: `engine/crates/rag-client/src/control.rs` (Tier-1
  verbs + the Rust `RagOpsState`/`StorageRollup` aggregation),
  `engine/crates/rag-client/src/vectors.rs` (Tier-2 capability gates, the
  storage-schema gate, the direct embedding scroll), and the brokered routes
  `ops_rag_get` / `ops_rag` / `ops_rag_storage` / `rag_collection_health` in
  `routes/ops.rs`, plus the `/status` machine-state probe in `routes/stream.rs`
  and the embeddings gate sequence in `routes/query.rs`.
- The frontend: `frontend/src/stores/server/ragControl.ts` (the sole wire
  client for `/ops/rag/*`), `deriveRagStatusView`/`useRagStatus` in
  `frontend/src/stores/server/queries.ts`, `readTierAvailability` in
  `frontend/src/stores/server/engine.ts`, and the glass surface
  `frontend/src/app/right/RagOpsConsole.tsx`.

This is a read-only architecture review; findings carry stable `RCR-###` ids.
`info` entries record what was verified SOUND.

## Findings

### rag-blocking-io-on-async-workers | medium | Every brokered rag HTTP read runs blocking socket I/O directly on Tokio async worker threads

RCR-001. The rag loopback transport (`LoopbackTransport` in
`rag-client/src/client.rs`) is deliberately synchronous `std::net::TcpStream`
I/O — bounded by a per-socket timeout and the `MAX_RAG_BODY` cap, which is
correct — but every call site in the engine's ASYNC handlers invokes it
directly on the runtime worker thread: `ops_rag_get` (Tier-1 reads,
`READ_BUDGET` 10s), the `ops_rag` HTTP control verbs (`CONTROL_BUDGET` 15s,
`QUALITY_BUDGET` 60s for `/quality`), `rag_collection_health` (a
`probe_machine_state` /health round-trip at 1.5s plus a Qdrant read at 10s),
the `/status` handler in `routes/stream.rs` (`probe_machine_state`, 1.5s, on a
route the frontend polls), `start_rag_service` (probe + the bounded re-probe
loop), and the `graph_embeddings` route in `routes/query.rs` (probe +
`/readiness` + `/jobs` + the multi-page Qdrant scroll). The codebase already
uses `tokio::task::spawn_blocking` for exactly this class of work
(`routes/query.rs` `ensure_fresh`, the `registry.rs` declared folds), so the
rag reads are the outlier. Each call is bounded, so nothing hangs forever —
but a burst of concurrent slow rag reads (e.g. several console panels + a
`/quality` probe against a stalled rag) can pin ALL runtime workers
simultaneously and stall the entire engine (every route, not just rag) for up
to the largest in-flight budget. This is the thread-pinning failure mode the
`subprocess-calls-carry-cap-and-timeout` rule's own Why section documents for
subprocesses, reproduced on the HTTP path. Directly implementable: wrap the
blocking transport call chains in `spawn_blocking` (the transport itself needs
no change), or bound the concurrency of blocking rag reads.

### storage-rollup-sums-a-truncated-slice | medium | The storage rollup totals are computed over the bounded 64-namespace survey slice with no truncation honesty

RCR-002. `derive_storage_rollup` (`rag-client/src/control.rs`) sums
`total_points`, `total_footprint_bytes`, `live_count`, and `orphaned_count`
over the RETURNED namespace list, which the broker bounds at
`RAG_OPS_SURVEY_LIMIT = 64` — while `total_namespaces` (read from the survey's
`total`) may exceed the returned count. On a machine with more than 64
namespaces the console's "points", "disk footprint", and "N live · M orphaned"
rows silently undercount, with no `truncated` block or annotation. The
bounding itself is right (`bounded-by-default-for-every-accumulator`), and
rag orders orphaned/unknown first so attention-worthy namespaces survive
truncation, but the served COUNTS violate the spirit of
`display-state-is-backend-served-not-frontend-derived`'s bounded-slice
corollary and the graph contract's truncation honesty: a rollup over a
truncated slice must state the truncation. Two-part remediation: (a) directly
implementable — mark the rollup truncated when
`total_namespaces > namespaces.len()` and render the console rows as partial
("≥ X over first 64 namespaces"); (b) decision-gated — file the Tier-3
coordination ask for rag to serve machine-wide aggregate totals on
`/storage/survey` so the numbers are exact pre-truncation.

### blake2b-collection-name-rule-vs-adr | medium | The embedding scroll recomputes rag's blake2b collection name, contradicting the letter of the codified contract rule

RCR-003 (decision-gated: curation, not a code defect per se).
`vault_collection_name` (`rag-client/src/vectors.rs`) recomputes rag's
internal namespacing — `r{blake2b-6-hex(normcase(root))}_vault_docs` — for the
direct Qdrant embedding scroll (`routes/query.rs` `graph_embeddings`). The
codified rule `rag-data-rides-the-codified-contract-not-the-qdrant-shape`
names EXACTLY this as its Bad example ("recomputing rag's blake2b collection
name"), while the `graph-semantic-embeddings` ADR D1 sanctions the coupling as
the intended canonical seam and the later `rag-schema-gate` ADR versions the
SHAPE (schema_version + dense name/dim gates) — but NOT the collection-naming
scheme itself, which stays an unversioned byte-match recompute. The failure
mode is mitigated to honest degradation (a naming drift 404s and the semantic
tier degrades to no-vectors rather than misreading), and the ops CONSOLE
complies with the rule (Tier-2 `collection-health` takes its name from the
`/storage/survey`, validated as a path segment; the frontend `Diagnostics`
panel likewise picks the collection from the served survey). Still, the rule
corpus and the ADR corpus contradict each other on paper, which is exactly
what the curation discipline exists to prevent. Resolve by decision: either
amend the rule to record the ADR-sanctioned embedding-read exception (naming
the honest-degrade + schema-gate mitigations and the rag-side ask to add the
namespace prefix to the `/readiness` schema descriptor), or re-source the
scroll's collection name from the survey and delete the recompute.

### stale-no-json-comment-and-dead-whitelist-entries | low | The ops dispatch comment still claims server-start carries no --json, and the CLI whitelist keeps unreachable start/stop entries

RCR-004. The dispatch comment above the lifecycle match in `ops_rag`
(`routes/ops.rs`) states server-start/stop carry "NO `--json` (rag 0.2.25
rejects it on those verbs)", but `rag_start_args` now APPENDS `--json`
version-tolerantly (the exit-2 usage-error retry in `rag_rejected_json`
drops it for an older rag) — the comment describes the superseded behavior.
Separately, `RAG_CLI_WHITELIST` still lists `server-start` and `server-stop`
entries that are unreachable (the dedicated `start_rag_service` /
`stop_rag_service` handlers intercept those verbs first); if a future refactor
ever let them fall through to `run_sibling`, that runner unconditionally
appends `--json` — the exact rejection the dedicated handlers exist to manage.
Fix the comment and drop the two dead whitelist rows.

### evict-disabled-forever-on-absent-ref-count | low | The console's per-tenant Evict is permanently disabled when rag omits ref_count

RCR-005. `Tenants` in `frontend/src/app/right/RagOpsConsole.tsx` disables
Evict with `disabled={evict.isPending || ref !== 0}` where `ref` is the
tolerantly-read `ref_count`. When rag omits the field (`ref === undefined`,
which the deliberately tolerant wire shapes permit), `undefined !== 0` holds
and the button is disabled forever with no reason surfaced — the
permanently-disabled-lie shape the `unified-action-plane` rule forbids. Either
treat an absent `ref_count` explicitly (disable WITH a stated reason, or allow
the evict and let rag refuse), and consider a `title`/tooltip carrying the
reason ("in use by N consumers") for the ref>0 case as well.

### lifecycle-gate-then-attach | info | The gate-then-attach lifecycle is sound and matches the ADR contract exactly

Verified SOUND. `start_rag_service` gates on the machine-global
running-predicate BEFORE any spawn and returns `already_running`/`attached`
for a running service (never a 502); exit 0 is trusted as authoritative
("started") with pid/port harvested best-effort and no readiness downgrade of
a slow cold start; a non-zero exit re-probes with a bounded settle (4 × 500ms)
and attaches as `machine_owned` when another consumer won the race; only a
still-not-running re-probe is an honest `failed`/`needs_install` envelope
carrying the exit code, the combined output, rag's structured `--json` failure
envelope when present (`rag_start_failure`, read from stdout OR stderr), and a
DEGRADED tiers block. `stop_rag_service` is machine-scoped with the blast
radius stated in the console copy ("stop affects every consumer"). The
`--json` start flag is version-tolerant (typer exit-2 detection + text scan,
plain retry). Start flags are validated and bounded before the spawn (three
whitelisted flags, port clamped to the non-privileged range). Guard tests
cover the arg building, the rejection heuristic, and the failure lift.

### machine-singleton-discovery | info | Discovery is machine-global-first, STATUS_DIR-free, and typed

Verified SOUND. `service_json_candidates` orders rag's STATUS_DIR-independent
machine pointer (`~/.vaultspec-rag/qdrant-server/service.json`) first, the
STATUS_DIR-default home file second, and the per-scope file last — asserted by
dedicated guard tests (pointer-first, machine-global-wins-over-per-scope,
absent-pointer-skipped). No `VAULTSPEC_RAG_STATUS_DIR` is set or overridden
anywhere in engine or frontend source (grep-verified: the string appears only
in discovery documentation comments), and the lifecycle spawn
(`run_rag_lifecycle_capture`) introduces no environment manipulation —
`dashboard-does-not-override-rag-status-dir` holds, and the previously
deferred STATUS_DIR-independent machine pointer has been ADOPTED. The
crashed-vs-absent split is typed data (`DiscoveryOutcome`), not a reason-string
match; `Running` additionally requires an ungated `/health` `ready` confirm on
the discovered port, and a stale heartbeat short-circuits without probing
`/health` (test-asserted).

### tier1-verbatim-and-bounded | info | The Tier-1 control plane is verbatim, validated, and bounded end to end

Verified SOUND. `control.rs` carries zero rag semantics: every verb forwards
rag's request vocabulary and returns rag's envelope as a verbatim
`serde_json::Value`; the BROKER (`routes/ops.rs`) owns validation — reindex
type/initiator whitelists, watcher debounce/cooldown ceilings, the evict
dash-prefix flag-injection guard, jobs limit clamped to 50, log lines to 500,
survey to 64 (aggregated) / 256 (raw) — each rejected as a tiers-carrying 400
BEFORE any round-trip, with an unknown verb a 403 before discovery. Per-verb
wall-clock budgets are honest to the verb (10s reads / 15s controls / 60s
quality), and the transport carries BOTH the socket timeout and the 16 MiB
`MAX_RAG_BODY` cap on every GET and POST, with hung-verb and oversized-body
tests. A rag fault degrades to a tiers-bearing 200 through
`brokered_envelope` (never a 5xx), with the reason from typed discovery —
`degradation-is-read-from-tiers` holds on the producer side. Windows project
roots are percent-encoded into query strings (test-asserted). The Rust
`RagOpsState` aggregation is one brokered call instead of six frontend
round-trips, forwards the index/qdrant/watcher/tenants blocks verbatim, and
degrades the storage block alone (`available:false`) on a local-only 409
without failing the snapshot.

### tier2-capability-gates | info | The Tier-2 Qdrant reads are version-gated, reachability-gated, and schema-gated, failing closed with stated reasons

Verified SOUND. `rag_collection_health` validates the caller-supplied
collection name as a conservative single path segment (the name is SOURCED
from the storage survey, per the contract rule — the console's `Diagnostics`
panel picks it from the served survey, never recomputing it), requires a
RUNNING rag, gates on `qdrant_collection_api_supported` (major-1 only;
fail-closed on absent/garbage versions, test-asserted), and additionally gates
on `http_reachable` so local-only mode reports "needs server mode" instead of
degrading on a connection refusal. The direct embedding scroll adds the
storage-schema gate (`rag-schema-gate` ADR): the cheap `/health`
`schema_version` pre-check, then the full `/readiness` descriptor check
(version + dense vector name + dimension), fail-closed when a contract was
advertised, additive for a pre-contract rag — each mismatch degrades the
semantic tier with the drift STATED. The scroll itself is bounded three ways:
page size 1000, max 64 pages, and an OVERALL wall-clock deadline distinct from
the per-socket timeout, with a typed timeout instead of a silent partial
(test-asserted), and requests a minimal projection (path payload + dense
vector only) to stay under the body cap.

### frontend-tiers-gated-and-bounded | info | The stores layer reads degradation from tiers, bounds every accumulator, and the console is pure glass

Verified SOUND. `ragControl.ts` is the sole wire client for `/ops/rag/*`
(`dashboard-layer-ownership`); every mutation flows through the `dispatchOps`
platform seam with read-key invalidation on success. Degradation is
tiers-gated: `ragSemanticOffline` reads `readTierAvailability(data.tiers)`
(absence-is-degradation per contract §2), the shared `tiersFromQuery`
precedence gives a FRESH error envelope's tiers priority over a stale held
success, and a tiers-less transport fault is the distinct errored state —
never inferred offline. The job-progress poll is bounded (1s→8s capped
backoff), stops on a terminal phase AND on tiers-reported semantic-offline
(a dead rag is not polled), and holds no open connection (trigger-then-poll).
The reindex receipt is guarded against stale/cross-scope acceptance by a
scope + monotonic request-seq check (`shouldAcceptRagJobReceipt`). Accumulators
are bounded: 30s `gcTime` on every read, jobs limit clamped to 50, project
slots to 64, key parts and job text to 2048 chars. `RagOpsConsole.tsx` renders
stores hooks only (no fetch, no raw tiers), reads the start outcome from the
interpreted envelope (`interpretRagStartEnvelope`) rather than a thrown
transport error, states the machine-wide stop blast radius in its copy, and
the `deriveRagStatusView` seam interprets `/status.rag` + the semantic tier in
the stores layer so chrome never touches the raw block.

### subprocess-cap-and-timeout | info | Every rag subprocess spawn carries both the output cap and the wall-clock timeout, and the destructive storage broker is dry-run-gated

Verified SOUND. `run_rag_lifecycle_capture` reads BOTH streams concurrently
under `SIBLING_STDOUT_CAP` (8 MiB) within `SIBLING_TIMEOUT` (120s), kills the
child on either breach, and — unlike the shared runner — maps a non-zero exit
to the running-predicate instead of a blanket 502. The shared `run_sibling`
family and the storage runner (300s / 8 MiB for the long-running destructive
verbs) carry the same discipline, with hung-sibling-killed,
crashed-sibling-502, and capped-runaway tests. The destructive storage broker
(`ops_rag_storage`) whitelists three CLI-only verbs in their own route,
validates the namespace prefix and the migrate backend enum before the spawn,
pins delete/prune machine-scoped and migrate's root to the engine-controlled
active cell, and defaults every run to `--dry-run` with apply as the explicit
opt-in (`--yes` only to satisfy rag's non-interactive `--json`) — the
`vaultspec-dry-run-discipline` shape, structurally.

## Recommendations

- RCR-001 (directly implementable): wrap the blocking rag transport call
  chains in `tokio::task::spawn_blocking` at the broker call sites
  (`ops_rag_get`, the `ops_rag` HTTP-verb branch, `rag_collection_health`, the
  `/status` probe, `start_rag_service`'s probes, and the `graph_embeddings`
  gate + scroll sequence), mirroring the existing `ensure_fresh` /
  declared-fold pattern. No transport change needed.
- RCR-002 (part directly implementable, part decision-gated): add a
  `truncated` flag to `StorageRollup` when `total_namespaces` exceeds the
  returned list and annotate the console's size rows as partial; file the
  Tier-3 rag coordination ask for aggregate machine-wide totals on
  `/storage/survey`.
- RCR-003 (decision-gated): reconcile the rule
  `rag-data-rides-the-codified-contract-not-the-qdrant-shape` with
  `graph-semantic-embeddings` D1 / `rag-schema-gate` — either amend the rule
  to record the sanctioned embedding-read exception and its mitigations, or
  re-source the scroll collection name from the survey and delete
  `vault_collection_name`. Optionally file the rag-side ask to advertise the
  namespace prefix on the `/readiness` schema descriptor, which would close
  the last unversioned byte-match.
- RCR-004 (directly implementable): correct the stale no-`--json` comment and
  remove the unreachable `server-start`/`server-stop` rows from
  `RAG_CLI_WHITELIST`.
- RCR-005 (directly implementable): give the console's Evict an explicit
  absent-`ref_count` policy and a stated disabled reason.

## Codification candidates

- None new. RCR-001 is already covered in spirit by
  `subprocess-calls-carry-cap-and-timeout` (whose Why documents the
  thread-pinning failure mode); if the spawn_blocking remediation lands and
  the pattern recurs, consider widening that rule from subprocess spawns to
  "every blocking sibling I/O runs off the async workers". RCR-003 is a
  curation action on an EXISTING rule, not a new rule.
