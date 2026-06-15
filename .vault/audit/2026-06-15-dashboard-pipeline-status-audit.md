---
tags:
  - '#audit'
  - '#dashboard-pipeline-status'
date: '2026-06-15'
modified: '2026-06-15'
related:
  - "[[2026-06-14-dashboard-pipeline-status-adr]]"
  - "[[2026-06-14-dashboard-pipeline-wire-adr]]"
  - "[[2026-06-14-dashboard-activity-rail-adr]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #audit) and one feature tag.
     Replace dashboard-pipeline-status with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

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

## Recommendations

- F1: decide whether the structure parser should tolerate the older prose-phase and
  acceptance-checklist plan formats, or whether the step tree is intentionally
  canonical-only. If tolerance is wanted, scope it as an ADR (format inference carries
  mis-parse risk and is a feature decision, not a hardening hotfix). Until then, document
  the step-tree feature as requiring canonical plan structure; the surface already degrades
  honestly.
- F2: confirm the intended boundary - if the CLI document export is meant to be unbounded
  for local agent use, leave it and note the exception against the bounding rule; otherwise
  apply the same document ceiling to the CLI graph verb.
- F3: profile the engine ingest against a real corpus (the cross-reference resolution pass
  is the suspected hot path) and confirm the incremental re-index can skip the global
  rebuild when no edges change. Scope this under the graph-scale workstream, not review-rail.
- Carry the read-only scratch method forward: copy production vaults to scratch (engine
  writes a cache into `.vault/data/engine-data`, so in-place runs would touch production);
  the engine-data dir is not currently redirectable by configuration, which is itself a
  candidate hardening for safe production read-only operation.

## Codification candidates

<!-- Findings that satisfy the three durability criteria
(cross-session, constraint-shaped, project-bound) and should be
promoted into project-shared rules under `.vaultspec/rules/rules/`
via `vaultspec-core vault rule promote --from <this-audit-stem>
--as <rule-name>`.

Each candidate names the finding it derives from, the proposed
rule slug (kebab-case, naming the constraint's subject not the
failure), and a one-sentence statement of the rule.

Most audits produce zero codification candidates. Some produce one.
Only the rare framework-wide-pattern audit produces several. If
none of the findings above meet the bar, state that explicitly and
move on -- an empty Codification candidates section is a positive
signal, not a failure. -->

<!-- Example:

- **Source:** finding S04 (destructive verbs lack preview).
  **Rule slug:** `destructive-verbs-need-dry-run`.
  **Rule:** Every CLI verb that writes or removes state must
  accept `--dry-run` and emit a usable preview before applying.

-->
