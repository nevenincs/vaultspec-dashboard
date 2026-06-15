---
tags:
  - '#adr'
  - '#dashboard-activity-rail'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - "[[2026-06-14-dashboard-activity-rail-research]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #adr) and one feature tag.
     Replace dashboard-activity-rail with a kebab-case feature tag, e.g. #foo-bar.
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

# `dashboard-activity-rail` adr: `right activity rail information architecture` | (**status:** `accepted`)

## Problem Statement

The dashboard's right-hand rail is the rightmost of the four regions framed by
`AppShell.tsx` (left scope rail, center stage, right activity rail, bottom timeline).
Today it is the "Activity" rail: 20rem expanded, 2.5rem collapsed, carrying three tabs —
`now`, `changes`, `search`. Each of its *sub-surfaces* is already specified by an accepted
ADR (`dashboard-rag-manager` for the status rollup and ops cluster,
`dashboard-git-diff-browser` for the changes overview and diff view, `dashboard-search`
and `dashboard-rag-search` for the search tab and its controller). What has never had an
ADR is the **rail container itself**: its tab set, the law for what earns a tab, the
collapse behaviour, and how the surfaces compose.

This matters now because the brief re-scopes the rail into the surface the converged
agentic-development tools call the *review pane* — the place answering *what work is in
flight* and *what has changed*. The industry idiom (Antigravity 2.0's Review Changes,
Cursor's review pane, Claude Code's Tasks window) is consistently **two distinct pillars**:
a plan/tasks surface and a changed-files/diff surface. The current rail has the changes
pillar but **no surface for in-flight ADRs and plans** — it can show what changed in git,
but not what is being worked on in the pipeline. This ADR pins the rail's information
architecture so the new pillar lands as a first-class tab rather than being wedged into an
existing one, and so the rail's tab law is settled for future surfaces. It is spec work;
it decides the rail's IA and authorizes no implementation beyond the tab the IA adds.

## Considerations

- **The two-pillar idiom maps cleanly onto vaultspec.** The plan/tasks pillar is the
  pipeline's unit of work — in-flight ADRs and plans, with waves/phases/steps as the task
  tree. The changes pillar is the git working tree — the material evidence advancing that
  work. They are tightly related but conceptually distinct: one is *intent and progress*,
  the other is *diff and evidence*. Blending them under one label conflates two questions
  the operator asks separately.
- **Four regions, settled boundaries.** The rail is app chrome under
  `dashboard-layer-ownership`: it reads stores selectors only, never fetches the engine,
  never reads the raw `tiers` block, and emits selection/navigation intent back. The IA
  does not touch those boundaries; it only decides how chrome surfaces are grouped into
  tabs.
- **Tab cost is real.** A 20rem rail with compact labels comfortably carries four tabs;
  beyond that the strip crowds and labels truncate. The tab law must therefore be a
  scarcity discipline, not an open registry.
- **Selection-driven vs standing surfaces.** Some surfaces are *standing* (status, ops,
  the work list, the changes list — always meaningful). The Inspector is
  *selection-driven* (meaningful only when a node/edge/event is selected). The IA must
  place the selection-driven surface where it does not steal a standing tab.
- **Inherited language is fixed.** The base design-language, iconography, theme, and
  motion ADRs are settled; this rail introduces no new token, icon family, or motion
  grammar. Tab affordances reuse the existing tablist pattern already in `AppShell.tsx`.

## Constraints

- **Depends on two sibling ADRs for the new tab's content.** This ADR pins *that* the
  rail gains a `work` tab and *where* it sits; the tab's content is specified by
  `dashboard-pipeline-status`, and the engine capability that feeds it by
  `dashboard-pipeline-wire`. Those are stable, co-authored siblings in this same cycle;
  the rail IA can land its frame and tab strip independent of their completion, rendering
  the `work` tab's own designed degraded state until the wire arrives.
- **Parent stability.** The four-region frame, the tablist pattern, the collapse model,
  and the layer-ownership boundary are all shipped and stable
  (`2026-06-12-dashboard-foundation-reference`, the accepted sibling surface ADRs). No
  frontier risk; this is a re-statement plus one additive tab.
- **No engine dependency for the frame itself.** The rail container, the collapse toggle,
  and the four-tab strip carry no wire dependency; only the `work` tab's *content* is
  gated on the pipeline wire.

## Implementation

The rail is re-stated as the **review rail** with a **four-tab** information architecture.
The tabs, in order, are `now`, `work`, `changes`, `search`:

- **`now` — the live instrument.** Unchanged in membership: the status rollup
  (`NowStrip`), the ops cluster (`OpsPanel`), and the selection-driven `Inspector`. This
  is the always-on liveness pillar. The Inspector stays here as the selection-driven
  surface so it never consumes a standing tab; selecting a node surfaces its detail under
  `now`.
- **`work` — the in-flight pipeline pillar (new).** The plan/tasks surface: the active
  ADRs and plans in the current scope, each with a progress ring and pipeline phase, a
  plan expandable into its wave → phase → step tree with per-step completion, and a
  compact pipeline-arc cue (research→adr→plan→execute→review→codify). Its content,
  states, and degradation are specified by `dashboard-pipeline-status`; this ADR fixes its
  existence, position (second, between live status and material changes), and label.
- **`changes` — the material review pillar.** Unchanged in ownership: the git status
  header, the changed-files list, and the focused diff, as specified by
  `dashboard-git-diff-browser`. The pipeline-wire ADR unblocks its per-file list and diff
  body.
- **`search` — discovery.** Unchanged: the semantic/text search consumer, per
  `dashboard-search`.

The **tab law** (the scarcity discipline): a surface earns a standing tab only if it is
(1) *standing* — meaningful without a prior selection — and (2) a distinct operator
*question* not already answered by an existing tab. Selection-driven detail (the
Inspector) lives under the tab whose context produced the selection, never as its own tab.
Ops and verb access that are *lifted* (the command palette) are not rail tabs. This law is
what keeps the rail at four tabs and prevents every future surface from minting a fifth.

The **collapse and composition** behaviour is unchanged: the rail collapses to a 2.5rem
spine via the existing view-store toggle; the active tab is local rail state; each tab's
content scrolls independently within the rail's fixed frame; the tab strip uses the
existing `role="tablist"` affordance with `aria-selected` and keyboard tab order already
present in `AppShell.tsx`.

The rail is renamed in intent from "Activity" to the **review rail** to match the
converged idiom, while its header label and collapse affordance keep their current form.

## Rationale

The two-pillar split is the single most consistent finding across the converged tools
(research F1): they keep the plan/tasks surface separate from the diff-review surface
because they answer different questions. Folding in-flight ADRs/plans into the existing
`changes` tab (the considered minimal-churn alternative) would conflate *what is being
worked on* with *what changed in git* under one label, which is exactly the conflation the
industry idiom avoids and which the operator confirmed against. A unified single "review"
tab (the considered three-tab alternative) was rejected for the same reason and because it
forces both pillars to share one scroll, hurting the density each needs.

Placing `work` second — between `now` (liveness) and `changes` (evidence) — reads as a
left-to-right narrowing of attention: *is the system healthy → what am I working on → what
did it change → find something*. Keeping the Inspector under `now` rather than promoting it
to a tab honors the tab law (selection-driven, not standing) and avoids a fifth tab. The
rail-level ADR exists at all because the sub-surfaces were each specified in isolation and
the *container's* IA was never decided; codifying the tab law now prevents the next surface
from being wedged in ad hoc (research F2, F5).

## Consequences

- **Gain:** the rail gains the missing pillar — the operator can finally see in-flight
  pipeline work where the converged tools put it, and the rail's tab set has a written law
  rather than an accreted history.
- **Gain:** the `work` tab frame can ship immediately against its own designed degraded
  state, decoupled from the engine buildout; the wire lights it up incrementally.
- **Cost:** four tabs is the comfortable ceiling for a 20rem rail; the tab law makes that
  a deliberate constraint, which means a genuinely new standing question in future will
  force a real IA decision (a sub-tab, a lifted surface, or a wider rail) rather than a
  cheap fifth tab. That is intended friction.
- **Pitfall avoided:** the Inspector is not promoted to a tab, so selecting a node does not
  silently change which standing surfaces are reachable.
- **Pathway:** with the rail IA settled, the pipeline-status surface and the pipeline-wire
  buildout (the two sibling ADRs) have a fixed home to land into, and the changes pillar's
  long-blocked per-file/diff capability is unblocked by the same wire.

## Codification candidates

- **Rule slug:** `right-rail-tabs-earn-their-place`.
  **Rule:** A right-rail surface earns a standing tab only if it is meaningful without a
  prior selection *and* answers a distinct operator question no existing tab answers;
  selection-driven detail lives under the tab whose context produced the selection, and
  lifted/command surfaces are never rail tabs. (Candidate only — promote after the tab law
  has held across at least one new-surface cycle, per the codify discipline; first
  encounter is not yet a rule.)

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
