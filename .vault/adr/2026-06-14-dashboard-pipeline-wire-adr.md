---
tags:
  - '#adr'
  - '#dashboard-pipeline-wire'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - "[[2026-06-14-dashboard-activity-rail-research]]"
  - "[[2026-06-14-dashboard-pipeline-status-adr]]"
  - "[[2026-06-14-dashboard-git-diff-browser-adr]]"
  - "[[2026-06-12-vaultspec-engine-adr]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #adr) and one feature tag.
     Replace dashboard-pipeline-wire with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     Status convention: the H1 status value is one of proposed, accepted,
     rejected, or deprecated. A new ADR starts as proposed; it moves to
     accepted or rejected when the decision is made, and to deprecated
     when a later ADR supersedes it.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `dashboard-pipeline-wire` adr: `pipeline and changes wire buildout (engine read-and-infer)` | (**status:** `accepted`)

## Problem Statement

The review rail's two new/blocked surfaces — the in-flight `work` tab
(`dashboard-pipeline-status`) and the per-file `changes` review
(`dashboard-git-diff-browser`) — both need engine capabilities that do not yet exist on
the wire. This ADR pins **the engine buildout** that feeds them, and does so within the
engine's read-and-infer fence so the additions never compromise the boundary that makes
the engine a swappable backbone.

Three gaps, established in research F3:

1. **In-flight pipeline projection.** There is no wire surface that answers "what plans
   and ADRs are in flight in this scope". The CLI knows; the engine does not expose it.
2. **Plan-container interior and ADR/plan frontmatter status.** Steps exist only as
   dead-end `MentionKind::StepId` edges, not entities with completion; ADR
   `proposed`/`accepted` status and plan tier are never extracted. The engine ADR
   (`2026-06-12-vaultspec-engine-adr` §4.3, D4.1) *anticipates* plan-container nodes that
   "open into waves/phases/steps with state" and lifecycle/progress projections — this ADR
   schedules that anticipated capability.
3. **Per-file git changes and diff.** `/status` serves only a `dirty` boolean; the diff
   browser's file list and diff body are engine-blocked. The engine must observe git
   per-file status, numstat, and unified diff without acquiring git-mutation semantics.

This is spec work for the engine layer; it authorizes the wire additions and pins their
shape and boundaries, but writes no code and plans no migration.

## Considerations

- **Read-and-infer is the hard fence.** Every addition here must observe, never mutate:
  the engine still never writes `.vault/`, never mutates git refs/trees/config, and never
  grows sibling control or search semantics (`engine-read-and-infer`). Plan-container
  minting is *inference over documents the engine reads* (the same class as the existing
  `lifecycle.progress` derivation), not authorship. Git per-file status and diff are
  *reads* of the working tree, surfaced as a transparent read-only pass-through, not
  staging/committing.
- **The git capability is a sibling pass-through, not engine git logic.** The contract's
  established seam for server-side operational reach is the namespaced `/ops/*`
  pass-through that forwards whitelisted sibling verbs verbatim (the model `/ops/core` and
  `/ops/rag` already follow). A **read-only `/ops/git` whitelist** (porcelain status,
  numstat, unified diff for a path) fits that seam exactly: the engine forwards a
  read-only git invocation and envelopes the result; it implements no diff algorithm and
  no git mutation verb. This keeps git semantics out of the engine core.
- **The pipeline projection is a projection over the one model.** "In flight" is derivable
  from graph nodes the engine already holds: `doc_type` plus a lifecycle/status facet,
  filtered to active artifacts in scope. Surfacing it as a bounded projection in the query
  layer (the same layer that already projects `/graph/query`, `/vault-tree`, `/events`)
  follows `views-are-projections-of-one-model`; it is not a new model.
- **Identity stability for steps is a contract event.** Minting plan-container and step
  entities introduces new node/edge ids; their stable keys are identity-bearing and must be
  composed only from what each entity *is* (plan stem + canonical wave/phase/step id),
  never from a resolution or rule outcome, so the GUI's cache/animation/time-travel by id
  does not break (`provenance-stable-keys-are-identity-bearing`). The engine ADR's
  W02P06-301 decision already reserved stable mention-target ids for exactly this arrival.
- **Bounded by default.** The step tree of a large L4 plan is a real payload; the
  plan-container interior must be served under a node ceiling with honest `truncated`
  reporting, and the in-flight projection bounded to active artifacts in scope, never an
  unbounded "all plans ever" (`graph-queries-are-bounded-by-default`).
- **Every response carries tiers, through the shared helper.** All new routes — pipeline
  projection, plan-container interior, `/ops/git` — must construct their envelopes through
  the shared API helper so success and error both carry the per-tier degradation block; no
  hand-built response bodies (`every-wire-response-carries-the-tiers-block`).
- **The mock must mirror these shapes.** Each new endpoint's exact wire shape (including the
  separate-array and default-parameter conventions the live origin uses) must be served by
  the mock engine and exercised through the same client path
  (`mock-mirrors-live-wire-shape`).

## Constraints

- **Three independently shippable capabilities, staged.** They can land in any order and
  the consuming surfaces degrade honestly without each: (a) ADR/plan frontmatter status
  extraction (smallest, unblocks honest ADR rows and plan tier); (b) the bounded in-flight
  pipeline projection (unblocks the Work list); (c) plan-container + step entities with
  completion served as a bounded interior (unblocks the step tree); plus (d) the read-only
  `/ops/git` whitelist (unblocks the Changes file list and diff body). This ADR fixes their
  shape and boundary; sequencing is the plan's job.
- **Parent stability.** The `/ops/*` pass-through seam, the shared envelope helper, the
  bounded-query machinery, the document ingest that already derives `lifecycle.progress`,
  and the stable-id discipline are all shipped and stable. The one genuinely new piece is
  plan-structure parsing (waves/phases/steps + frontmatter status); it is bounded,
  well-specified by the plan template's canonical identifiers, and explicitly anticipated
  by the engine ADR — low frontier risk, but the largest of the four.
- **No sibling semantics leak.** `/ops/git` forwards only read-only verbs; any write verb
  (stage, commit, checkout, discard) is out of whitelist by construction. The pipeline
  projection reads frontmatter and structure; it never edits documents to "normalize" them
  (that is the CLI's job, filed upstream per D5.3).

## Implementation

Four additive capabilities, all inside read-and-infer, all enveloped through the shared
helper with the tiers block:

- **Frontmatter status + tier extraction.** Document ingest additionally reads the ADR H1
  `status` (proposed / accepted / rejected / deprecated) and the plan `tier` (`L1`–`L4`),
  carrying them as facets on the doc node — the same class of query-time facet as the
  existing `lifecycle`, `doc_type`, `feature_tags`, and `dates`. This makes "in-flight ADR"
  honest (real status, not checkbox-guessed).
- **Bounded in-flight pipeline projection.** A new query-layer projection returns the
  active pipeline artifacts in the requested scope — plans whose lifecycle is active and
  ADRs by status — each with its progress summary, status/tier facet, pipeline phase, and
  stable node id, bounded to active artifacts and enveloped with tiers. It is a projection
  over the existing `LinkageGraph`, surfaced as a stores query, consumed by the Work
  surface.
- **Plan-container interior with step state.** Plan documents mint plan-container structure
  — waves → phases → steps as first-class but subordinate entities (the engine ADR's D4.1
  kind), each step bearing its completion (`- [x]`/`- [ ]`) and binding to its exec record
  where one exists. Served as a *bounded interior* of a plan node (like the existing node
  detail / neighbors interiors) under a node ceiling with honest `truncated` reporting.
  Entity stable keys are composed only from the plan stem and canonical wave/phase/step
  identifiers, so re-indexing never re-keys an existing step.
- **Read-only `/ops/git` pass-through.** A new namespaced whitelist forwards read-only git
  invocations — porcelain status (per-file `XY` state), numstat (`+adds`/`−dels` per file),
  and unified diff for a given path — returning the sibling output verbatim inside the
  envelope, exactly as `/ops/core` and `/ops/rag` forward their verbs. The engine
  implements no diff algorithm and exposes no mutating git verb. This unblocks the diff
  browser's changed-files list, per-file counts, and diff body.

Each capability is mirrored in the mock engine to the exact live shape and exercised
through the same client path the app uses.

## Rationale

The two consuming surfaces were specified against a wire that does not yet carry their
data; this ADR is the disciplined way to add that data without eroding the boundary that
gives the engine its value (research F3, F4). Routing git through a read-only `/ops/git`
pass-through rather than building git logic into the engine is the decisive choice: it
reuses the exact seam the contract already sanctions for sibling reach, so git semantics
stay in git and the engine stays read-and-infer. Surfacing in-flight work and plan
structure as bounded projections/interiors over the existing `LinkageGraph` — rather than a
new model or a CLI shell-out — is the same discipline that already governs every other
query surface, and it cashes in the plan-container capability the engine ADR explicitly
reserved (§4.3, D4.1, the W02P06-301 stable-id decision). Staging the four capabilities as
independent unblocks lets the consuming surfaces ship their frames now and light up
incrementally, rather than blocking the whole rail on the largest piece.

## Consequences

- **Gain:** the Work and Changes pillars get a real, honest, bounded wire — in-flight
  pipeline status and per-file diffs both become first-class GUI data without the engine
  leaving read-and-infer.
- **Gain:** plan-container/step entities are a reusable backbone — the timeline's lifecycle
  lane, the stage's plan nodes, and a future agent-orchestration layer all read the same
  step entities, not a one-off Work-tab shape.
- **Cost:** plan-structure parsing is new engine surface area to maintain against the plan
  template; it must track the canonical identifier scheme and stay bounded. Mirroring four
  new shapes in the mock is real test-fidelity work.
- **Pitfall avoided:** by forwarding only read-only git verbs and never minting a write
  path, the `/ops/git` seam cannot become the hole through which git-mutation semantics
  leak into the engine.
- **Pitfall avoided:** by composing step stable keys from identity-bearing fields only,
  re-indexing does not produce phantom remove/add churn in the GUI's diff clock.
- **Pathway:** `context(node)` over a plan now genuinely returns its interior, completing
  the engine ADR's "nodes are live lenses" promise and the orchestration-era seam.

## Codification candidates

<!-- The constraints this buildout must obey — read-and-infer, tiers on every response via
the shared helper, bounded queries, stable identity-bearing keys, mock mirrors live — are
each already codified as project rules; this ADR applies them rather than introducing a new
durable constraint. No new codification candidate; the read-only-`/ops/git`-only discipline
is a worked application of `engine-read-and-infer`, to be revisited for codification only if
it recurs across a future cycle. -->

<!-- If this decision introduces a durable cross-session constraint
that should bind future agents (an obligation, a prohibition, a
discipline that survives this feature's lifecycle), name it here as
a candidate for promotion into a project rule under
`.vaultspec/rules/rules/` via the codify pipeline phase.

Each candidate names the proposed rule slug (kebab-case, naming the
constraint's subject) and a one-sentence statement of the rule.

Not every ADR produces a codification candidate. Decisions that are
local to one feature, or that describe rather than constrain, leave
this section empty. An empty Codification candidates section is a
positive signal, not a failure. -->

<!-- Example:

- **Rule slug:** `destructive-verbs-need-dry-run`.
  **Rule:** Every CLI verb that writes or removes state must
  accept `--dry-run` and emit a usable preview before applying.

-->
