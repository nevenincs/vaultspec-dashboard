---
tags:
  - '#plan'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-14'
tier: L2
related:
  - '[[2026-06-14-dashboard-workspace-registry-adr]]'
  - '[[2026-06-14-dashboard-left-rail-research]]'
---

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the
       related: field above.
     - The related: field carries the AUTHORISING documents
       (ADR, research, reference, prior plan) for every Step in
       this plan. Steps inherit this chain; per-row reference
       footers do not exist.
     - NEVER use [[wiki-links]] or markdown links in the
       document body. -->

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #plan) and one feature tag.
     Replace dashboard-workspace-registry with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     tier is mandatory for new plans. Allowed: L1, L2, L3, L4.
     L1 = Steps only. L2 = Phases above Steps. L3 = Waves above
     Phases above Steps. L4 = Epic above Waves above Phases above
     Steps; PM association required. Pre-existing plans without this
     field default to L2.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'. The related field
     carries the AUTHORIZING documents (ADR, research, reference, prior
     plan) for every Step in this plan; Steps inherit this chain;
     per-row reference footers do not exist.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->


<!-- HIERARCHY AND TIERS:
     Epic > Wave > Phase > Step. Step is the canonical leaf-row
     noun. Execution Record artifact: <Step Record>.
     Tier is declared in frontmatter as tier: L1/L2/L3/L4
     (mandatory for new plans; pre-existing plans without the
     field default to L2 and the writer adds the field on first
     edit). The tier selects containers:
       L1 = Steps only.
       L2 = Phases above Steps.
       L3 = Waves above Phases above Steps.
       L4 = Epic above Waves above Phases above Steps; MUST declare
            a project-management association in the Epic intent
            block prose.
     Selection is by complexity criteria, not container counting.
     Writer never invents containers to qualify a tier. -->

<!-- IDENTIFIERS AND ROW CONTRACT:
     S##, P##, W## are flat, per-document, append-only, immutable.
     Promotion adds containers without renumbering. Gaps are not
     reused.
     Display paths are computed from current grouping:
       Step path:    L1 S##   L2 P##.S##   L3/L4 W##.P##.S##
       Phase heading:        L2 P##       L3/L4 W##.P##
       Wave heading:                      L3/L4 W##
     Row format:
       - [ ] `<display-path>` - imperative-verb action; `path/to/file`.
     Two-state checkboxes only ([ ] open, [x] closed). No per-row
     reference footers; wiki-links and markdown links are forbidden
     in plan body. Authorizing documents go in the plan's `related:`
     frontmatter once.
     ASCII spaced hyphens everywhere; em-dash (U+2014) and en-dash
     (U+2013) are forbidden. Step rows within a Phase are
     contiguous. -->

<!-- NO COMPRESSION:
     N self-similar actions = N rows. Never collapse into "for each
     X, do Y" / "across all callers, do Z" / "in every module,
     replace W". The rule applies at every tier including L1. -->

<!-- VAULTSPEC-CORE VAULT PLAN CLI:
     The `vaultspec-core vault plan` CLI is the canonical surface for
     structural manipulation of this plan document. Writers and
     executors MUST use `vaultspec-core vault plan step add/insert/move/
     remove/check/uncheck/toggle/edit`,
     `vaultspec-core vault plan phase add/move/remove/edit`,
     `vaultspec-core vault plan wave add/move/remove/edit`,
     `vaultspec-core vault plan epic intent`, and
     `vaultspec-core vault plan tier promote/demote` for every
     identifier-affecting change rather than hand-editing the row
     grammar. Hand edits are tolerated by the parser but flagged by
     `vaultspec-core vault plan check`; canonical-identifier preservation is
     guaranteed only when the CLI performs the mutation. Run
     `vaultspec-core vault plan --help` for the full subcommand
     surface. -->

# `dashboard-workspace-registry` plan

### Phase `P01` - Backend registry and persistence

Persist the workspace registry in the vaultspec-session orchestration crate: an ordered set of project roots (stable id from the git common dir, label, reachability), auto-registering the launch workspace, stored best-effort in user-state.sqlite3. Read-only: registering never mutates a repository.


<!-- One-line headline summary plan. -->

- [x] `P01.S01` - Define the WorkspaceRoot record and registry schema (stable id from git common dir, label, path, reachability); `engine/crates/vaultspec-session/src/schema.rs`.
- [x] `P01.S02` - Implement the durable workspace-registry table with best-effort open-or-heal in the user-state store; `engine/crates/vaultspec-session/src/store.rs`.
- [x] `P01.S03` - Auto-register the launch workspace as the first root on first run; `engine/crates/vaultspec-session/src/lib.rs`.
- [x] `P01.S04` - Implement read-only add, forget, and select-active registry operations that never mutate a repository; `engine/crates/vaultspec-session/src/session.rs`.
- [x] `P01.S05` - Roundtrip-test registry persistence and corrupt-store recreation; `engine/crates/vaultspec-session/tests/`.

### Phase `P02` - Wire surface

Expose the registry on the wire: GET /workspaces, an optional workspace= parameter on /map (default active, single-workspace behaviour unchanged), and an active_workspace field on /session. Registry add/forget route through the user-state config surface, never the read-only graph API or the /ops proxy. Mirror the live shape in the mock.

- [x] `P02.S06` - Add the GET /workspaces route returning id, label, path, launch-default marker, reachability, and the tiers block; `engine/crates/vaultspec-api/src/routes/registry.rs`.
- [x] `P02.S07` - Add the optional workspace= parameter to /map defaulting to the active workspace with unchanged single-workspace behaviour; `engine/crates/vaultspec-api/src/routes/registry.rs`.
- [x] `P02.S08` - Add the active_workspace field and its PUT handling to the session endpoint; `engine/crates/vaultspec-api/src/routes/session.rs`.
- [x] `P02.S09` - Route registry add and forget through the user-state config surface, not the graph API or the ops proxy; `engine/crates/vaultspec-api/src/routes/session.rs`.
- [x] `P02.S10` - Mirror the /workspaces and extended /map and /session shapes in the frontend mock fixtures; `frontend/src/stores/server/`.

### Phase `P03` - Scope routing across workspaces

Route scope across workspaces: validate_scope resolves a worktree against the active workspace's enumerable worktrees; warm scope cells may belong to any registered reachable workspace; each scope keeps its own monotonic delta clock so SSE resume stays correct.

- [ ] `P03.S11` - Change validate_scope to resolve a worktree against the active workspace's enumerable worktrees; `engine/crates/vaultspec-api/src/app.rs`.
- [ ] `P03.S12` - Let warm scope cells belong to any registered reachable workspace while preserving per-scope delta clocks; `engine/crates/vaultspec-session/src/session.rs`.

### Phase `P04` - Frontend workspace switcher

Host the workspace switcher above the worktree switcher in the left rail: a stores query over /workspaces, a picker that renders as a quiet header when only one root exists, an add-a-project affordance with an honest validation refusal, and a workspace-level wholesale reset (the full 022 reset plus clearing the cached worktree set) owned by the stores layer.

- [ ] `P04.S13` - Add a stores query hook for /workspaces and the active-workspace selector; `frontend/src/stores/server/`.
- [ ] `P04.S14` - Widen the wholesale scope reset to also clear the cached worktree set on a workspace swap; `frontend/src/stores/view/`.
- [ ] `P04.S15` - Author the WorkspacePicker rendering roots, launch-default and unreachable markers, and the add-a-project affordance; `frontend/src/app/left/WorkspacePicker.tsx`.
- [ ] `P04.S16` - Host the workspace switcher above the worktree switcher and render it as a quiet header when only one root exists; `frontend/src/app/AppShell.tsx`.

### Phase `P05` - Verification

Verify: extend the scope-isolation tests to workspace swaps (no cross-project bleed), roundtrip the registry persistence, prove the four honest states, and pass the feature-scoped lint, test, and vault-check gates.

- [ ] `P05.S17` - Extend the scope-isolation adversarial tests to cover workspace swaps with no cross-project state bleed; `frontend/src/stores/__adversarial__/`.
- [ ] `P05.S18` - Test the WorkspacePicker four honest states and the add-a-project validation refusal; `frontend/src/app/left/WorkspacePicker.render.test.tsx`.
- [ ] `P05.S19` - Run the feature-scoped lint, test, and vault-check gates to green; `engine/crates/vaultspec-session/`.

## Description

<!-- Briefly describe the proposed work. Reference `{adr}`s,
`{research}`, `{reference}`. Supporting documentation must be read prior to
writing the plan document. -->

## Steps

<!-- The plan's tier (declared in frontmatter as `tier: L1`, `L2`, `L3`, or
`L4`) determines the structure under this section:

- `L1`: a flat list of Step rows (no Phase, Wave, or Epic).
- `L2`: one or more `### Phase` blocks each containing Step rows.
- `L3`: one or more `## Wave` blocks each containing Phase blocks.
- `L4`: a `## Epic intent` block, followed by Wave blocks. -->

<!-- Replace this scaffold with the tier-appropriate structure for your plan.
Format examples for each block type are embedded below as commented
templates. -->

<!-- IMPORTANT: This document must be updated between execution runs to
     track progress. -->

<!-- PHASE BLOCK FORMAT (L2, L3, L4):
     ### Phase `P02` - rewrite the writer-agent contract

     One sentence stating what this Phase delivers.

     - [ ] `P02.S01` - imperative-verb action; `path/to/file`.
     - [ ] `P02.S02` - imperative-verb action; `path/to/file`.

     At L3/L4 the Phase heading uses the ancestor-aware path
     (### Phase `W01.P02` - ...). The intent sentence is mandatory. -->

<!-- WAVE BLOCK FORMAT (L3, L4):
     ## Wave `W01` - language-only convention rollout

     One paragraph stating what this Wave delivers, which downstream
     Wave depends on it, and which authorizing documents back it.

     ### Phase `W01.P01` - ...
     ### Phase `W01.P02` - ...

     The Wave intent paragraph is mandatory. -->

<!-- EPIC INTENT BLOCK FORMAT (L4 only):
     ## Epic intent

     One paragraph stating the strategic goal, the external project-
     management association (milestone name, project board identifier,
     roadmap entry), the timeline horizon, and the teams or agents
     involved.

     ## Wave `W01` - ...
     ## Wave `W02` - ...

     The ## Epic intent block is mandatory at L4 and absent at L1, L2,
     L3. The plan title (the level-one # heading at the top of the
     document) is the Epic title; no separate Epic heading is emitted. -->

## Parallelization

<!-- State which Steps, Phases, or Waves can be executed in parallel and
which carry hard ordering. At `L1` and `L2`, parallelism is decided
per-Step or per-Phase. At `L3` and `L4`, Waves are sequenced by
default (one Wave must land before the next can begin); Phases
within a single Wave may be parallelized when they share no hard
interdependency. -->

## Verification

<!-- State the mission success criteria for this plan. Each criterion
should be a verifiable check (test passes, surface conforms,
reviewer signs off) rather than a free-form assertion.

The plan is complete when every Step in the plan is closed
(`- [x]`). At `L4`, the Epic-completion check additionally requires
the declared project-management association to report the Epic
complete.

For tier-specific verification cadence, see the authorizing
documents linked in the `related:` frontmatter. -->
