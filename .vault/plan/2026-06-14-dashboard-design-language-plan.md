---
tags:
  - '#plan'
  - '#dashboard-design-language'
date: '2026-06-14'
modified: '2026-07-12'
tier: L2
related:
  - '[[2026-06-14-dashboard-design-language-adr]]'
  - '[[2026-06-14-dashboard-iconography-adr]]'
  - '[[2026-06-14-dashboard-design-language-research]]'
---

# `dashboard-design-language` plan

### Phase `P01` - Foundations

Establish the base UI language and iconography that every surface ADR inherits.

- [x] `P01.S01` - Pin the base UI design language; `.vault/adr/2026-06-14-dashboard-design-language-adr.md`.
- [x] `P01.S02` - Adopt the icon frameworks (Lucide chrome, Phosphor domain); `.vault/adr/2026-06-14-dashboard-iconography-adr.md`.

### Phase `P02` - Shell and navigation

Specify the shell chrome and navigation surfaces: sidebar, navigation controls, command palette, and search.

- [x] `P02.S03` - Author and review the ADR for the sidebar surface; `.vault/adr/2026-06-14-dashboard-sidebar-adr.md`.
- [x] `P02.S04` - Author and review the ADR for the navigation controls; `.vault/adr/2026-06-14-dashboard-nav-controls-adr.md`.
- [x] `P02.S05` - Author and review the ADR for the command palette; `.vault/adr/2026-06-14-dashboard-command-palette-adr.md`.
- [x] `P02.S06` - Author and review the ADR for the search surface; `.vault/adr/2026-06-14-dashboard-search-adr.md`.

### Phase `P03` - Node canvas

Specify the node-canvas browser, its controls, and the minimap.

- [x] `P03.S07` - Author and review the ADR for the node canvas browser; `.vault/adr/2026-06-14-dashboard-node-canvas-adr.md`.
- [x] `P03.S08` - Author and review the ADR for the node canvas controls; `.vault/adr/2026-06-14-dashboard-canvas-controls-adr.md`.
- [x] `P03.S09` - Author and review the ADR for the minimap; `.vault/adr/2026-06-14-dashboard-minimap-adr.md`.

### Phase `P04` - Temporal and git

Specify the timeline, the git diff browser, and the worktree switcher.

- [x] `P04.S10` - Author and review the ADR for the timeline; `.vault/adr/2026-06-14-dashboard-timeline-adr.md`.
- [x] `P04.S11` - Author and review the ADR for the git diff browser; `.vault/adr/2026-06-14-dashboard-git-diff-browser-adr.md`.
- [x] `P04.S12` - Author and review the ADR for the worktree switcher; `.vault/adr/2026-06-14-dashboard-worktree-switcher-adr.md`.

### Phase `P05` - RAG surfaces

Specify the rag server manager and the rag search controller.

- [x] `P05.S13` - Author and review the ADR for the rag server manager; `.vault/adr/2026-06-14-dashboard-rag-manager-adr.md`.
- [x] `P05.S14` - Author and review the ADR for the rag search controller; `.vault/adr/2026-06-14-dashboard-rag-search-adr.md`.

## Description

This plan tracks the dashboard UI/UX recodification campaign: the ADR backend that
specifies every visual surface of the dashboard. It is spec work, not a coding effort;
each Step delivers one Architecture Decision Record, not an implementation. The campaign
is grounded in the accepted base design-language ADR and the accepted iconography ADR,
and every surface ADR inherits both: the convergent agentic-desktop register (clean,
modern, reactive, dark and light as peers), the OKLCH token model with token-level
warmth, and the Lucide-chrome / Phosphor-domain icon split.

Each surface ADR defines that surface's scope, behaviour, and UI/UX requirements -
including its states (loading, empty, degraded, error), its keyboard and accessibility
contract, its place in the four-layer ownership map, and how it projects over the one
model rather than fetching its own data. Surfaces already exist in code under
`frontend/src/app/` and `frontend/src/scene/`, and most are described in the prior
`dashboard-gui` ADR; surface ADRs therefore build on that grounding, commissioning
targeted research only where coverage is thin (the rag manager and controller, and the
git diff browser). Per the agreed cadence, ADRs are drafted and then reviewed by review
subagents rather than approved one at a time by the user.

Phase `P01` (foundations) is complete: both the base design-language ADR and the
iconography ADR are accepted. Phases `P02` through `P05` carry the per-surface ADRs.

## Steps

## Parallelization

Phase `P01` is the hard prerequisite for everything else: the base design-language and
iconography ADRs must be accepted before any surface ADR can inherit them, and both are
now closed. Beyond `P01`, the surface ADRs are mutually independent - each specifies a
distinct surface - so Phases `P02` through `P05` and the Steps within them carry no hard
ordering and may be drafted in parallel. The grouping into phases is for coherence and
review batching, not sequencing. The only soft dependencies to honor: the command palette
and search ADRs (`P02.S05`, `P02.S06`) should reference the navigation model, and the node
canvas controls and minimap ADRs (`P03.S08`, `P03.S09`) should reference the node canvas
browser ADR (`P03.S07`); drafting the referenced ADR first within each pair is preferred
but not blocking.

## Verification

The plan is complete when every Step is closed. A Step is closed only when its surface
ADR satisfies all of the following verifiable checks:

- The ADR is scaffolded through the CLI and validates: `vaultspec-core vault check all`
  reports references clean and no schema errors for the ADR, and its feature index is
  generated.
- The ADR explicitly inherits the base design-language ADR and the iconography ADR in its
  `related:` frontmatter, and its body conforms to that language (it introduces no new
  ground/mood, color architecture, type, motion, or icon source).
- The ADR defines the surface's scope, behaviour, and UI/UX requirements, and names that
  surface's states (loading, empty, degraded, error), its keyboard and accessibility
  contract, and its place in the four-layer ownership map (which layer owns it, what it
  consumes, what intent it emits).
- The ADR honors the standing product invariants: views project over the one model rather
  than fetching, graph reads stay bounded, every wire response carries the tiers block,
  time-travel mode honesty is preserved, and the stores-layer state-isolation invariants
  are respected.
- A review subagent has reviewed the ADR and its verdict is recorded, with any required
  revisions landed before the Step is checked.
