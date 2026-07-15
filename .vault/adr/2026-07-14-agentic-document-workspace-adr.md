---
tags:
  - '#adr'
  - '#agentic-document-workspace'
date: '2026-07-14'
modified: '2026-07-14'
related:
  - "[[2026-07-14-agentic-document-workspace-research]]"
  - "[[2026-07-14-agentic-document-offering-research]]"
  - "[[2026-07-14-agentic-document-offering-reference]]"
  - "[[2026-06-18-editor-dock-workspace-adr]]"
  - "[[2026-07-14-a2a-orchestration-edge-adr]]"
  - "[[2026-07-14-feature-group-authoring-adr]]"
---

# `agentic-document-workspace` adr: `Browse and Create as first-class central workspace modes` | (**status:** `proposed`)

## Problem Statement

The dashboard center is optimized for browsing: document tabs and the graph or timeline
share one dock. Agentic document generation has no dedicated product surface. The A2A
service can create and dispatch a thread from an initial message, team preset, feature
tag, and workspace root, but the dashboard does not expose that contract and the
accepted five-verb engine gateway is not implemented. A modal or narrow side panel
would leave the prompt subordinate to the graph and reproduce a form-driven workflow
for an interaction whose established grammar is conversation-first.

This decision introduces a first-class Create mode that replaces the visible browse
workspace with a conventional agent conversation and uses the existing adjacent
document surface when the agent produces a document.

This record amends the editor-dock-workspace composition by making its dock the Browse
branch of a higher workspace mode. It amends authoring-surface D5 and
feature-group-authoring D1 only in entry-point priority; their manual dialog and ledgered
create path stand. It composes with A2A-edge D1 through D6 and supersedes none of its
backend ownership or safety decisions.

## Considerations

- The existing `BrowserMode` already means vault versus code. Workspace mode must be a
  distinct state.
- The graph canvas is app-lifetime and portal-pinned. Create mode may hide it but cannot
  re-parent, remount, or destroy it.
- Manual feature-group creation remains a useful expert scaffold capability.
- A2A currently requires a `team_preset` to dispatch. Without one it creates a draft
  thread and does not execute. The team endpoint returns raw preset summaries, including
  mock presets, without offering eligibility or recommendation metadata.
- The dedicated execution target is **ADR Research**, backed by
  `vaultspec-adr-research`. Its four roles have heterogeneous model assignments, so a
  single model label would misrepresent execution.
- The current A2A create-thread request has no request-level model or provider override
  and no model-profile discovery or readiness endpoint. Model profile selection is a
  cross-repository contract gap, not frontend-owned state.
- The Create surface must adopt the established Codex and Claude grammar directly: a
  dominant rounded two-tier composer, prompt above, context and utilities on the lower
  left, execution and model-profile controls plus the primary action on the lower
  right, and project context adjacent or immediately below.
- Research followed by ADR generation remains agent behavior. The UI must not expose
  the `research_adr` topology or its phases.

## Considered options

- **Add an agent prompt to the create dialog.** Rejected: a modal cannot hold durable
  conversation, progress, documents, comments, and revision turns without conflating
  manual scaffolding with agent generation.
- **Add chat as a right-rail while the graph remains primary.** Rejected: the prompt
  remains secondary and generated documents lack enough working space.
- **Replace manual creation entirely.** Rejected: explicit scaffold creation is a
  distinct, complete expert capability.
- **Hide team and model selection behind inferred defaults.** Rejected: A2A does not
  dispatch without a team, and a heterogeneous team makes an undisclosed singular
  model choice false.
- **Add a top-level Browse | Create central mode with the standard composer.** Chosen:
  Browse remains unchanged while Create owns the visible center and carries deliberate
  launch context in the composer utility tier.

## Constraints

- Create mode preserves and restores open tabs, active tab, dock geometry, graph
  visibility preference, and corpus browser mode.
- Mode switching never destroys or re-parents the portal-pinned WebGL canvas.
- Only the mounted mode initiates mode-specific heavy reads or streams, subject to the
  app-lifetime canvas exception.
- Workspace mode is scope-bound and resets safely on workspace changes. An active run is
  durable and recoverable rather than owned by chrome state.
- Launch requires a non-empty prompt, target feature, eligible A2A execution team,
  workspace scope, and deliberately selected model profile. The primary action is
  disabled with a backend-served reason until every input is valid and eligibility is
  positive.
- The initial profile is **Team defaults**, with wire id `team-defaults`. Future A2A
  discovery serves selectable profiles, effective provider and capability for each
  role, availability, and eligibility. Figma may show this proposed control before the
  backend exists, but it must show unavailable or disabled launch state honestly.
- The team control exposes human offerings, not topology enums. It shows **ADR
  Research**, maps it to `vaultspec-adr-research`, filters mock and test presets, and
  consumes served eligibility and recommendation metadata.
- Workspace scope is read-only launch context. Feature selection maps to A2A
  `metadata.feature_tag`; it is not inferred from prompt text alone.
- Empty, focused, streaming, stopped, failed, retry, desktop, and compact behavior
  follows the approved Codex or Claude reference rather than being independently
  designed.
- The parent Dockview, canvas pin, tab store, authoring ledger, and A2A edge are stable.
  The missing engine gateway, frontend client, curated team discovery, model-profile
  contract, and generated-document source are new contract work.

## Implementation

**D1 - Add a distinct workspace mode.** The central workspace gains `browse | create`,
presented as **Browse | Create**. It is independent of vault/code browser mode and graph
visibility. Browse renders the current dock unchanged. Create renders a structural
Dockview surface while preserving Browse state for exact restoration.

**D2 - Use the established two-tier agent composer.** Create mode presents a
chronological conversation and one dominant rounded multiline composer. Its upper tier
is prompt text. Its lower tier places auxiliary and attached context on the left and
the execution-team control, model-profile control, and primary send or stop action on
the right. Active project and workspace context is adjacent or immediately below. The
empty state uses only the baseline instruction **Create a new architecture decision…**
and the composer; it adds no explanatory hero, workflow copy, document grid, agent
cards, or topology control.

**D3 - Preserve standard composer behavior.** The prompt auto-grows to a bounded
height, scrolls internally beyond that height, submits with Enter, inserts a newline
with Shift+Enter, and handles IME composition without accidental submission. Send
becomes stop while a turn is running. After the first turn, the composer remains
anchored below the conversation. Context, attachment, execution, model profile, and
primary action remain in the standard lower utility tier. Empty, disabled, focused,
streaming, stopped, failed, and retry behavior follows the selected Codex or Claude
reference, with only VaultSpec tokens substituted.

**D4 - Make launch context explicit without exposing topology.** A launch contains the
non-empty natural-language prompt, target feature, A2A execution team, workspace scope,
and model profile. Example prompts are **Create a new architecture decision**, **Write
a new ADR for `<feature>`**, and **Research `<feature>` and write an ADR**. The feature
control supplies `metadata.feature_tag`; workspace scope supplies the read-only
`metadata.workspace_root`; **ADR Research** supplies team preset
`vaultspec-adr-research`. The UI never exposes `research_adr` or its internal phase
machine.

**D5 - Add a served model-profile contract.** The selected value is a profile for the
whole heterogeneous team, not a singular model. **Team defaults** (`team-defaults`) is
the baseline explicit selection. The engine-facing A2A discovery contract must return
selectable profiles, effective per-role provider and capability mapping, availability,
and eligibility. The current A2A API cannot accept this field, so launch remains
unavailable until the gateway and A2A service can validate and honor it.

**D6 - Curate team discovery for the product surface.** The A2A team endpoint is a
source, not a directly renderable picker contract. The engine edge filters mock and
test presets and projects product label, preset id, eligibility, recommendation, and
unavailable reason. V1 exposes **ADR Research**; it does not render raw preset
descriptions, worker counts, or topology enums.

**D7 - Keep manual creation separate.** The current feature-group dialog remains the
manual scaffold path with its shared action, eligibility projection, links, and ledgered
write. Create mode receives its own shared action descriptor.

**D8 - Keep outputs in the existing document surface.** Generated documents enter
through the authoring ledger under the selected operation mode and open beside the
conversation using the established document-panel grammar. Create invents no output
cards, lifecycle labels, or alternate review workflow.

## Rationale

The selected mode makes the prompt proportionate to its role while preserving the
pinned canvas and persisted browse workspace. Codex and Claude establish the two-tier
composer as the principal interaction, including project or context affordances and a
deliberate model choice near the primary action. The A2A implementation shows why
VaultSpec must also expose team and model-profile intent honestly while keeping topology
private. Generated documents remain beside the conversation rather than inside a new
workflow dashboard.

## Consequences

- Users gain a standard agentic creation surface while the graph and manual authoring
  remain intact.
- Browse-layout restoration and canvas survival become acceptance criteria for every
  transition.
- The engine and frontend must add the A2A gateway, curated team and profile discovery,
  durable run recovery, and generated-document projections before launch is functional.
- Figma may specify the proposed team and model-profile controls before those contracts
  ship, but the primary action must be shown unavailable until served eligibility is
  positive.
- The standard composer gains VaultSpec-specific execution context without changing its
  established two-tier anatomy.
- The proposed model-profile contract requires coordinated changes in the dashboard and
  A2A repositories.
