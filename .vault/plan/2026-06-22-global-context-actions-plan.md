---
tags:
  - '#plan'
  - '#global-context-actions'
date: '2026-06-22'
modified: '2026-06-23'
tier: L2
related:
  - '[[2026-06-22-global-context-actions-adr]]'
  - '[[2026-06-22-global-context-actions-research]]'
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
     Replace global-context-actions with a kebab-case feature tag, e.g. #foo-bar.
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

# `global-context-actions` plan

### Phase `P01` - The global-tail seam and the terminal global section

Add the registry-side global-tail seam and a new terminal global section so a single registered action appends to every context menu, last, under its own divider, inheriting the time-travel gate (D1, D2).


<!-- One-line headline summary plan. -->

- [x] `P01.S01` - Add a terminal global section to ACTION_SECTION_ORDER and the ActionSection type; `frontend/src/platform/actions/action.ts`.
- [x] `P01.S02` - Add registerGlobalTailActions and invoke the tail inside resolveActions after the per-kind resolution and the time-travel filter; `frontend/src/platform/actions/registry.ts`.
- [x] `P01.S03` - Confirm the menu groups and renders the global section last under its own divider; `frontend/src/stores/view/contextMenu.ts`.
- [x] `P01.S04` - Test the seam: the global tail renders last, reaches every entity kind, and inherits the time-travel gate; `frontend/src/platform/actions/registry.test.ts`.
- [x] `P01.S05` - Gate P01: run eslint, prettier, and tsc on the touched files and the registry tests; `frontend/src/platform/actions/registry.ts`.

### Phase `P02` - Refresh as one shared action across palette and keymap

Extract the light Refresh into one shared ActionDescriptor keyed on reload:refresh-data, composed by the reload palette provider and a new keybinding with a non-Mod+R chord, guarded by the dual-plane coverage test (D4).

- [x] `P02.S06` - Extract the refreshDataAction shared builder keyed on reload:refresh-data composing refreshAllEngineQueries; `frontend/src/stores/view/reloadKeybindings.ts`.
- [x] `P02.S07` - Refactor the reload command provider to compose refreshDataAction instead of the inline command; `frontend/src/stores/view/commandProviders/reloadCommandProvider.ts`.
- [x] `P02.S08` - Add the reload KeybindingDef with a non-Mod+R chord plus its registerKeyAction thunk and mount the hook at the shell; `frontend/src/stores/view/reloadKeybindings.ts`.
- [x] `P02.S09` - Add reload:refresh-data to the dual-plane action-coverage guard; `frontend/src/stores/view/actionCoverage.guard.test.ts`.
- [x] `P02.S10` - Gate P02: run eslint, prettier, tsc, and the reload and coverage tests; `frontend/src/stores/view/commandProviders/reloadCommandProvider.ts`.

### Phase `P03` - Enroll Refresh into the global tail and verify end to end

Register the shared Refresh as the sole global-tail action under the global section, then verify it surfaces on the palette, the chord, and every context menu while the heavy rag-reindex stays out of the tail (D3, D5, D6).

- [x] `P03.S11` - Register refreshDataAction as the sole global-tail action under the global section; `frontend/src/app/menus/globalTail.ts`.
- [x] `P03.S12` - Wire the global-tail registration into the menu registration entry point; `frontend/src/app/menus/registerAll.ts`.
- [x] `P03.S13` - Verify end to end: every context menu surfaces Refresh, the palette and chord fire it, and rag-reindex stays out of the tail; `frontend/src/platform/actions/registry.test.ts`.
- [x] `P03.S14` - Gate P03: run the full frontend lint gate; `frontend/src/app/menus/globalTail.ts`.

## Description

This plan implements the global-context-actions ADR: a layered context-menu model where
bespoke per-kind menus (unchanged) gain a minimal GLOBAL TAIL holding one always-on verb,
Refresh. P01 adds the seam and the terminal `global` section so a single registered action
appends to every menu, last, under its own divider, inheriting the time-travel gate. P02
turns the light Refresh (the existing `refreshAllEngineQueries` sweep, today inline in the
reload palette command) into one shared `ActionDescriptor` keyed on `reload:refresh-data`,
composed by the palette provider and a new keymap binding with a non-`Mod+R` chord, guarded
by the dual-plane coverage test. P03 enrolls that shared Refresh as the sole global-tail
action and verifies it surfaces on the palette, the chord, and every context menu while the
heavy rag-reindex stays a confirm-guarded ops verb out of the tail.

The work binds to `unified-action-plane` (Refresh is authored once and composed across the
three planes, never copied per resolver) and
`keyboard-shortcuts-bind-through-the-one-keymap-registry` (the chord is a registry
`KeybindingDef`, not a private handler). New rail/timeline background menus are out of
scope (deferred follow-up); the existing graph canvas menu is untouched.

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

The three Phases are sequenced: P01 (the seam + the `global` section) is a hard
predecessor of P03 (which registers an action into that section), and P02 (the shared
Refresh action) is a hard predecessor of P03 (which enrolls it). P01 and P02 touch
disjoint files (the registry/section model versus the reload provider/keybindings) and
share no interdependency, so they may be executed in parallel; P03 joins them and must
follow both. Within each Phase, the gate Step is the hard successor of the others.

## Verification

- Seam (P01): the registry tests pass - the global tail renders as the last group under
  its own divider, a registered tail action appears for every entity kind, and a
  `disabledInTimeTravel` tail action is filtered in time-travel exactly as per-kind
  actions are.
- Shared Refresh (P02): `reload:refresh-data` is one `ActionDescriptor` built once and
  composed by the palette provider and the keymap binding; the `actionCoverage` dual-plane
  guard passes with the shared id present on both planes; the chord is a registry
  `KeybindingDef` (not `Mod+R`) and fires `refreshAllEngineQueries`.
- Tail enrollment (P03): every context menu (verified across kinds) surfaces Refresh in
  the `global` section; the palette command and the chord invoke the same builder; the
  heavy rag-reindex remains a confirm-guarded ops verb and is absent from the tail.
- Gate: `just dev lint frontend` is green (eslint, prettier, tsc, tokens) and the touched
  module tests pass at each Phase gate.
- The plan is complete when every Step is closed (`- [x]`).
