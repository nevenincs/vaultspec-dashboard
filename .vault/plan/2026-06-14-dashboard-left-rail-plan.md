---
tags:
  - '#plan'
  - '#dashboard-left-rail'
date: '2026-06-14'
modified: '2026-06-15'
tier: L2
related:
  - '[[2026-06-14-dashboard-left-rail-adr]]'
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
     Replace dashboard-left-rail with a kebab-case feature tag, e.g. #foo-bar.
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

# `dashboard-left-rail` plan

### Phase `P01` - Rail composition frame

Refactor the left aside into the ordered hosted-slot stack (workspace switcher then worktree switcher then browser region then in-rail filter), separated by soft 1px rules, preserving the collapse model and the single top-to-bottom focus order and applying attenuated-chrome tokens. EXECUTE THIS PLAN LAST: it hosts the workspace switcher and code mode the other two features build, and edits the same shared files.


<!-- One-line headline summary plan. -->

- [x] `P01.S01` - Refactor the left aside into the ordered hosted-slot stack separated by soft 1px rules; `frontend/src/app/AppShell.tsx`.
- [x] `P01.S02` - Preserve the collapse model and the single top-to-bottom focus order across the slots; `frontend/src/app/AppShell.tsx`.
- [x] `P01.S03` - Apply attenuated-chrome tokens so the rail cedes attention to the stage; `frontend/src/app/AppShell.tsx`.

### Phase `P02` - Browser mode toggle

Give the browser region two modes, vault (existing) and code (the code-tree feature's code mode), behind a compact keyboard-reachable toggle defaulting to vault; the chosen mode is view-local state re-keyed per scope and wired into the wholesale reset so it does not bleed across a swap.

- [x] `P02.S04` - Add a compact keyboard-reachable vault/code mode toggle to the browser region defaulting to vault; `frontend/src/app/left/`.
- [x] `P02.S05` - Render the vault browser and the code-tree code mode behind the toggle; `frontend/src/app/left/`.
- [x] `P02.S06` - Re-key the chosen mode per scope and wire it into the wholesale reset; `frontend/src/stores/view/`.

### Phase `P03` - In-rail filter

Add an optional filter affordance scoped to the active browser mode that narrows the already-fetched listing client-side by name, stem, or tag; it issues no wire request, clears on scope swap, and is visibly distinct from the global right-rail search pillar.

- [x] `P03.S07` - Add an in-rail filter scoped to the active browser mode that narrows the already-fetched listing client-side; `frontend/src/app/left/`.
- [x] `P03.S08` - Issue no wire request from the filter and clear it on scope swap; `frontend/src/app/left/`.
- [x] `P03.S09` - Make the filter visibly distinct from the global right-rail search pillar; `frontend/src/app/left/`.

### Phase `P04` - Read-only law, states, and a11y

Enforce the single rail navigation law (every interaction emits only scope-select, node-select, or view-affordance intent through stores; no fetch, no node-shape minting, no raw tiers read, no git/disk/vault mutation affordance), keep the git status badge read-only, render the uniform four honest states, and establish the rail-wide keyboard contract, labelled landmark, and reduced-motion behaviour.

- [x] `P04.S10` - Enforce that every rail interaction emits only scope-select, node-select, or view-affordance intent through stores; `frontend/src/app/left/`.
- [x] `P04.S11` - Keep the inline git status badge read-only with no mutation affordance anywhere in the rail; `frontend/src/app/left/WorktreePicker.tsx`.
- [x] `P04.S12` - Render the uniform four honest states across rail surfaces; `frontend/src/app/left/`.
- [x] `P04.S13` - Establish the rail-wide keyboard contract, labelled landmark, and reduced-motion and keyboard-instant behaviour; `frontend/src/app/AppShell.tsx`.

### Phase `P05` - Verification

Verify: the ordered rail stack renders with collapse and focus order, per-scope mode and filter reset with no cross-scope bleed, the read-only law has no escape hatch, and the feature-scoped lint, test, and vault-check gates pass.

- [x] `P05.S14` - Test that the ordered rail stack renders with collapse and focus order; `frontend/src/app/`.
- [x] `P05.S15` - Prove per-scope mode and filter reset with no cross-scope bleed; `frontend/src/stores/__adversarial__/`.
- [x] `P05.S16` - Prove the read-only law has no fetch or mutation escape hatch in the rail; `frontend/src/app/left/`.
- [x] `P05.S17` - Run the feature-scoped lint, test, and vault-check gates to green; `frontend/src/app/`.

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
