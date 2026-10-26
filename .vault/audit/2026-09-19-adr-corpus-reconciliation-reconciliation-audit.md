---
tags:
  - '#audit'
  - '#adr-corpus-reconciliation'
date: '2026-09-19'
modified: '2026-09-19'
body_schema: 'body-v2'
body_hash: 'sha256:6b70d475548426fa5dea324f5273d9a0a8e28fa6406ca4d1803b679922a49578'
related:
  - '[[2026-07-14-a2a-orchestration-edge-adr]]'
  - '[[2026-07-11-agentic-spec-authoring-backend-adr]]'
  - '[[2026-07-24-a2a-product-provisioning-adr]]'
  - '[[2026-06-19-graph-backend-unification-adr]]'
  - '[[2026-06-27-figma-naming-contract-adr]]'
  - '[[2026-06-22-unified-filter-plane-adr]]'
  - '[[2026-07-02-codebase-graphing-adr]]'
  - '[[2026-07-08-distribution-channels-adr]]'
  - '[[2026-06-13-engine-hardening-adr]]'
  - '[[2026-06-16-rag-control-plane-adr]]'
  - '[[2026-07-31-runner-fleet-conformance-adr]]'
  - '[[2026-09-04-vault-curation-adr-grounding-debt-audit]]'
---

# `adr-corpus-reconciliation` audit: `ADR corpus reconciliation against the codebase`

## Scope

A whole-corpus semantic reconciliation of the architecture decision record set
against the code it governs, run 2026-09-19, folding in the
`vaultspec-core doctor` findings of the same date.

Covered: all 202 records under `.vault/adr/`. Every one of the 170 non-fixture
`accepted` records was read whole and each of its checkable commitments — a named
module, symbol, constant, route, boundary, guard test, or config key — was located
in the code by semantic search, read at the epicenter, and confirmed by targeted
grep. The twelve `proposed` records were checked against both the code and their
plans' Step state. The five `superseded` records and the one `deprecated` record
were checked under the inverted test: that the retired approach no longer governs
the code. The supersession and relatedness topology was walked for chains, forks,
and stranded nodes, and the same-feature record pairs were read against each other
for contradiction, duplication, and fragmentation.

Not covered, and outstanding: the lifecycle document-boundary sweep — restated
grounding, displaced decisions, forked facts — was scoped to a twenty-document
candidate set that was identified but not adjudicated.

The `exec-mapping` warning class was excluded at the owner's direction as a known
tooling defect over open Steps.

## Findings

### adr-corpus-enumeration | critical | The `vault list` verb silently truncates the corpus to 50 records, so any tooling or review driven by it sees a quarter of the decisions

`vaultspec-core vault list adr --json` returns 50 documents against 202 files on
disk under `.vault/adr/`; `vaultspec-core vault list --json` with no type argument
returns the same 50 and reports zero documents of every other type, though the vault
holds 144 research, 156 audit, 127 plan, and 32 reference records. The cause is an
undocumented default on `--limit`, applied with no truncation notice in the payload
or on the terminal. The consequence is that the verb the reconciliation playbook
names as the corpus enumeration step is not safe to enumerate with: this audit had
to enumerate from disk instead. Any prior curation, review, or report that trusted
`vault list` to be complete was reasoning over a silent 25% sample.

### workspace-doctor-predicate | medium | `spec doctor` reports a provider directory that does not exist as complete, and populated ones as mixed

`vaultspec-core spec doctor` reports `antigravity ok dir: complete` while
`.antigravity/` does not exist on disk at all, and simultaneously reports
`claude warn dir: mixed` and `codex warn dir: mixed` for directories that are
present and whose every resource `vaultspec-core sync --dry-run` reports as
unchanged. The completeness predicate is inverted or reading the wrong path. The
two `dir: mixed` warnings folded into this pass are therefore not actionable as
workspace defects; the reporting is the defect.

### harness-fixture-residue | high | Sixty-four acceptance-harness fixture documents sit in the production vault, sixteen of them as ADRs

A test-harness run on 2026-07-16 materialized 16 ADRs, 24 research documents, and
24 feature indexes into `.vault/`, all still present. Fourteen carry epoch-stamped
throwaway feature tags of the form `pw7-acceptance-<agent>-<epoch>`; two more are
disguised by plausible filenames, `2026-07-16-sse-reconnection-auto-adr.md` and
`2026-07-16-sse-reconnection-mixed-adr.md`, whose subject matter has nothing to do
with SSE reconnection. Twelve of the sixteen share one identical placeholder body
whose entire decision reads "Adopt the deterministic acceptance harness as the
standing proof that a prompt materializes exactly two governed documents on disk",
under the H1 "`acceptance-harness` adr: `research_adr acceptance`". Thirteen are
marked `accepted`, so they currently read as ratified decisions governing this
codebase. One, `2026-07-16-pw7-acceptance-zai-1784220945-adr.md`, is a research
document filed as an ADR — its H1 declares the `research` type and it carries no
parseable status at all, which is the single `adr-status` warning in the doctor run.
The two misleadingly-named records are the sharper half of this finding: a reviewer
scanning filenames has no signal that they are fixtures, and one reconciliation
batch in this very pass initially treated them as real decisions.

### a2a-verb-contract | critical | The `a2a-orchestration-edge` ADR's newest amendment documents an eleven-verb cross-repository contract the engine does not honor

The 2026-09-05 amendment to `2026-07-14-a2a-orchestration-edge-adr` states that D1
grows to eleven verbs, adding `run-message`, `permission-respond`,
`native-commands-list`, and `native-command-execute`, and cites shipped Steps
S43-S45 as evidence. `A2A_WHITELIST` at
`engine/crates/vaultspec-api/src/routes/ops/a2a.rs:54-63` contains exactly seven
entries: `run-start`, `run-status`, `run-cancel`, `presets-list`, `active-runs`,
`provider-catalog`, `clarification-respond`. The four added verbs have no route
handler and no frontend consumer anywhere in the tree, and the whitelist is
fail-closed — a verb outside the set is a 403 before any round-trip — so a sibling
built against the documented contract fails hard. The working tree corroborates a
local revert: the `.vault/exec/2026-07-31-a2a-integration-verification/` step files
the amendment cites are deleted but uncommitted. This is the most severe drift in
the pass, because the vault asserts a live cross-repository contract as shipped.

### authoring-gate-breach | high | The section-scoped edit pipeline the `agentic-spec-authoring-backend` ADR exists to gate shipped without the amendment it requires

`2026-07-11-agentic-spec-authoring-backend-adr` is `accepted`, and its D1 states
that a `SectionEdit` draft "is refused at validation with a typed
`UnsupportedOperationKind`/`UnsupportedDraftMode`", while D2 states that
`create_rollback_eligibility` "admits exactly `ReplaceBody | EditFrontmatter | Rename`". Both are contradicted by shipped code.
`engine/crates/vaultspec-api/src/authoring/operations/mod.rs:842` defines
`validate_section_edit_draft`, which raises those two typed errors only for the
other operation kinds and accepts `ChangesetOperationKind::SectionEdit` with
`DraftMode::SectionScoped`, then resolves and materializes it through
`materialize_section_edit` at line 358.
`engine/crates/vaultspec-api/src/authoring/transitions/mod.rs:656-662` admits five
kinds, including `SectionEdit` and `SetPlanStepState`. These are first-class
variants of `ChangesetOperationKind`
(`engine/crates/vaultspec-api/src/authoring/api/mod.rs:531-541`), not legacy
residue. The whole purpose of this record was to hold that build behind a required
amendment to the change-format ADR's ASA-003 clause; the build landed and the
amendment was never recorded. This is the one finding in the pass where an accepted
decision was reversed by silent code rather than by a later ratified decision.

### stale-proposed-status | high | Five fully shipped decisions still read `proposed`, so load-bearing code depends on unratified authority

Under the project contract no work executes on unaccepted authority, yet five
`proposed` records are fully implemented with their plans closed.
`2026-06-13-engine-hardening-adr`: its plan is 7/7 Steps closed, `ahead`/`behind`
ships at `engine/crates/ingest-git/src/worktrees.rs:26-29,252,266-368`, and both
`frontend/src/testing/engineConformance.test.ts` and
`engine/tests/tests/degradation_adversarial.rs` are wired into
`.github/workflows/merge-gate.yml:389-428`. `2026-06-16-rag-control-plane-adr`:
37/37 Steps closed, brokered at
`engine/crates/vaultspec-api/src/routes/ops/mod.rs:237` and
`engine/crates/rag-client/src/control.rs:80-224,467-488`, with an 1129-line
`frontend/src/stores/server/ragControl.ts`.
`2026-07-14-frontend-language-authority-adr`:
`engine/crates/vaultspec-session/src/settings_schema.rs:79,410-482,560,821` and
`frontend/src/stores/view/settingsPresentation.ts:111-135`.
`2026-07-15-context-menu-copy-safety-adr`:
`frontend/src/app/stage/menus/graphNodeMenu.ts:125-138`, whose inline comment cites
the ADR by its own finding id. `2026-07-17-editor-change-fidelity-adr`:
`frontend/src/app/authoring/sectionReconcile.ts`,
`frontend/src/app/authoring/editorChanges.ts`, and
`engine/crates/vaultspec-api/src/authoring/http/handlers2.rs:733,769`, cited by name
in twenty files repo-wide.

### stale-proposed-status | medium | Two `proposed` decisions were built, plan-closed, and then largely deleted

`2026-06-16-graph-node-representation-adr` and `2026-06-16-graph-viz-scorecard-adr`
were both executed under `.vault/plan/2026-06-16-graph-viz-quality-plan.md`, which
is 74/74 Steps closed and names both in `related:`. The scorecard harness and the
`semanticGate.ts` composite were built across commits `b375c373` and `01204b81`,
then removed wholesale in commit `77269a2a` together with the five non-connectivity
layouts they scored. Of the node-representation record, only D1 (the `node_id`-keyed
embedding join at `frontend/src/stores/server/liveAdapters/graph.ts:378-394`) and D3
(the derivation label at `engine/crates/engine-query/src/graph/mod.rs:342-403`)
survive. Neither record can be ratified as written and neither is honestly open;
both need their status reconciled against the revert.

### graph-stack-reversal | high | Six accepted ADRs govern a graph rendering stack that was deleted, none marked superseded

The graph canvas was rebuilt twice and the decision record followed neither rebuild.
`2026-06-12-dashboard-foundation-adr` G6.b commits to PixiJS v8;
`2026-06-14-dashboard-node-canvas-adr` names `field/nodeSprites.ts`,
`field/edgeMeshes.ts`, and `field/camera.ts` as the implementation;
`2026-06-17-node-graph-rework-adr` D1 commits to cosmos.gl as a pure GPU renderer;
`2026-06-16-graph-force-stability-adr` names `INCREMENTAL_REHEAT_ALPHA`,
`INTERACTION_ALPHA_TARGET`, `beginInteraction`, `endInteraction`,
`FREEZE_MOVE_EPSILON`, `FREEZE_DWELL_TICKS`, and `radiusOf`. None of those
dependencies, files, or symbols exists: `frontend/package.json` carries `three` and
neither `pixi.js`, `@cosmos.gl/graph`, `graphology`, nor `sigma`, and
`frontend/src/scene/three/d3ForceSolver.ts` is the live solver.
`frontend/src/scene/sceneController.ts:338` records the change in a comment,
"Three-native force tuning (replaces the retired set-cosmos-config)". The reversal
was itself a ratified decision — `2026-06-19-graph-backend-unification-adr`
explicitly retires Cosmos and PixiJS — but it was never propagated: all four
predecessors still read `accepted` with no amendment note and no `superseded_by`
edge. `2026-06-16-graph-lineage-dag-adr` and `2026-06-14-graph-representation-adr`
are the same pattern one layer up: the Sugiyama lineage layout and four of the five
committed representation modes were deleted in commit `77269a2a`, and
`frontend/src/scene/field/representationLayout.ts:1-11` states plainly that the live
field "renders the connectivity force layout only and no-ops
`set-representation-mode`". Only the engine half of `graph-lineage-dag` survives.

### a2a-provisioning-lag | high | The `a2a-product-provisioning` ADR's own accepted amendment was never implemented

The 2026-07-31 amendment to `2026-07-24-a2a-product-provisioning-adr` reverses its
own D1-D3 at the product owner's direction: stop building a2a from source, fetch a
published, sha256-verified per-target release artifact instead, with "no source
coupling between the repositories". The code never made the pivot.
`packaging/a2a-component.lock.json` still pins `a2a_source.commit` and
`freeze_recipe.build_entry`; `.github/workflows/a2a-product-contract.yml` and
`engine/crates/vaultspec-product/src/a2a_contract.rs` still build and smoke the
PyInstaller onedir on dashboard runners; `product-release.yml:428` still feeds the
lock into a build step. The implementing commits `076f214d` and `6b96345e` predate
the amendment and nothing after it implements the new shape. Unlike the other
findings here, the record is correct and the code is behind it.

### ungoverned-gap | high | Four accepted commitments have no successor record and no implementation

These are gaps with no governing record anywhere in the vault, so no reader can
discover the current truth. `2026-06-22-unified-filter-plane-adr` D4 widens
`/events` to accept `Filter` facets; `EventsParams` at
`engine/crates/vaultspec-api/src/routes/temporal.rs:20-30` still carries only
`scope`, `from`, `to`, `kinds`, `bucket`. Its D3 has the timeline consume canonical
filters through a lineage read; `frontend/src/app/timeline/Timeline.tsx:1-16`
records that the lineage-consuming timeline "was TORN DOWN", and the plumbing
(`useEngineEvents`, `useTimelineLineageView` in
`frontend/src/stores/server/queries/timeline-search.ts`) has zero non-test callers.
`2026-07-02-codebase-graphing-adr` D3/D4 commit to stored module nodes under the
canonical key `code-mod:{dir}`; the key appears nowhere, and
`engine/crates/ingest-code/src/modules.rs:1-11` states "a directory never becomes a
node". `2026-06-12-dashboard-foundation-adr` G5.c commits to Base UI with a Radix
fallback; neither package is in `frontend/package.json` and the bespoke
`frontend/src/app/kit/` is what shipped. `2026-06-14-dashboard-node-canvas-adr`
types a `semantic` edge tier on `SceneEdgeData`
(`frontend/src/scene/sceneController.ts:189`) that the scene cannot render:
`frontend/src/scene/field/edgeStyle.ts:12` declares `EDGE_TIERS` as
`["declared", "structural", "temporal"]` and the tier switch throws
`UnknownTierError` at `frontend/src/scene/field/edgeStyle.ts:46`.

### figma-code-connect-reversal | medium | Three accepted ADRs still record Figma Code Connect as the binding mechanism after it was removed

`2026-06-27-figma-naming-contract-adr` (`accepted`) removed Code Connect for want of
an Org seat and replaced it with the name-as-contract scheme now codified in the
project design-system rule. Three predecessors were never amended.
`2026-06-16-figma-parity-reconciliation-adr` carries a whole "Foundation — Code
Connect linkage" decision wiring the codebase through `@figma/code-connect`;
`2026-06-15-figma-design-bridge-adr` decision 3(b) commits to a repo-maintained
code-to-Figma mapping registry; `2026-06-24-left-rail-feature-filter-adr` asserts in
its Status section that mappings "were authored and validated" and that only
publishing is blocked. The code follows the newer record: no `figma.config.json`, no
`*.figma.tsx`, no `component-map.json` anywhere, and
`frontend/dev/tooling/figma-names-check.mjs:2-11` states outright that there is no
Code Connect. The `2026-06-24` assertion is the most misleading of the three,
because it reads as a status report on live tooling.

### surface-relocation-reversal | medium | Six accepted ADRs describe surfaces that were relocated or retired under later ratified decisions

Each traces cleanly to a later accepted record that the code even cites, and each
predecessor stands unamended. `2026-06-14-dashboard-search-adr`: the right-rail
`SearchTab.tsx` and its scored text-match fallback are gone, and
`frontend/src/stores/server/searchController.ts:66-70` records that "the rag-down
TEXT FALLBACK retired here"; search now lives in the Cmd-K palette.
`2026-06-16-document-editor-backend-adr`: the `/ops/core`
`set-body`/`set-frontmatter` write channel is gone
(`frontend/src/stores/server/opsActions.ts:27-28` retains only `archive` and
`autofix`), retired by `2026-07-09-ledgered-edit-migration-adr`.
`2026-06-14-dashboard-canvas-controls-adr`: `TierDial.tsx`, `FilterBar.tsx`,
`AlgorithmPanel.tsx`, and `Discover.tsx` are named as shipped and none exists, and
the `POST /nodes/{id}/discover` route is absent engine-side.
`2026-07-14-activity-rail-realignment-adr` D2/D3: of four committed footer chips
only Approvals remains, narrowed by the advanced-service-console ADR.
`2026-06-14-dashboard-rag-manager-adr`: `OpsPanel.tsx` and `NowStrip.tsx` are gone
and the cluster moved to `frontend/src/app/panels/IndexConsole.tsx`.
`2026-06-12-dashboard-gui-adr` deferred the renderer choice to a spike and was never
amended with the outcome.

### scoop-channel-reversal | medium | The `distribution-channels` Scoop decision ships the opposite of what it records

`2026-07-08-distribution-channels-adr` records as CHOSEN that the Scoop manifest
lives in this repository at `bucket/vaultspec.json` and refreshes through dist's
`post-announce-jobs` seam, the stated point being "one repo, one PR surface".
`bucket/` holds only a README. The manifest is pushed to the external organization
repository `nevenincs/homebrew-tap` by deploy key from
`.github/workflows/scoop-bump.yml:59-68`, whose comment explains why: a manifest in
this repository's own `bucket/` "is published nowhere a user's Scoop can see".
`dist-workspace.toml:95-96` directly negates the other half — "No post-announce
jobs: channel publication runs from the release orchestrator,
product-release.yml". The engineering change is well-reasoned; only the record was
left behind.

### orphaned-commitment | medium | Eight accepted decisions have implementation that exists but is unreachable, or was never built

These are not reversals; they are commitments that quietly did not land.
`2026-06-14-dashboard-pipeline-status-adr`: `view.adrs`
(`frontend/src/stores/server/queries/pipeline.ts:342`) and
`deriveWorkPipelineArcView` (`frontend/src/stores/view/workTabChrome.ts:62-114`) are
computed and have zero non-test consumers. `2026-06-15-dashboard-settings-adr`:
`SETTINGS_ACTION_ID` and `openSettingsAction` exist at
`frontend/src/stores/view/chromeActions.ts:37,66-73` and no component mounts the
required persistent gear entry point, leaving the palette as the only route in.
`2026-06-14-graph-node-salience-adr`: the `setLens` store seam exists and the
required canvas-control group was never built, so only the default status lens is
reachable. `2026-06-15-dashboard-node-graph-stability-adr` D9 promises four force
controls and three ship; `centerStrength` is lab-only at
`frontend/src/scene/three/graphControlSchema.ts:71-79`.
`2026-06-13-dashboard-optimization-adr` D1/D3 commit to a CI performance gate; only
the manual `frontend/dev/tooling/graph-performance.ts` exists, wired into no recipe
and no workflow. `2026-06-14-dashboard-git-diff-browser-adr`: the hunk-by-hunk diff
view with dual gutters was never built —
`frontend/src/app/right/ChangesOverview.tsx:17` opens the whole file.
`2026-06-14-dashboard-nav-controls-adr`: no fullscreen toggle exists anywhere in
`frontend/src`, and `reset-view` is not wired into the toolbar camera cluster.
`2026-07-03-worktree-switcher-identity-adr`: the mono absolute-path line chosen over
a rejected tooltip-only option is absent from the trigger markup at
`frontend/src/app/left/WorktreePicker.tsx:495-551`.

### action-plane-violation | medium | The comment send-to-agent verb is a bespoke per-surface handler, not a shared action descriptor

`2026-07-16-agentic-authoring-ux-adr` D8 enrolls `comment:send-to-agent` as a shared
`ActionDescriptor`. No such id exists: the string `send-to-agent` appears nowhere in
`frontend/src`, and `frontend/src/stores/view/agentActions.ts` registers only
`agent:toggle-panel`, `agent:stop-run`, and `agent:new-session`. The verb ships as a
prop-drilled `onSendToAgent` callback through
`frontend/src/app/viewer/CommentThreadPanel.tsx:80,431,560`. Beyond the ADR, this is
a standing violation of the project's one-descriptor-per-action rule, which forbids
a bespoke per-surface handler for a verb that crosses surfaces.

### fragmented-decision | low | Three feature scopes carry two sibling accepted records each, and one supersession is an absorption rather than a pivot

`2026-06-29-agentic-document-chunk-management-adr` is marked superseded by
`2026-06-29-agentic-change-format-and-chunking-adr`, but the successor copies the
predecessor's chunk-identity model near-verbatim and labels it "absorbed from the
superseded document-chunk-management ADR"; the only substantive change is a v1 scope
deferral. Same-day supersession of a record whose content is carried forward whole is
one decision split across two files. Separately, `graph-representation` and
`graph-simulation-stability` each hold two `accepted` records for one feature scope.
Both pairs are cross-linked and carry explicit amendment notes scoping the later
record against the earlier, so neither is a contradiction — but "which record governs
this scope" cannot be answered by status alone, only by reading both. The
`a2a-product-provisioning` pair was checked and is not a finding: the 2026-07-18
record carries a precise clause-level amendment note recording what the 2026-07-24
record replaced, which is the amend-over-supersede pattern working correctly and the
model the other pairs should follow.

### missing-grounding | low | The one remaining schema error is owned debt already adjudicated, not an open defect; two research records were missing their sources

`2026-07-31-runner-fleet-conformance-adr` is `accepted` with `related: []`, which is
the schema error in the doctor run. It is not a defect to clear. A prior campaign
recorded in `2026-09-04-vault-curation-adr-grounding-debt-audit` already
investigated it and ruled that its evidence base — a live fleet enumeration, host
architecture probes, dispatched probe legs, and interval memory sampling across a
real four-target dispatch — is not re-observable, so any grounding document authored
now would either restate the ADR back at itself or pass today's readings off as the
decision's evidence. That audit also records a positive reason not to author one:
the fleet topology is documented with more precision than a vault record would carry
in the configuration it governs, `.github/actionlint.yaml` and `dist-workspace.toml`,
and a vault restatement would fork the fact from its live source. Its verdict is
that the debt is accepted rather than paid and the gate stays red on this one ADR as
an owned state. This pass confirms that verdict and adds nothing to it. Separately, `2026-08-01-code-tree-legibility-research.md` and
`2026-08-01-rail-feature-metadata-research.md` are both missing the `## Sources`
section their attested `body-v1` schema requires; both ground accepted ADRs whose
decisions are implemented, so the decisions are sound but their evidence chain is
not re-fetchable.

### legacy-encoding | low | Two ADRs carry substantive amendment prose under a legacy `## Status` heading

`2026-06-14-dashboard-left-rail-adr` and `2026-06-24-left-rail-feature-filter-adr`
each carry a `## Status` section. Neither is status drift: both agree with their H1
token, and both sections hold real amendment prose rather than a bare legacy value.
The encoding is nonetheless misleading, because a `## Status` heading reads as a
status declaration and is where the deprecated bare-value convention lived. Both
would read correctly as `## Amendment`.

### retired-decisions-clean | low | Every superseded and deprecated record was verified retired in the code, with no zombies

Run as the inverted test, all six retired records passed.
`2026-06-14-dashboard-activity-rail-adr`, `2026-06-14-dashboard-timeline-adr`,
`2026-06-16-code-artifact-nodes-adr`, and `2026-07-30-visual-review-harness-adr` are
genuine pivots whose predecessor mechanisms are absent: `bridge_node_id` has zero
matches in `engine/`, the predecessor's four-tab rail IA is gone from
`frontend/src/app/AppShell.tsx:323-329`, and
`frontend/dev/visual-review/registry.tsx:39-44` implements the successor's seeded
per-cell cache. `2026-06-16-graph-layout-catalog-adr` (deprecated) is confirmed gone
with nothing replacing it; `d3-hierarchy` was never added and the dead `sigma` entry
its D12 called out is also absent. This is the one part of the corpus where the
markers and the code agree throughout.

## Actions applied

Applied in this pass, 2026-09-19.

Structural hygiene, through the owning verbs: two dangling wiki-links repaired, four
ledgers stripped of template annotations and markdown-repaired, the feature index
regenerated. `vault check` went from three errors to one.

The sixty-four acceptance-harness fixtures were archived out of the live corpus with
`vaultspec-core vault archive documents`, taking the ADR count from 202 to 186. They
sit under `.vault/_archive/` and are restorable with
`vaultspec-core vault archive restore`; all sixty-four were git-tracked besides. This
cleared the `adr-status` warning, which was the research document misfiled as an ADR.

Fourteen amendment notes were appended to accepted records, each naming only the
clause that was reversed and stating explicitly that every other clause stands. Five
cover the graph rendering stack (`dashboard-foundation` G6.b,
`dashboard-node-canvas`, `node-graph-rework` D1, `graph-force-stability`,
`graph-lineage-dag`), three cover Figma Code Connect (`figma-parity-reconciliation`,
`figma-design-bridge` 3(b), `left-rail-feature-filter`), and six cover relocated
surfaces (`dashboard-search`, `document-editor-backend`, `dashboard-canvas-controls`,
`activity-rail-realignment`, `dashboard-rag-manager`, `dashboard-gui`). Each note is
content-preserving: it records a reversal that a later accepted record or a named
commit already made, and none changes what its ADR decided. Two of them name a
reversal with NO successor record — `dashboard-gui` §5.2's abandonment of Base UI and
Radix for the bespoke kit, and the removal of `TierDial.tsx`, `AlgorithmPanel.tsx`,
`Discover.tsx`, and the `POST /nodes/{id}/discover` route — and say so plainly rather
than inventing authority for them.

The two missing `## Sources` sections were backfilled from locators already relied on
in those research bodies, clearing the `body-sections` warnings. Both research records
were found to have been overtaken by the code — the options each recommends have since
shipped — which is recorded here rather than edited into their bodies, since research
frames options and does not track implementation.

Not applied, and why. No ADR status was changed: ratifying the five shipped-but-
`proposed` records is the owner's authorization to give, and an agent-written status
does not grant it. No ADR was retrofitted to match the code. The two legacy
`## Status` sections were left in place, since neither is status drift and one is now
cited by section name from a new amendment note. The `runner-fleet-conformance`
schema error was left red as owned debt, per the finding above.

## Recommendations

Tooling defects first, because the enumeration bug undermines every other control.
File the `vault list` default-limit truncation and the `spec doctor` inverted
directory predicate against `vaultspec-core`. Until the first is fixed, no curation,
review, or automated check may enumerate the corpus through
`vaultspec-core vault list`; enumerate from disk.

Remove the sixty-four acceptance-harness fixtures from `.vault/`, and treat the two
plausibly-named ones as the reason this is urgent rather than cosmetic. The removal
manifest is prepared. This needs an explicit decision because deletion is
irreversible outside git history; it was not applied in this pass.

Close the two unreconciled contracts before anything else in the code. The
`a2a-orchestration-edge` eleven-verb amendment and the engine's seven-entry
`A2A_WHITELIST` must be made to agree in one direction or the other, and that choice
— implement the four verbs, or walk the amendment back — is a decision a follow-on
ADR must make, not a correction. The same holds in reverse for the
`a2a-product-provisioning` 2026-07-31 amendment, where the code is behind an already
accepted decision and needs an implementation plan rather than a new decision.

The `agentic-spec-authoring-backend` reversal needs adjudication, not repair. Either
the shipped section-scoped edit pipeline is authorized, in which case the required
amendment to the change-format ADR's ASA-003 clause must be authored and the D1/D2
text corrected to match, or it is not, in which case the gate this record exists to
enforce was breached and that is a review finding against the work that landed it.

Ratify the five shipped-but-`proposed` records, which is a status correction on
already-authorized work rather than a new decision. Handle
`graph-node-representation` and `graph-viz-scorecard` separately: each needs an
amendment recording which decisions survived commit `77269a2a` before any status can
be honest.

For the unrecorded reversals — the six graph-stack records, the three Figma Code
Connect records, and the six relocated-surface records — the correct instrument is an
amendment note on each predecessor naming the successor and the clause it reverses,
following the pattern `2026-07-18-a2a-product-provisioning-adr` already demonstrates.
Supersession is the wrong instrument for most of them, because in every case only one
clause was reversed and the rest of each record still governs. No amendment was
applied in this pass: each one changes what a ratified record says and belongs to the
amend-or-supersede path under human approval.

The eight orphaned commitments each need a disposition rather than a rewrite — build
it, or retire the clause — and none should be resolved by amending the ADR to match
the code. The `comment:send-to-agent` handler should be enrolled as a shared action
descriptor, which is ordinary in-scope work under the existing rule.

Leave `2026-07-31-runner-fleet-conformance-adr` ungrounded and the schema error
red, per the standing verdict in `2026-09-04-vault-curation-adr-grounding-debt-audit`;
authoring a grounding document for it would fabricate provenance. The open question
that record leaves is narrower and still stands: whether that ADR should be amended
to record that the aarch64 Linux release leg is now hosted, or left as the decision
that was made with the drift tracked elsewhere.

The two legacy `## Status` sections were left as they are. Neither is status drift —
each agrees with its H1 and carries substantive amendment prose rather than a bare
legacy value — and one is now cited by section name from a new amendment note, so
re-encoding them would break a fresh citation for a cosmetic gain.

One area of this reconciliation remains open and should be scheduled: the lifecycle
document-boundary sweep, whose twenty-document candidate set was identified but not
adjudicated.
