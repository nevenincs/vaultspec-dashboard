---
tags:
  - '#research'
  - '#agentic-document-offering'
date: '2026-07-14'
modified: '2026-07-14'
related:
  - "[[2026-07-14-a2a-orchestration-edge-adr]]"
  - "[[2026-07-12-authoring-surface-adr]]"
  - "[[2026-07-14-feature-group-authoring-adr]]"
---

# `agentic-document-offering` research: `a creation-mode workspace and comment-driven agent revision loop`

The dashboard has the backend and most document primitives required for agentic
authoring, but its product interaction model still exposes manual scaffolding and
proposal governance as the visible workflow. This research decides how the central
workspace and existing comments plane should become the primary document-generation
experience without weakening the authoring ledger, policy, or apply-time safety
contracts.

## Findings

### The center can support an exclusive Create mode

The desktop center is one dock workspace containing document panels and the
portal-pinned graph or timeline panel. The graph can already disappear while document
tabs fill the center (`frontend/src/app/AppShell.tsx:274`,
`frontend/src/app/stage/DockWorkspace.tsx:349-430`). The existing `BrowserMode` means
the `vault | code` corpus switch (`frontend/src/stores/view/browserMode.ts:23-53`). The
new user-facing **Browse | Create** state must therefore be a separate workspace mode,
not another `BrowserMode` value.

The graph cannot be unmounted or re-parented during the swap. `GraphCanvasHost` owns the
app-lifetime `Stage`, hides it with `display:none`, and preserves the WebGL context while
its placeholder is absent (`frontend/src/app/stage/GraphCanvasHost.tsx:1-76`). Create
mode must reuse that visibility contract and preserve browser tabs and layout for exact
restoration.

### Manual creation is a scaffold path, not the agent offering

`CreateDocDialog` is a two-step feature and document form
(`frontend/src/app/left/CreateDocDialog.tsx:390-430`). The accepted feature-group
decision rejected a one-click empty Research plus ADR wizard because downstream
documents digest upstream content (`.vault/adr/2026-07-14-feature-group-authoring-adr.md:61-65`).
That rejection does not apply to an agent workflow that performs research first and
writes an ADR from its findings.

The existing dialog should remain the manual document path. Create mode is a distinct
surface. A natural-language ADR request may perform Research followed by ADR generation
internally, but the interface must not expose that pipeline as setup UI.

### The live A2A service and the accepted future gateway are different contracts

The accepted A2A edge proposes `run-start`, status, cancel, preset-list, and
service-state (`.vault/adr/2026-07-14-a2a-orchestration-edge-adr.md:102-109`), but that
engine gateway is not implemented. The live A2A service instead creates work through
`POST /api/threads` with `initial_message`, optional `team_preset`, and metadata holding
`feature_tag` and absolute `workspace_root`. No preset means the thread is created but
not dispatched. `GET /api/teams` returns raw preset summaries, including mock presets,
without product eligibility or recommendation metadata.

The dedicated `vaultspec-adr-research` preset defines four heterogeneous roles and the
`research_adr` phase machine. That topology and authoring bridge remain active
uncommitted work, and the proposal-submitter seam is not wired. A dashboard surface
must therefore distinguish proposed controls from currently executable capabilities.

The launch contract requires a non-empty prompt, target feature, execution team,
workspace scope, and deliberate model profile. **ADR Research** maps to
`vaultspec-adr-research`; workspace is read-only context; feature maps to
`metadata.feature_tag`. The current A2A API has no request-level model/provider
override or discovery/readiness endpoint, so the model control must represent a team
profile and remain unavailable until a served contract exists.

### Durable comments are implemented, but only as heading notes

Comments already live in the authoring-state store with actor, timestamps, resolution
state, exact-or-orphaned anchor handling, and bounded document reads. The accepted
decision restricts them to heading sections
(`.vault/adr/2026-07-12-authoring-surface-adr.md:84-87`,
`.vault/adr/2026-07-12-authoring-surface-adr.md:106-118`). The frontend wire shape
carries heading path, advisory range hint, and content hash
(`frontend/src/stores/server/authoringComments.ts:41-48`).

The accepted section-operation decision supplies the exact-selection precedent:
structural section anchor, base-relative byte or line hint, expected selected-content
hash, and atomic expected-old-bytes hunks that conflict instead of relocating fuzzily
(`.vault/adr/2026-07-11-section-scoped-operations-adr.md:44-48`). Comment anchors can
extend this model without making line numbers identity-bearing. No code path currently
snapshots comments into an authoring prompt turn or A2A run.

### Codex and Claude establish a two-tier composer with execution context

Current first-party product documentation converges on one interaction grammar:

- Codex places environment or project selection in the prompt composer and offers
  starter tasks rather than a workflow explanation:
  https://help.openai.com/en/articles/11390924
- OpenAI places its current web model picker directly in the message composer:
  https://help.openai.com/en/articles/6825453-chatgpt-release-notes
- Claude places the model below the text input, provides context and commands through a
  lower-left `+`, and submits from the same composer:
  https://support.claude.com/en/articles/8114491-get-started-with-claude
- Claude Code on the web combines repository context with a natural-language task
  before remote execution:
  https://support.claude.com/en/articles/12618689-claude-code-on-the-web
- ChatGPT Canvas supports chat-driven edits, direct document editing, highlighted
  selection instructions, block comments, inline suggestions, apply, and version
  restoration: https://help.openai.com/en/articles/9930697-what-is-the-canvas-feature-in-chatgpt-and-how-do-i-use-i
- Claude Artifacts renders content beside chat, supports selection-based editing and
  version switching, and batches pending edit requests into the next message:
  https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them
- Notion Agent uses the current page by default, narrows context to selected blocks,
  and accepts additional page or source context in the composer:
  https://www.notion.com/help/notion-agent
- GitHub agents accept prompts and comment-driven iteration. GitHub recommends batching
  comments so an agent does not act before the reviewer finishes the set:
  https://docs.github.com/en/copilot/concepts/agents/about-third-party-coding-agents and
  https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/commenting-on-a-pull-request

The invariant is a dominant rounded two-tier composer. Prompt text occupies the upper
tier. Auxiliary and attached context sit on the lower left; model or execution choices
and the primary action sit on the lower right. Project and workspace context is adjacent
or immediately below. The composer persists below the transcript after submission.
VaultSpec adds its deliberate team execution target in that same utility tier; it does
not invent a setup form or expose a topology enum.

The empty state uses direct language—**Create a new architecture decision…**—without
an explanatory hero or workflow copy. Supporting prompts may say **Write a new ADR for
`<feature>`** or **Research `<feature>` and write an ADR**. The target feature, **ADR
Research** team, read-only workspace, and **Team defaults** model profile remain
explicit launch context rather than being guessed from the prompt.

When a document exists, it occupies the adjacent document surface. Selected text,
annotations, and pending comments become attached context for the next ordinary
message. The solved pattern is not one approval card per thought and not a separate
revision workflow.

### Comment iteration and approval governance are separate planes

The accepted approval contract binds authorization to an exact proposal revision, base
revisions, validation digest, and policy version; proposal changes make approval stale
(`.vault/adr/2026-06-29-agentic-approval-gates-review-state-adr.md:70-93`). The review
station owns conflicts, destructive-operation gates, clarification, after-the-fact
acknowledgement, and rollback
(`.vault/adr/2026-06-29-agentic-review-station-state-adr.md:56-87`).

Comments cannot replace those contracts, but governance should stop defining the
principal authoring experience. Document plus comments plus the standard conversation
becomes the creation and revision plane. Approvals remains the governance and safety plane for
policy gates, destructive operations, stale or conflicted proposals, rollback, audit,
and exceptional intervention. Context-native keep or publish actions may invoke the
same backend-served eligibility but must not create a second lifecycle.

This narrowly amends the A2A-edge consequence saying no new review UI is needed
(`.vault/adr/2026-07-14-a2a-orchestration-edge-adr.md:191-195`): no duplicate review
station is added, but the primary document surface gains contextual iteration.

### Recommendation

Adopt two additive decisions:

- A central **Browse | Create** workspace mode. Create replaces the visible browse
  workspace with the Codex/Claude two-tier composer, preserves the browser layout and
  pinned canvas, and launches only when prompt, feature, workspace, **ADR Research**
  team, and a served model profile are valid and eligible. It does not expose pipeline
  or topology UI.
- A batched feedback-turn model. Users leave document-, section-, or
  selection-anchored comments. Pending comments attach to the next ordinary composer
  message and the backend snapshots them as a bounded batch. The agent returns a new
  document revision and never silently resolves human comments.

The engine edge must curate team discovery by filtering mock and test presets and
serving product label, recommendation, eligibility, and unavailable reason. A new A2A
model-profile contract must serve selectable profiles and effective per-role mappings;
`team-defaults` is the baseline. Figma may show the proposed controls before these
contracts ship, but the send action must be unavailable until eligibility is positive.

Every feedback batch must bound comment count, individual and total comment bytes,
selected-preimage bytes, total context bytes, and retained history. V1 remains
single-principal. Confidence is high because both the product anatomy and a maintained
official references and the live cross-repository contracts are explicit.
