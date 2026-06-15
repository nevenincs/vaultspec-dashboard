---
tags:
  - '#adr'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - "[[2026-06-14-dashboard-activity-rail-research]]"
  - "[[2026-06-14-dashboard-activity-rail-adr]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #adr) and one feature tag.
     Replace dashboard-pipeline-status with a kebab-case feature tag, e.g. #foo-bar.
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

# `dashboard-pipeline-status` adr: `in-flight pipeline status surface (Work tab)` | (**status:** `accepted`)

## Problem Statement

The review rail gains a new `work` tab (fixed by `dashboard-activity-rail`): the
plan/tasks pillar of the converged review-pane idiom, mapped onto the vaultspec pipeline.
This ADR pins **what that surface is** — the in-flight pipeline-status surface that answers
*what work is being worked on in the current workspace/branch*. It is the vaultspec analog
of Claude Code's Tasks window and Antigravity's agent plan view: a standing, persistent
view of the active ADRs and plans, with structure and progress, reviewable at a glance.

The need is concrete and currently unmet: the rail can show what *changed* (git) but
nothing shows what is *in flight* in the pipeline. The CLI's `vaultspec-core status`
already knows this (in-flight plans with wave/phase/step completion, recent ADRs), but the
GUI cannot — it is not on the engine wire as a pipeline surface. This ADR specifies the
frontend surface and the stores selector it consumes; the engine capability that feeds it
is the sibling `dashboard-pipeline-wire`. It is spec work and authorizes no engine change.

## Considerations

- **The unit of work is the artifact, not a conversation.** Unlike a chat-resident agent
  task list, vaultspec's in-flight unit is a *document* — an ADR with a status, or a plan
  with a tier and a wave→phase→step structure and per-step completion. The surface must
  present those artifacts as the tasks, and the pipeline arc
  (research→adr→plan→execute→review→codify) as the DAG/phase they sit in.
- **Partly derivable today, fully honest only with the wire.** A plan's done/total
  progress is already derivable from the existing `lifecycle.progress` on its doc node, so
  a *plan-level* progress ring could render against today's wire. But an ADR has no
  checkboxes, so its "in-flight" state is dishonest without the real `proposed`/`accepted`
  status, and the chosen v1 depth (the full step tree) needs plan-container/step entities
  that do not yet exist. The surface is therefore specified against the *target* wire and
  degrades honestly until each capability lands (research F3).
- **Layer ownership is absolute.** This is app chrome: it never fetches the engine, never
  reads the raw `tiers` block, never defines its own node shape. It consumes a stores
  selector and emits selection/navigation intent (open the plan's node on the stage, jump
  to a step's exec record) back through the existing selection seam. It is a projection
  over the one model, not a new model (`views-are-projections-of-one-model`).
- **Read-only, like the whole dashboard.** The surface observes the pipeline; it offers no
  affordance to check a step, advance a phase, change an ADR status, or run a pipeline
  verb. Those are CLI/agent actions filed upstream, never grown into the chrome
  (`engine-read-and-infer`). In time-travel mode the surface reflects the historical
  pipeline state and any (future) actions stay disabled, consistent with the timeline ADR.
- **Bounded by default.** "In flight in the current scope" is naturally small, but the
  step tree of a large L4 plan is not; the surface renders the wire's bounded interior and
  states truncation honestly rather than demanding the whole tree
  (`graph-queries-are-bounded-by-default`).
- **Grayscale-safe identity.** Progress, status, and tier all carry meaning by shape and
  text first — a progress ring reads as a fraction and a glyph, an ADR status reads as a
  word, a step reads as a checked/unchecked mark — with hue only as redundant
  reinforcement, legible at 14px (`icons-come-from-the-two-sanctioned-families`,
  `warmth-lives-in-tokens-not-decoration`).

## Constraints

- **Gated on `dashboard-pipeline-wire`.** The honest full surface needs three wire
  additions from the sibling ADR: frontmatter `status` for ADRs/plans, plan-container +
  step entities with completion, and a bounded pipeline projection (the "in-flight" list).
  Each is independently shippable, so the surface lights up incrementally: plan-level
  progress first (derivable today), ADR status next, the expandable step tree last.
- **Parent stability.** The stores query layer, the selection seam, the `tiers`-driven
  degradation pattern, the doc-node `lifecycle`/`doc_type`/`feature_tags`/`dates` fields,
  and the mock-mirrors-live discipline are all shipped and stable. No frontier risk on the
  frontend; the only immature dependency is the sibling wire, which this ADR treats as a
  staged unblock, not a hard prerequisite for the frame.
- **Mock fidelity.** The new selector's wire shape must be mirrored byte-for-byte in the
  mock engine and exercised through the same client path, or the surface passes tests and
  breaks live (`mock-mirrors-live-wire-shape`).

## Implementation

The `work` tab renders an **in-flight work list** over a single new stores selector
(call it the pipeline-status selector) that consumes the sibling wire's bounded pipeline
projection. Each row is an in-flight pipeline artifact in the active scope:

- **A plan row** shows: a progress ring (done/total steps) carrying the fraction as text
  and a fill arc as redundant hue; the plan title and tier (`L1`–`L4`); the current
  pipeline phase; and a freshness stamp. It expands into the **wave → phase → step tree**:
  each wave and phase carries its own rolled-up completion, each step a
  checked/unchecked mark and its heading, with the bounded-interior truncation stated
  honestly when a large plan exceeds the ceiling. Selecting a plan or step emits
  navigation intent — open the plan node on the stage, or jump to the step's exec record —
  through the existing selection seam.
- **An ADR row** shows: the ADR title, its real `status` (proposed / accepted / deprecated)
  as a word-first pill, its feature, and a freshness stamp. ADR rows do not expand a step
  tree (ADRs have no steps); they are leaves that select the ADR's node.
- **A pipeline-arc cue** renders the research→adr→plan→execute→review→codify arc compactly,
  positioning the current artifacts within it so the operator reads *where in the pipeline*
  the active work sits.

The surface is **standing**: with no selection it still shows the full in-flight list, and
empty (a clean branch with no active pipeline work) is a designed calm state ("no work in
flight on this branch"), never an error or an empty void. Its **degradation is read from
the `tiers` block via the stores selector**, never guessed from a transport error: when the
pipeline projection's tier is absent the surface renders a designed degraded state, and
each not-yet-shipped capability (step tree, ADR status) renders its own designed
placeholder rather than a broken control
(`degradation-is-read-from-tiers-not-guessed-from-errors`). Loading is a real pending
state tied to the query, not a perpetual spinner. The surface reflects time-travel: under
a historical playhead it shows the pipeline as it was, consistent with `dashboard-timeline`.

No new token, icon family, motion grammar, or theme is introduced; the surface consumes
the shared `:root` tier, the two sanctioned icon families, and the existing
animated-transitions grammar (rows fade in/out on add/remove with stable ids for object
constancy; keyboard-initiated actions and reduced-motion render instantly).

## Rationale

The plan/tasks pillar is the half of the converged idiom the rail was missing (research
F1, F2). Mapping it onto ADRs and plans rather than inventing a new task model is the
correct move because the pipeline *already is* a persistent, structured, cross-session
task system — the very thing Claude Code's Tasks update reached for by promoting ephemeral
to-dos into durable tasks. The artifacts are the tasks; the wave→phase→step tree is the
structure; the pipeline arc is the DAG. Building the surface against the target wire while
degrading honestly per capability lets the frame ship now and light up as the sibling wire
lands, rather than blocking the whole pillar on the largest piece (plan-container minting).
Keeping it strictly read-only and projection-only honors the engine boundary and the
layer-ownership law that already govern every other rail surface, so this surface inherits
the same honesty guarantees rather than re-deriving them (research F4).

## Consequences

- **Gain:** the operator sees in-flight pipeline work in the GUI for the first time —
  parity with `vaultspec-core status`, in the place the converged tools put it.
- **Gain:** the surface is a pure projection + dumb view, so it carries no new
  architecture and inherits the existing degradation, selection, and time-travel
  behaviours wholesale.
- **Cost / honesty:** the full surface is only as honest as the wire beneath it; until
  `dashboard-pipeline-wire` lands ADR status and the step tree, those parts render designed
  placeholders. This is staged truth, not a stub that lies.
- **Pitfall avoided:** the surface does not derive "in-flight ADR" from checkbox lifecycle
  (which is meaningless for ADRs) — it waits for the real status field, so it never reports
  a false pipeline state.
- **Pathway:** a standing, identity-bearing in-flight view over plan/step entities is the
  natural seam a future agent-orchestration layer reads to know *what is being worked on*;
  built read-only and projection-pure, it extends to that use unchanged.

## Codification candidates

<!-- The honesty laws this surface obeys (read degradation from tiers, project over one
model, read-and-infer) are already codified as project rules; this surface inherits them
rather than introducing a new durable constraint. No new codification candidate. -->

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
