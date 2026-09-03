---
tags:
  - '#audit'
  - '#code-deduplication'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:13edb22de75640ff66a989849b92c8f468fae515f64b632e143bf93cbb868433'
related:
  - '[[2026-06-15-codebase-centralisation-audit]]'
---
# `code-deduplication` audit: `Semantic code deduplication campaign`

## Scope

A RAG-led, evidence-backed audit of the dashboard production code for independently maintained implementations of the same behaviour. Each candidate is discovered through semantic search, corroborated by reading the implicated modules, and confirmed with exact-symbol search before it is recorded. Generated, vendored, worktree, locale, test, and documentation domains are excluded unless the candidate crosses a production boundary.

## Findings

### bounded-child-lifecycle | high | Provisioning maintains a duplicate bounded subprocess lifecycle

`probe_version`, `probe_pending_migrations`, and `run_capability` in the provisioning route each independently perform the same asynchronous child-process lifecycle: spawn, concurrently drain both streams under an output cap, enforce a deadline, terminate on breach, and wait for reaping. `run_bounded` in the API bounded-child module already owns that server-path contract. The provisioning-specific command construction and result interpretation remain distinct, but their repeated lifecycle implementation can drift from the shared cap, timeout, kill, and reap guarantees. This is confirmed for remediation: retain provisioning request semantics while delegating process execution to the bounded-child owner.

### multiple-composites-bypass-the-one-focuszone | high | Three composites reimplement the canonical roving-focus responsibility

`SegmentedToggle` and `Segment`, `CreateDocDialog`, and `ContextMenuHost` independently maintain element ordering, arrow-key movement, DOM focus, and roving `tabIndex` despite `useFocusZone` owning that responsibility. The copies have already diverged: segmented controls omit Home and End, the create dialog distinguishes focus from selection for unavailable rows, and the menu skips disabled rows while coupling cursor movement to its arm state. These are Class-B composite behaviours governed by the shared focus primitive, not separate layer contracts. This is confirmed for remediation: extend the focus primitive only for disabled-item skipping and focus-only movement, then retain each surface's activation and confirmation policies outside it.

### app-doc-type-label-maps-bypass-canonical-vocabulary | medium | App presentation maps bypass the localized document-type vocabulary

`docTrail`, `vaultRowPresentation`, and `CreateDocDialog` maintain local document-type label maps even though `DOC_TYPE_PRESENTATION`, `DOC_TYPE_ORDER`, and `docTypePresentation` own the exhaustive localized vocabulary. The copies vary in accepted types and rendering: breadcrumbs manufacture capitalized raw tokens and accept `index`, while the canonical vocabulary has six displayable types and locale-aware labels. This violates the single-vocabulary contract and risks further UI drift. This is confirmed for remediation: resolve labels from the canonical presentation map, make unknown values fail closed, and pass a resolved label or resolver into breadcrumb construction rather than authoring English locally.

### machine-bearer-fetch-is-reimplemented-across-four-store-clients | low | Four clients independently construct the same bearer transport

The engine, authoring, agent, and A2A team clients each implement the same default transport: read the machine bearer token, preserve an existing authorization header, inject the bearer otherwise, and delegate to `fetch`. Separate domain clients are intentional, but their authentication transport is not domain-specific and the copies explicitly describe themselves as identical. This is confirmed for remediation: make one stores-owned HTTP transport module the canonical owner and have all four clients import or inject it.

### tiers-preserving-engine-error-conversion-is-duplicated-and-drifting | medium | Four response converters produce inconsistent `EngineError` semantics

The engine, authoring, agent, and A2A team clients independently unwrap the shared envelope, extract tiers, and construct `EngineError`. They have already diverged: the A2A path parses JSON before testing success, so a non-JSON error can escape as a parsing exception rather than a status-bearing engine error; it also floors a missing tiers field to an empty object, and the agent path accepts null tiers unlike the stricter converters. This is confirmed for remediation: move response conversion to the shared HTTP transport with one record and tiers validator, preserving the established rule that absent or unparseable tiers remain absent.

### generation-aware-complete-listing-drain-is-duplicated | medium | Vault-tree and code-file listing walks duplicate one generation-aware state machine

`vaultTree` and `codeFiles` independently implement bounded restart attempts, cursor accumulation, first-page generation capture, straddle detection, restart exhaustion, tier aggregation, progress publication, unreliable-generation suppression, and final settlement. Their partial rendering and truncation policies are legitimate route-level variation around the duplicated core. This is confirmed for remediation: extract a private generic listing drain with route-specific page strategy, cap, row extraction, partial callback, yield policy, and final adaptation parameters.

### dashboard-keyed-promise-chain-serializer-is-duplicated | low | Panel and filter writes duplicate per-scope promise-chain serialization

The panel-state and filter write queues each obtain a prior per-scope tail, absorb its rejection, append the new write, replace the tail, and delete it only when it remains current at settlement. Pending-panel cleanup and filter recomputation are caller-specific concerns, not separate serialization responsibilities. This is confirmed for remediation: use one generic keyed serializer with optional current-tail cleanup while retaining each caller's state-specific work.

### document-lifecycle-parser-duplication | medium | Facet and lifecycle projections independently parse document status and tier

The graph index parses ADR status and plan tier once for filterable node facets and again for document lifecycle state. Their grammars already diverge: one ADR path requires an exact backtick-marked status extraction, while the other scans a lowercased H1 substring. A document can therefore receive inconsistent filter, pipeline, and lifecycle classifications. This is confirmed for remediation: establish one typed parser for each field in the structural parsing layer and derive every projection from its results; make any legacy tolerance explicit metadata rather than a second parser.

### vault-document-enumeration | medium | Graph and authoring independently define the vault Markdown corpus

Graph indexing, historical reconstruction, and authoring resolution independently enumerate `.vault/**/*.md` paths. Their worktree implementations repeat hidden/data/log exclusion and slash normalization, while their committed-tree implementations traverse the same tree and stem lookup performs further full walks. Caps and I/O failure policies are caller concerns over a shared corpus-membership responsibility. This is confirmed for remediation: move normalized worktree and resolved-tree vault path enumeration into the structural reader, then let graph and authoring apply their own caps, projections, and typed error policies.

### authoring-pagination-copy | low | Authoring reproduces the shared stable keyset pagination algorithm

`DocumentResolver.list_documents` independently locates the first path greater than the cursor, takes a bounded page, and emits the final key only when more rows remain. The shared `paginate` helper already accepts the authoring candidate and path extractor. Cursor exclusivity and exhaustion are contract-significant, so this is confirmed for remediation: retain authoring discovery, sorting, clamp, truncation metadata, and entry projection locally while delegating page slicing and next-cursor calculation.

## Recommendations

1. Consolidate the provisioning route's process lifecycle onto `run_bounded`; keep only provisioning-specific command assembly, bounded result interpretation, and typed error mapping locally.
2. Extend `useFocusZone` for disabled-item skipping and focus-only movement, then migrate `SegmentedToggle`, `CreateDocDialog`, and `ContextMenuHost` with real keyboard interaction coverage.
3. Delete the app-local document-type maps and route labels through the canonical localized vocabulary, including breadcrumb and creation-detail presentations.
4. Centralize the bearer transport and tiers-preserving response-to-`EngineError` conversion in one stores-owned HTTP transport module.
5. Extract a generic generation-aware listing drain and a generic keyed promise-chain serializer, keeping route and state-specific policy at call sites.
6. Establish one typed document-lifecycle parser and one structural vault corpus enumerator, consumed by graph and authoring projections.
7. Delegate authoring keyset pagination to the existing shared paginator.
8. Continue domain-partitioned semantic discovery. Record only candidates whose duplicated responsibility, behavioural overlap, and a safe canonical owner are established from source.

## Remediation ledger

### 2026-08-01 | W01.P01 complete | canonical owner proofs established

The campaign strengthened the two existing Rust canonical owners before migrating their consumers. `run_bounded` now fails closed when cleanup cannot complete, and its real child-process regression proves that a timed-out child no longer reports liveness after the call returns. `paginate` now explicitly proves exclusive cursor behavior, zero-size coercion, and final-cursor exhaustion. Independent Sol review approved the corrected result with no shim, forwarding alias, or duplicate owner introduced. The confirmed duplicate consumer sites remain open for their direct-import migrations.

### 2026-08-01 | W01.P02 complete | stores owners established

The campaign added direct stores-owned `httpTransport` and `keyedSerializer` modules with no barrel, alias, or compatibility seam. The bearer proof uses native fetch against a real loopback listener; error conversion preserves valid served tiers and refuses malformed or non-JSON data without inventing availability. The serializer proves same-key ordering, independent-key progress, rejection recovery, and current-tail-only cleanup. Existing client and dashboard call sites remain deliberately unmigrated until their dedicated direct-import steps.

### 2026-08-01 | authoring-pagination-copy remediated | W02.P07.S12

`DocumentResolver.list_documents` now imports `engine_query::envelope::paginate` directly. The local cursor offset, bounded page clone, and next-cursor implementation were deleted; discovery, sorting, clamp, truncation reporting, and entry projection remain caller policy. A real temporary-vault regression verifies a between-keys cursor and zero request clamp. Independent Sol review approved the direct-import migration.

### 2026-08-01 | shared stores transport findings remediated | W03.P10.S20-S23

The engine, authoring, agent, and A2A clients now import `FetchLike`, the injected machine-bearer transport, and the tiers-preserving non-success converter directly from the stores-owned `httpTransport` module. All four local bearer and error-conversion copies were deleted, and no re-export or forwarding shim remains. Actor-token layering, endpoint paths, A2A retry policy, and business-refusal handling remain client-local. A2A now checks the status before attempting a JSON success parse, so a non-JSON failure becomes a status-bearing `EngineError`. RAG grounding, exact residue search, strict TypeScript, fifty-eight focused tests, formatting, diff hygiene, and independent Sol review passed.

### 2026-08-01 | dashboard-keyed-promise-chain-serializer-is-duplicated remediated | W03.P12.S27-S28

`dashboardState` now imports two independent `createKeyedSerializer` instances directly -- one for panel state and one for filters. Its local promise-tail maps and queue helpers were deleted. Pending panel state remains local and is cleared only when the current serializer tail settles; filter cache reading, transform, and patch construction remain inside each queued caller task. RAG grounding, exact residue search, strict TypeScript, thirty-three focused real-behavior tests, formatting, diff hygiene, and independent Sol review passed.

### 2026-08-01 | canonical document-type vocabulary owner completed | W01.P03.S06

The deprecated `docTypeLabel` English fallback was deleted rather than preserved as a compatibility alias. The canonical descriptor API remains the only presentation route: its six displayable raw identities resolve localized label and detail descriptors, while `index`, unknown, whitespace-altered, and non-string values fail closed. RAG grounding, exact residue search, strict TypeScript, focused localization tests, formatting, diff hygiene, and independent Sol review passed. The remaining app-local label-map findings await their dedicated call-site migrations.

### 2026-08-01 | breadcrumb document-type map remediated | W04.P13.S29

`docTrail` no longer owns document-type labels or manufactures capitalization fallbacks. Its desktop and compact callers import `docTypePresentation` directly, resolve the canonical localized label, and supply it to the presentation-only trail helper. Unknown or `index` identities omit the type crumb. The desktop Vault root and compact root omission remain caller policy. RAG grounding, strict TypeScript, focused helper coverage, formatting, residue and diff checks, and independent Sol review passed.

### 2026-08-01 | vault-row document-type maps remediated | W04.P14.S30

`vaultRowPresentation` no longer owns document-type label or category maps. It imports `docTypePresentation` and the canonical generic document descriptor directly; canonical IDs also derive the valid kit category. Unknown and `index` identities fail closed to the generic label and no category. Rail-specific icons, status, dates, and metadata remain local. RAG grounding, strict TypeScript, rail localization and reveal tests, formatting, residue and diff checks, and independent Sol review passed.

### 2026-08-01 | Create Document canonical vocabulary migration remediated | W04.P15.S31

`CreateDocDialog` no longer owns creation or coverage document-type presentation maps. It imports `docTypePresentation` and `DOCUMENT_TYPE_MESSAGES` directly from the canonical stores-owned vocabulary and uses one local lookup only to supply the canonical generic document fallback. Dialog eligibility and purpose hints remain local policy. RAG grounding, the 23-test CreateDocDialog render suite, formatting, residue and scoped diff checks, and independent Sol review passed. A later typecheck rerun has an unrelated concurrent `StateBlock.tsx` Lucide JSX error; the scoped behavior evidence remains green.

### 2026-08-01 | canonical FocusZone disabled traversal completed | W01.P03.S05

The canonical FocusZone now owns disabled-item traversal and tab-stop eligibility. Disabled entries are skipped by arrow, Home, and End movement, and a newly disabled current item cannot retain the sole tab stop. A zone with no focusable item exposes no invalid tab stop. Selection and activation remain consumer policy. RAG grounding, real DOM and pure regression coverage, scoped lint, formatting, residue and diff checks, and independent Sol review passed.

### 2026-08-01 | segmented controls migrated to canonical FocusZone | W04.P16.S32

`SegmentedToggle` directly configures the canonical horizontal wrapping FocusZone, and `Segment` directly spreads its roving props. Local ref registration, DOM-order bookkeeping, key handling, focus movement, and tab-index ownership were deleted with no forwarding layer. Segment automatic activation remains local by mapping roving changes to `onChange`. The 26-test focused suite, scoped typecheck before later concurrent changes, lint, formatting, residue and diff checks, RAG grounding, and independent Sol review passed.

### 2026-08-01 | Create Document focus migration remediated | W04.P17.S33

`CreateDocDialog` directly uses the canonical both-axis wrapping FocusZone. Its local row registry, traversal arithmetic, radio keyboard handler, tab-index rule, and direct focus calls were deleted. Ineligible rows remain reachable so their explanatory reason is available, while dialog-local selection preserves the currently eligible type. The S31 direct vocabulary owner remains in place. RAG grounding, a 23-test real behavior suite, formatting, residue and diff checks, and independent Sol review passed.

### 2026-08-01 | ContextMenuHost focus migration remediated | W04.P18.S34

`ContextMenuHost` directly consumes the canonical vertical clamped FocusZone. Its local row ordering, arrow/Home/End movement, row tab-index ownership, and direct DOM focus lookup were deleted. Disabled and non-runnable actions are traversal options; menu cursor repair, arming, activation, confirmation, dismissal, positioning, pointer behavior, and restoration remain host policy. RAG grounding, 21 real interactive/render tests, formatting, residue and diff checks, and independent Sol review passed. This closes the confirmed multi-composite FocusZone duplication finding.

### 2026-08-01 | provisioning version probe migrated to bounded child owner | W02.P06.S09

`probe_version` now directly uses the canonical bounded-child executor. It retains only provisioning-specific command construction, zero-exit gating, and version-line interpretation; the shared owner performs process lifecycle mechanics. The real rustc subprocess regression, Rust format/test/check gates, scoped diff hygiene, RAG grounding, and independent Sol review passed. The migration and capability probe paths remain dedicated next steps.

### 2026-08-01 | provisioning migration probe migrated to bounded child owner | W02.P06.S10

`probe_pending_migrations` directly delegates subprocess lifecycle mechanics to the canonical bounded-child executor. CoreRunner argv construction, successful-exit policy, JSON envelope parsing, and unavailable or indeterminate projection stay provisioning-local. The real fixture projection test, Rust format/test/check gates, scoped diff hygiene, RAG grounding, and independent Sol review passed. Only capability probing remains in this bounded-child duplication cluster.

### 2026-08-01 | provisioning capability probe migrated to bounded child owner | W02.P06.S11

`run_capability` now directly delegates lifecycle mechanics to the canonical bounded-child executor while retaining argv, combined output, exit, and capability-job outcome policy. Spawn/read/wait faults remain non-indeterminate, while timeout and output-cap breaches remain explicit indeterminate outcomes. Targeted real subprocess evidence, Rust format/test/check gates, RAG grounding, scoped diff hygiene, and independent Sol review passed. This closes the confirmed bounded-child lifecycle duplication finding.

### 2026-08-01 | structural lifecycle metadata parser centralized | W01.P04.S07

`ingest-struct` now owns typed ADR status and plan-tier parsing with explicit canonical or legacy provenance. Live and as-of graph indexing parse once and reuse the result: canonical values alone feed facets, while lifecycle retains deliberate labeled legacy tolerance. Four graph-local scanners were deleted with no forwarding surface. RAG grounding, parser tests, focused graph policy tests, 44 engine-graph unit tests, Rust format/check gates, scoped diff hygiene, and independent Sol review passed.

### 2026-08-01 | structural Vault corpus enumeration centralized | W01.P05.S08

`ingest_struct::corpus` now owns sorted normalized Vault membership for worktree and resolved-tree paths. Worktree exclusions and typed tree traversal errors are centralized; live and as-of graph indexing directly consume it while keeping their own parsing and error policies. Graph-local walkers and stale references were deleted. RAG grounding, real temporary Git corpus coverage, direct graph tests, Rust format/check gates, scoped residue and diff hygiene, and independent Sol review passed.

### 2026-08-01 | graph structural parser and corpus consumer migrations reconciled | W02.P08.S13-S15, W02.P09.S16-S17

The reviewed S07 metadata consolidation already migrated live ADR facets, live plan-tier facets, and historical lifecycle parsing to one typed structural result, so S13 through S15 are closed with that exact evidence. The reviewed S08 corpus consolidation already migrated live and historical graph membership traversal to canonical ingest-struct corpus enumeration, so S16 and S17 are closed. Each record links to its direct tested and Sol-reviewed implementation evidence; no graph-local parser or corpus walker remains.

### 2026-08-01 | authoring listing migrated to canonical corpus inventory | W02.P09.S18

Authoring listing now directly uses canonical strict worktree and resolved-tree corpus inventory. It retains its cap, total and truncation, candidate, sort, pagination, and typed-error policies locally; the strict API shares the corpus module's sole traversal. Real Git listing coverage, existing cap and ref tests, Rust format/check gates, scoped diff hygiene, RAG grounding, and independent Sol review passed. Stem scans remain the final authoring corpus consumer.

### 2026-08-01 | authoring stem scans migrated to canonical corpus inventory | W02.P09.S19

Authoring stem resolution now filters canonical strict worktree or resolved-ref inventory instead of walking directories or Git trees itself. Its duplicate policy, retention bound, no-catalog-cap rule, and typed errors remain local. Real worktree-vs-ref duplicate and over-listing-cap regressions, Rust format/check gates, exact old-walk residue, scoped diff hygiene, RAG grounding, and independent Sol review passed. This closes the confirmed Vault corpus enumeration duplication finding.

### 2026-08-01 | private generation-aware listing drain established | W03.P11.S24

A private generic engine listing drain now owns generation baseline, straddle discard/restart, bounds, cursor, latest tiers, and settlement. It preserves route-specific partial/progress/yield/result policy through callbacks, with no caller migrated yet and no export surface. Four deterministic Promise tests, formatting, RAG grounding, and independent Sol review passed. A broad typecheck remains blocked by an unrelated concurrent unused local in a menu test.

### 2026-08-01 | vault-tree listing migrated to generation-aware drain | W03.P11.S25

Vault-tree now directly calls the private generation-aware drain; its duplicate nested attempt/page/generation loop is deleted. Vault-tree-specific cumulative progress, incomplete partials, paced yield, and settlement remain callback-local. A deterministic straddle restart test and 13 focused helper/client tests, formatting, diff hygiene, RAG grounding, and independent Sol review passed. The code-file loop remains the final consumer.

### 2026-08-01 | code-file listing migrated to generation-aware drain | W03.P11.S26

Code-file complete listing now directly uses the private generation-aware drain; its duplicate nested loop is deleted. Its server and client truncation, progress, settlement, and generation-suppression policy stays local. A deterministic straddled restart/truncation regression and 14 focused helper/client tests, formatting, diff hygiene, RAG grounding, and independent Sol review passed. This closes the confirmed generation-aware listing-drain duplication finding.

### post-remediation semantic-sweep findings | 2026-08-01

#### duplicated-actor-header-transport | low | Agent and Authoring repeat the same actor transport mechanic

`stores/server/agent/index.ts` and `stores/server/authoring/index.ts` each define the same actor-header constant and `withActor` fetch wrapper. Their endpoint and typed-adapter layers are intentionally separate, but actor authorization injection belongs with the existing shared stores-owned HTTP transport owner. Confirmed for remediation in W05.P19.S35.

#### duplicated-listing-document-type-order | low | Listing projections repeat canonical document-type order

Two projections in `stores/server/queries/listings.ts` repeat the six-item document-type order already owned by `docTypeVocabulary.ts`. Their grouping and sort policy remains projection-local, but identity order must import the canonical owner. Confirmed for remediation in W05.P20.S36.

The final current-worktree RAG sweep covered ten domains plus focused HTTP, vocabulary, and forwarding follow-ups against an available consistent 18,760-item index. It found no other high-confidence duplicate, shadow, or shim; all other reviewed overlaps were retained as deliberate policy boundaries pending these two targeted remediations.

### 2026-08-01 | actor-header transport centralized | W05.P19.S35

The shared stores HTTP transport now owns actor-header injection. Agent and Authoring directly import it; their identical local actor constants and wrappers were deleted while endpoint and business policies remain local. Real loopback authorization composition coverage, RAG grounding, formatting, scoped diff hygiene, and independent Sol review passed. The only broad typecheck issue remains an unrelated concurrent menu-test unused local.

### 2026-08-01 | listing document-type order centralized | W05.P20.S36

Both listing projections now seed directly from canonical `DOC_TYPE_ORDER`; their repeated local six-type arrays are deleted. Grouping, sorting, index exclusion, unknown ordering, and untagged behavior remain local policy. Cross-projection coverage including the untagged bucket, 33 focused listing tests, RAG grounding, formatting, scoped diff hygiene, and independent Sol review passed. This closes the final post-sweep duplicate identified in the first fresh semantic sweep.

### final independent-review residual shadows | 2026-08-01

#### dead-roving-focus-primitive | low | Standalone focus utility shadows canonical FocusZone

`app/chrome/rovingFocus.ts` defines `moveRovingFocus` beside canonical `useFocusZone`, and only its own test imports it. It is dead parallel focus logic with no production consumer. Confirmed for deletion in W06.P21.S37.

#### literal-actor-header-test-protocol | low | Live tests shadow the canonical actor-header protocol

Four live tests repeat the actor-header literal instead of importing `AUTHORING_ACTOR_TOKEN_HEADER` from shared `httpTransport`. Production ownership is clean, but tests must use the canonical constant to prevent protocol drift. Confirmed for remediation in W06.P22.S38.

### 2026-08-01 | actor-header test protocol canonicalized | W06.P22.S38

All identified live and transport tests now directly import `AUTHORING_ACTOR_TOKEN_HEADER` from shared HTTP transport. The five literal protocol copies and any local test alias are gone; production behavior is unchanged. RAG and exact residue search, 18 focused tests, formatting, scoped diff hygiene, and independent Sol review passed. This closes the final residual shadow found by independent final review.

### 2026-08-01 | E2E actor-header shadow removed | W07.P23.S39

The framework-agnostic E2E authoring client now directly imports the canonical actor-header constant. Its local literal and alias are deleted without changing REST or SSE behavior. RAG grounding, independent Playwright 7-test evidence, formatting, scoped diff hygiene, and independent Sol review passed. This closes the final true shadow identified by the campaign.
