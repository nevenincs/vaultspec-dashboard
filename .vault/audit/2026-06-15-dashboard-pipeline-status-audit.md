---
tags:
  - '#audit'
  - '#dashboard-pipeline-status'
date: '2026-06-15'
modified: '2026-07-12'
related:
  - "[[2026-06-14-dashboard-pipeline-status-adr]]"
  - "[[2026-06-14-dashboard-pipeline-wire-adr]]"
  - "[[2026-06-14-dashboard-activity-rail-adr]]"
---

# `dashboard-pipeline-status` audit: `production-data hardening verification`

## Scope

A hardening pass verifying the review-rail implementation (the activity-rail four-tab
IA, the in-flight pipeline-status surface, and the pipeline-and-changes engine wire)
against LIVE production-like vaults, to confirm it is performant, handles the production
environment, and is functional. The production corpora are the real vaultspec project
vaults under the `Y:` code root; they are treated as read-only.

Method honoring read-only: two production corpora were copied to a scratch location and
all engine work ran against the COPIES; production was never written (verified after the
run by the production engine cache mtimes, which predate the campaign by two days). The
release engine binary was driven via its one-shot CLI verbs and via the resident `serve`
HTTP front door. Corpora: the `aeat` project vault at 7176 documents (scale, larger than
the prior 4000-document scale-hardening benchmark) and the `vaultspec-core` vault at 750
documents (framework-representative). Both were made throwaway git repositories in scratch
so the git tier and the read-only git pass-through were exercisable.

## Findings

VERDICT: the review-rail implementation is verified against production data - robust,
performant on the resident query path, correctly bounded, and functional. No defects in
the review-rail surfaces. Two non-blocking findings concern the broader engine and a
by-design format dependence.

PASS - Robustness. Zero panics or unexpected errors across the full CLI + HTTP battery on
the 7176-document corpus. The only degradations observed were designed: the `declared`
tier (the `vaultspec-core` core-graph subprocess) reported unavailable as an honest tiers
state when the scope was not yet recognized, while the engine's own structural/temporal/
semantic ingest still produced the graph. Every error envelope carried the tiers block.

PASS - Resident query performance (the path the GUI actually hits, warm cache, 7176 docs):
in-flight pipeline projection 12 ms (404 active artifacts, 174 KB); plan-container interior
2.7 ms; read-only git status pass-through 71 ms; feature-LOD constellation (the GUI default
view) 110 ms / 316 KB; vault-tree 100 ms; filters 39 ms. The new review-rail endpoints are
the fastest surfaces measured.

PASS - Bounded-by-default on the wire. The `/graph/query` document granularity returned
HTTP 200 capped at the 5000-node ceiling with an honest `truncated` block (returned 5000 of
17800 total), an 8.4 MB payload settling in ~0.97 s. The HTTP front door enforces the
document ceiling exactly as the bounding rule requires.

PASS - Functional on canonical data. The in-flight projection enumerated 404 active
artifacts (active plans plus proposed/accepted ADRs). The plan-container interior rendered
the full wave/phase/step tree for a canonical plan - real step action text, completion
state, and stable identity-bearing ids (`plan:{stem}/P01/S01`) - tier-honest (an L2 plan
returned phases and steps, no waves).

F1 - MEDIUM (by-design limitation, not a defect). The plan-container interior returns an
honest empty tree for plans NOT authored in the canonical wave/phase/step structure with
backtick canonical-id step rows. Production plans are mixed: roughly 53% of the aeat plans
and 24% of the vaultspec-core plans use the canonical step-row format; the remainder use
older prose-phase headings (`### Phase 1 - Title`) and acceptance-checklist steps, for which
the structure parser mints no containers. The lifecycle progress ring still shows the raw
checkbox count, and the surface degrades to a designed-empty interior rather than crashing,
so behaviour is honest - but the headline step-tree feature is unavailable for the
older-format share of real plans.

F2 - LOW (pre-existing, outside review-rail; by-design for the local front door). The CLI
`graph --granularity document` verb serializes an UNBOUNDED document slice (71 MB on the
7176-document corpus) - the document ceiling is applied only on the HTTP route, not the
local CLI export. The GUI-facing wire is correctly bounded; the CLI is a local agent-facing
export, so this is defensible, but it is worth an explicit decision since the bounding rule
is phrased about engine front doors generally.

F3 - PERF (pre-existing engine ingest, outside review-rail). The cold graph build is the
one scale cost: ~24-40 s for the 7176-document corpus (one-time at resident startup or on a
one-shot CLI verb), and a CLI incremental re-index still ~22 s because the global graph
build re-runs regardless of the per-document content-hash skip. This is heavier than the
synthetic 4000-document / 2.1 s scale-hardening benchmark; real production documents carry
far denser cross-references, so per-document resolution work dominates. Resident query
latency after the build is unaffected (see the performance findings).

F3 RESOLUTION (profiled 2026-06-15, `VAULTSPEC_INDEX_TIMING=1`). The 24-40 s figure was
largely SHARED-BATTERY CONTENTION (concurrent agents building and indexing on the same
host), not an engine defect. An uncontended cold structural index of the 7176-document
corpus is ~6-9 s, with the phase breakdown read+extract ~0.1-3 s (varies with OS file
cache), resolver-built ~0.2 s (the O(N) resolver-once fix holds - no super-linear
regression), pass-1 node-upsert+mint+cache ~1.6 s, the parallel resolve-batch ~4 s
(the dominant phase, already parallelized across cores), pass-2 edge ingest ~0.2 s, and
exec-binding ~0.05 s. The declared tier adds ~6 s for the external `vaultspec-core
vault graph --ref HEAD` subprocess, which the serve path already defers to an async fold
(the resident dashboard is queryable on the structural tier first, "declared tier
building"). Conclusion: no algorithmic regression and no proportionate engine-side perf
fix; the cost centres are an already-parallel resolve and an external, already-deferred
subprocess. No code change for F3 beyond confirming the characterization.

PASS - End-to-end browser verification (C, 2026-06-15). The built dashboard SPA was served
single-origin by the engine (`VAULTSPEC_SPA_DIR`) over the aeat 7176-document production
copy and driven in a real browser. The shell bootstrapped with the injected token; the
four-tab review rail (now / work / changes / search) rendered; the Work tab showed the
"work pipeline status" region with "404 in-flight items", real plan rows with progress
rings ("0 of 18 steps complete - modelo-inventory plan (#108)", and other real aeat plans),
and real ADR rows with their frontmatter status pills ("status: accepted"); the left vault
browser listed the real aeat corpus. No console errors, no error-boundary text, 563
interactive elements on first paint. The A fix manifests in the UI: the legacy
modelo-inventory plan shows its 18-step count (matching both the lifecycle progress ring
and the plan-interior projection). The review-rail surfaces are confirmed functional in a
real browser against live production data, not only under the mock.

## Recommendations

- F1: decide whether the structure parser should tolerate the older prose-phase and
  acceptance-checklist plan formats, or whether the step tree is intentionally
  canonical-only. If tolerance is wanted, scope it as an ADR (format inference carries
  mis-parse risk and is a feature decision, not a hardening hotfix). Until then, document
  the step-tree feature as requiring canonical plan structure; the surface already degrades
  honestly.
- F2: RESOLVED. The document ceiling and slice-bounding moved into `engine_query::graph`
  so EVERY front door bounds identically; the CLI `graph --granularity document` verb now
  applies the 5000-node ceiling with an honest `truncated` block (was 71 MB unbounded).
  Landed in `d67fd21`.
- F3: RESOLVED (profiled; see the F3 RESOLUTION above). No engine-side perf fix is
  warranted - the inflated figure was shared-battery contention, the ingest is linear with
  the dominant phases already parallel or deferred. A future incremental-graph-patch (so a
  single file change need not rebuild the global graph) remains a graph-scale-workstream
  opportunity, not a review-rail concern.
- Carry the read-only scratch method forward: copy production vaults to scratch (engine
  writes a cache into `.vault/data/engine-data`, so in-place runs would touch production);
  the engine-data dir is not currently redirectable by configuration, which is itself a
  candidate hardening for safe production read-only operation.

## Codification candidates
