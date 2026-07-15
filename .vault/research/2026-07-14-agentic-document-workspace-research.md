---
tags:
  - '#research'
  - '#agentic-document-workspace'
date: '2026-07-14'
modified: '2026-07-14'
related:
  - "[[2026-07-14-agentic-document-offering-research]]"
  - "[[2026-07-14-agentic-document-offering-reference]]"
---

# `agentic-document-workspace` research: `central Browse and Create workspace modes`

This focused decision research evaluates where the agentic document offering belongs,
which established agent-composer grammar binds it, and how its launch inputs map to the
actual A2A service.

## Findings

The current center can support an exclusive Create mode. `DockWorkspace` already
reconciles structural graph and document panels, while `GraphCanvasHost` remains an
app-lifetime sibling. The safe seam is a structural Create panel inside Dockview, not an
`AppShell` branch, overlay, re-parent, or graph remount
(`frontend/src/app/stage/DockWorkspace.tsx:349-439`,
`frontend/src/app/stage/GraphCanvasHost.tsx:23-71`).

The existing `BrowserMode` means vault versus code corpus browsing. The new state must
be an independent central workspace mode presented as **Browse | Create**
(`frontend/src/stores/view/browserMode.ts:23-53`). It must preserve open documents,
active tab, dock geometry, graph visibility preference, and browser corpus mode while
reconciling browse panels out so hidden observers unmount.

The feature-group dialog is a manual scaffold path, not an agent surface. It creates an
empty document through a two-stage form and does not start an agent
(`frontend/src/app/left/CreateDocDialog.tsx:124-430`). It remains a separate expert
path.

### The actual A2A launch contract is narrower than the accepted future edge

Today, A2A creates work through `POST /api/threads`. The request accepts
`initial_message`, optional `team_preset`, and metadata containing `feature_tag` and an
absolute `workspace_root`. A thread without `team_preset` is persisted as a draft and
is not dispatched. `GET /api/teams` can populate a team picker, but it returns raw
preset summaries, exposes topology and worker count, includes mock presets, and carries
no product eligibility or recommendation metadata.

The dedicated preset `vaultspec-adr-research` describes four roles: researcher,
synthesist, ADR author, and document reviewer. Their assignments are heterogeneous:
the first three use Claude at different capabilities while the reviewer uses Zhipu.
The `research_adr` topology and authoring bridge are active uncommitted work. The
committed topology enum does not yet admit the preset, and the in-progress phase gate
defines a proposal-submitter seam without a concrete wiring path. The accepted future
run-start/status/cancel/preset-list/service-state gateway is not implemented in the
dashboard.

The viable launch contract is therefore explicit and fail-closed: non-empty prompt,
target feature, workspace scope, execution team, and model profile. **ADR Research** is
the human label for `vaultspec-adr-research`; topology stays private. Workspace is
read-only context. Feature maps to `metadata.feature_tag`.

### A model profile is required, but not implemented

A2A has no request-level model or provider override and no endpoint that discovers
selectable models, effective role assignments, readiness, or eligibility. A singular
model picker would also be false because the selected team uses several role-specific
assignments. The UI therefore needs a model **profile** selector. Its first explicit
value is **Team defaults** (`team-defaults`). The future backend must serve selectable
profiles, their effective per-role provider and capability mapping, availability, and
eligibility. Figma may show the proposed control before this backend exists, but launch
must remain disabled or unavailable until eligibility is positive.

### Codex and Claude define the visual grammar

Official first-party guidance establishes the benchmark:

- Codex puts environment or project selection in the prompt composer and supplies
  starter tasks rather than an explanatory workflow surface:
  https://help.openai.com/en/articles/11390924
- OpenAI places the current model picker directly in the web message composer:
  https://help.openai.com/en/articles/6825453-chatgpt-release-notes
- Claude places its model selector below the text input, uses a lower-left `+` for
  context and commands, and submits from the same composer:
  https://support.claude.com/en/articles/8114491-get-started-with-claude
- Claude Code on the web asks for repository context and a natural-language task before
  starting remote execution:
  https://support.claude.com/en/articles/12618689-claude-code-on-the-web

The invariant is a dominant rounded two-tier composer: prompt text above; auxiliary and
attached context on the lower left; model or execution choice and the primary action on
the lower right; project or workspace context adjacent or immediately below. VaultSpec
must preserve that grammar and add its required team execution target in the same
utility tier. It must not add a hero explanation, workflow description, topology
diagram, document cards, or a separate setup form.

The baseline language is direct: **Create a new architecture decision…** Supporting
examples may say **Write a new ADR for `<feature>`** or **Research `<feature>` and write
an ADR**. The prompt expresses intent while the feature, team, workspace, and model
profile controls make execution context deliberate.

## Recommendation

Add an additive Browse/Create decision. Browse preserves the current dock and graph
contract. Create owns the visible center, keeps the pinned canvas mounted but hidden,
and presents the Codex/Claude two-tier composer. Its lower tier exposes **ADR Research**
and the deliberate **Team defaults** profile alongside the primary action, while
feature and workspace context remain adjacent. Curate A2A discovery rather than
rendering raw presets, and keep send unavailable until all backend-served launch
eligibility is positive.
