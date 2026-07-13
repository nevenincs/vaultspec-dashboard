---
tags:
  - '#audit'
  - '#vault-curation'
date: '2026-07-13'
modified: '2026-07-13'
related:
  - '[[2026-06-16-code-artifact-nodes-adr]]'
  - '[[2026-06-16-graph-force-stability-adr]]'
  - '[[2026-06-16-graph-layout-catalog-adr]]'
  - '[[2026-06-16-graph-lineage-dag-adr]]'
  - '[[2026-06-16-graph-semantic-embeddings-adr]]'
---

# `vault-curation` audit: `ADR-corpus semantic reconciliation — status encoding, cross-reference triage, orphan linkage`

## Scope

A semantic reconciliation sweep of the 138-ADR corpus and the code it governs, run
Ground -> Reconcile -> Act -> Verify. Mechanical hygiene (frontmatter, filenames,
markdown) was ceded to `vaultspec-core vault check all`; this pass reasons about meaning:
whether each flagged decision is implemented, superseded, or abandoned, and whether the
cross-reference and orphan flags name a real missing link or accepted historical debt.

Four fixable-debt classes were in scope: (1) five status-less ADRs; (2) 51 schema
cross-reference flags (23 errors + 28 warnings); (3) four orphan documents; (4) a
budget-bounded decision-vs-decision spot check of same-concept ADR clusters. Explicitly
out of scope and left for the orchestrator: the 15-entry modified-stamp treadmill, the
45 informational "ADR but no research" feature notes, and the dangling-link fix plus
feature-index rebuilds owned by a parallel lane.

Discovery led with `vaultspec-rag` semantic search over vault and code, confirmed by
whole-file reads and targeted grep. The semantic index was live (service running on
`8766`; degraded readiness from a CPU-only torch build did not block search).

## Findings

### status-less-adrs | medium | Five 2026-06-16 ADRs carried no parseable H1 status; all five encoded from code evidence

Five ADRs — `2026-06-16-code-artifact-nodes-adr`, `2026-06-16-graph-force-stability-adr`,
`2026-06-16-graph-layout-catalog-adr`, `2026-06-16-graph-lineage-dag-adr`, and
`2026-06-16-graph-semantic-embeddings-adr` — had a bare H1 with no status token and no
legacy `## Status` section. None carried a `superseded_by` edge. Their same-batch peers
(`2026-06-16-graph-node-representation-adr`, `2026-06-16-graph-viz-scorecard-adr`) use
both `proposed` and `accepted`, so these five simply never had a status line filled. Each
disposition below was established by reading the ADR whole and confirming against the
current code; the canonical backtick-quoted H1 token was then encoded and the modified
stamp refreshed per-feature.

- `graph-semantic-embeddings` -> **accepted**. Evidence: the decision (serve rag
  embeddings on a bounded `GET /graph/embeddings` route via direct Qdrant scroll) is
  implemented — `engine-query/src/embeddings.rs` exists, the route is wired in
  `vaultspec-api`, and `rag-client/src/vectors.rs` carries the `vault_collection_name`
  scroll path. The `rag-integration` project rule (RCR-003 exception) explicitly cites
  both the route and `vectors.rs` as live, governing surfaces.
- `graph-force-stability` -> **accepted**. Evidence: the incremental-reheat / held-alpha
  interaction / drag-to-pin decisions are implemented in the current three.js field —
  `reheatGentle`/`prewarmReflow` and the drag-to-pin branch live in
  `frontend/src/scene/three/d3ForceSolver.ts` and `.../threeField/field.ts`. The
  `graph` project rule encodes these principles verbatim ("Settled layout is
  pin-authoritative", named gentle reheat entry points). The ADR's own context states it
  "extends the prior ADR without contradicting it".
- `graph-lineage-dag` -> **accepted**. Evidence: the ADR's second headline — closing the
  engine derivation-labeling hole (it named `/graph/lineage` hardcoding `derivation:
  None`) — is implemented: `engine-query/src/lineage.rs` now serves `derivation` via
  `derivation_for_edge`, so the label flows end-to-end. Recorded caveat below: the
  frontend Sugiyama lineage-layout half was later removed in the three.js consolidation
  (decision-vs-code drift, not a status change).
- `graph-layout-catalog` -> **deprecated**. Evidence: the hierarchical / radial /
  community layout modules were never present as standalone files, and
  `frontend/src/scene/field/representationLayout.ts` states in its header that the
  "lineage / hierarchical / radial / community / temporal seed layouts and their gates
  and quality scorecard was removed" — the live three.js field renders connectivity only
  and no-ops `set-representation-mode`. The modes survive as accepted/normalized wire
  values that render nothing. Retired with no single successor ADR -> `deprecated`.
- `code-artifact-nodes` -> **proposed**. Evidence: the decision to mint `code:` nodes
  (`CanonicalKey::CodeArtifact`) was never implemented — zero `CodeArtifact` occurrences
  across `engine-graph/src`, and the feature has no plan, no exec, and no index. It was
  drafted and never ratified into code. A judgment-class relationship to a later accepted
  ADR is recorded below.

### decision-vs-code-drift-lineage | low | graph-lineage-dag's frontend Sugiyama half was retired though its engine contract governs

`graph-lineage-dag` decided both an engine change (derivation labeling, implemented and
live) and a frontend rebuild of the lineage mode as a full Sugiyama-layered layout. The
frontend graph was subsequently rewritten from the PixiJS `frontend/src/scene/field/`
substrate the ADR targeted to a three.js field, and the non-connectivity spatial layouts
(including lineage) were removed. The ADR's engine contract remains accepted and in force;
the frontend rendering it specified no longer applies. Reported as drift, not amended —
ADRs drive rollout, never the reverse.

### code-artifact-nodes-vs-codebase-graphing | low | A later accepted ADR addresses code-in-graph via a different mechanism

`code-artifact-nodes` (proposed, unimplemented) proposed minting `code:` nodes from
resolved Path/Symbol mentions into the vault graph. The later `2026-07-02-codebase-graphing-adr`
(accepted, delivered) instead builds a disconnected tree-sitter code-graph corpus. The two
target the same goal — navigable code in the graph — via different mechanisms. This is a
duplication/supersession candidate that needs author judgment (see Recommendations); it was
not auto-superseded, because the mechanisms differ and no supersession intent is recorded in
either document.

### timeline-adr-partial-supersession | low | dashboard-timeline 06-14 is deliberately deprecated with an in-prose partial-supersession pointer and no frontmatter edge

`2026-06-14-dashboard-timeline-adr` is `deprecated` and carries a prose blockquote
"Superseded (2026-06-15) by ... for its representation decisions only ... Every behavioral
invariant ... is re-affirmed unchanged by the successor and remains binding. This document
is retained for that invariant record." The author deliberately chose `deprecated` over
`superseded` because the replacement is partial and the behavioral invariants stay binding.
There is no `superseded_by` frontmatter edge, so the prose pointer to
`2026-06-15-dashboard-timeline-adr` is not machine-visible. Left as-is (auto-superseding
would misrepresent the partial/binding-invariant semantics); flagged for the author (see
Recommendations).

### same-feature-adr-clusters | low | The four same-feature ADR pairs are an umbrella epic or legitimate iterations, not duplications

The duplicate-feature scan surfaced four features with more than one ADR. None warrants a
mechanical supersede: `agentic-spec-authoring-backend` is an umbrella epic feature tag
carried by ~19 distinct-topic ADRs (its one internal supersession,
`agentic-document-chunk-management` -> `agentic-change-format-and-chunking`, is already
correctly encoded). `graph-representation` (`2026-06-14` + `2026-07-03`) — the newer adds
an emphasis-state grammar and explicitly extends the older's mode-vs-lens framework.
`graph-simulation-stability` (`2026-06-29` + `2026-07-03`) — the newer adds
convergence-gated anneal atop the older's freeze model. `dashboard-timeline` is the
partial-deprecation case above. The corpus's two supersession chains are both correctly
encoded; no unsafe propagation was applied.

### schema-cross-refs-historical-debt | medium | None of the 51 cross-reference flags are mechanically clearable; the pattern is legitimate reference-instead-of-research

The 23 errors and 28 warnings split into "Plan has no references to ADR" (8 plans) and
"ADR/Plan has no references to research" (43 docs). The check is doc-type-strict: it counts
only research-type links, confirmed empirically — `2026-07-11-universal-data-loading-adr`
and `2026-07-12-on-demand-cold-start-adr` already link their same-feature reference docs
yet remain flagged. The corpus legitimately uses a reference document in place of a research
document for many features, and many review/hardening plans have no research or ADR phase at
all. No same-feature research doc exists for any flagged item, and no same-feature ADR exists
for the eight review/hardening plans, so no flag is clearable by a true link. All 51 are
accepted historical debt. Three ADRs did have an existing-but-unlinked same-feature reference
sibling; those legitimate curation links were added (see Actions), though the type-strict
check still counts them.

Accepted-debt inventory (no linkable same-type sibling; would require fabrication to clear):

- Plan-has-no-ADR (8): `backend-hotpath-hardening`, `graph-query-scope-memo`,
  `codebase-graphing-review`, `keyboard-action-correctness-review`, `scene-render-review`,
  `state-render-review`, `test-infra-hardening`, `timeline-temporal-review` plans — each is
  a review/hardening plan with no authored ADR.
- ADR-has-no-research (12 with no reference either): `graph-backend-unification`,
  `dashboard-hardening`, `figma-naming-contract`, `global-state-review`, `rag-console-review`,
  `worktree-switcher-identity`, `document-editor-redesign`, `section-scoped-operations`,
  `universal-data-loading` (reference already linked), `on-demand-cold-start` (reference
  already linked), `touch-selectability`, `vault-tree-delta`.
- Plan-has-no-research (28): the reference-instead-of-research and review-sweep plans listed
  by the check; none has a same-feature research doc.

### orphans-linkable | medium | All four orphans had real siblings; all four linked

Every orphan resolved to a genuine same-domain sibling (evidence read in each document's
body), so all four were linked (see Actions) and the orphans check is now clean.

## Actions applied

- **Statuses encoded (5)**, canonical backtick-quoted H1 token, per the evidence above:
  `graph-semantic-embeddings` = accepted, `graph-force-stability` = accepted,
  `graph-lineage-dag` = accepted, `graph-layout-catalog` = deprecated,
  `code-artifact-nodes` = proposed. Modified stamps refreshed per-feature via scoped
  `vault check all --fix`; the adr-status check is now clean (5 -> 0).
- **Supersessions recorded: none.** The decision-vs-decision spot check found no
  mechanically-safe unpropagated supersession; the two existing chains were already correct.
- **Reference links added (3)**, each a same-feature reference doc that legitimately belongs
  in its ADR's related chain: `2026-06-16-figma-frontend-rewrite-adr` ->
  `...-reference`; `2026-06-22-action-surface-mapping-adr` -> `...-reference`;
  `2026-07-09-ledgered-edit-migration-adr` -> `...-reference`. These improve connectivity;
  the type-strict schema check still counts them (they add reference, not research, links).
- **Orphan links added (4)**: `2026-06-15-codebase-centralisation-audit` ->
  `2026-06-17-dashboard-state-centralization-adr` (same centralisation campaign);
  `2026-06-16-dashboard-backend-completion-research` ->
  `2026-06-16-missing-backend-inventory-research` (companion backend-gap research, named in
  its own body); `2026-06-19-figma-frontend-consolidation-research` ->
  `2026-06-16-figma-frontend-rewrite-adr` (the rewrite the drift inventory supports);
  `2026-06-27-figma-naming-contract-adr` -> `2026-06-16-figma-parity-reconciliation-adr`
  (the post-Code-Connect parity predecessor). Orphans check now clean (4 -> 0).

## Decisions applied

The three judgment-class items were decided by the user and applied in a follow-up pass;
each is recorded here as the durable record.

### applied-timeline-supersession-edge | resolved

`2026-06-14-dashboard-timeline-adr` was formalized as superseded by
`2026-06-15-dashboard-timeline-adr` via `vault adr supersede` — status flipped from
`deprecated` to `superseded`, `superseded_by` edge written, and the reciprocal `supersedes`
recorded on the successor. Rationale: a named successor exists, so a machine-visible edge is
correct; the partial-supersession nuance (representation decisions replaced, behavioral
invariants re-affirmed and still binding) remains fully stated in the existing prose
blockquote, which was already forward-written for supersession and reads coherently under the
new status — no substance rewrite was needed.

### applied-code-artifact-nodes-supersession | resolved

`2026-06-16-code-artifact-nodes-adr` (proposed, never implemented) was superseded by the
accepted `2026-07-02-codebase-graphing-adr` via `vault adr supersede` — status flipped from
`proposed` to `superseded`. Rationale: it was overtaken by a different accepted answer to the
same question (navigable code in the graph); supersession preserves the forward pointer to the
mechanism that shipped, where a bare rejection or lingering `proposed` would lose that trail.

### applied-review-plan-adr-policy | resolved

Policy accepted: review/hardening-sweep plans grounded in an audit or research document
instead of an ADR are legitimate standing practice — no retroactive anchor ADRs will be
authored for them. The 2026-07-02 review-sweep plans (`scene-render-review`,
`state-render-review`, `keyboard-action-correctness-review`, `timeline-temporal-review`,
`test-infra-hardening`, `codebase-graphing-review`) therefore keep their "Plan has no
references to ADR" schema flags as accepted historical debt by policy, not as fixable drift.

## Verification — final `vault check all` counts

Counts reflect the state after the three applied decisions above.

- `adr-status`: 5 -> **0** (all encoded; two were subsequently re-stated as `superseded` by
  the applied supersessions — `superseded` is a valid encoded status, so the check stays
  clean).
- `orphans`: 4 -> **0** (all linked).
- `dangling`: 1 -> **0** (resolved by the parallel lane).
- `schema`: 51 -> **51** (accepted historical debt; type-strict, not fabricated away — the
  supersessions did not touch any schema-flagged edge).
- `modified-stamp`: **14** (out-of-scope pre-existing treadmill; this pass added none — the
  edited/superseded ADRs were stamp-refreshed by their mutating verbs).
- `features`: 85 -> **67** (index rebuilds by the parallel lane plus this feature's own
  `vault-curation` index; remainder is the informational "ADR but no research" set, accepted).
- `structure`, `frontmatter`, `annotations`, `markdown`, `links`, `body-links`,
  `placeholders`, `references`, `encoding`: **0**.

Two supersession chains were added by the applied decisions:
`2026-06-14-dashboard-timeline-adr` -> `2026-06-15-dashboard-timeline-adr`, and
`2026-06-16-code-artifact-nodes-adr` -> `2026-07-02-codebase-graphing-adr`.
