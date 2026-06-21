---
tags:
  - '#plan'
  - '#command-palette-architecture'
date: '2026-06-21'
modified: '2026-06-22'
tier: L3
related:
  - '[[2026-06-21-command-palette-architecture-research]]'
  - '[[2026-06-21-command-palette-providers-adr]]'
  - '[[2026-06-21-command-palette-planes-adr]]'
  - '[[2026-06-21-command-palette-actions-adr]]'
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
     Replace command-palette-architecture with a kebab-case feature tag, e.g. #foo-bar.
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

# `command-palette-architecture` plan

## Wave `W01` - contribution registry foundation

Build the command-provider registry, migrate the hand-rolled builders onto it, and fence corpus data out of the command plane. Foundation for every later wave; authorized by the command-palette-providers ADR.

### Phase `W01.P01` - command-provider registry module

Build the pure provider registry, the CommandContext snapshot, and the generic host with central gating.

- [x] `W01.P01.S01` - define the CommandDescriptor and CommandContext types; `frontend/src/stores/view/commandRegistry.ts`.
- [x] `W01.P01.S02` - implement registerCommandProvider and resolveCommands with central gating; `frontend/src/stores/view/commandRegistry.ts`.
- [x] `W01.P01.S03` - unit-test registration, disposer, gating, and the bounded cap; `frontend/src/stores/view/commandRegistry.test.ts`.

### Phase `W01.P02` - migrate builders to providers and consume the registry

Re-express each hand-rolled builder as a registered provider and refactor the assembly hook to call the host.

- [x] `W01.P02.S04` - migrate the window and shell builder to a registered provider; `frontend/src/stores/view/commandProviders/windowCommandProvider.ts`.
- [x] `W01.P02.S05` - migrate the left-rail builder to a registered provider; `frontend/src/stores/view/commandProviders/leftRailCommandProvider.ts`.
- [x] `W01.P02.S06` - migrate the graph builder to a registered provider; `frontend/src/stores/view/commandProviders/graphCommandProvider.ts`.
- [x] `W01.P02.S07` - migrate the timeline builder to a registered provider; `frontend/src/stores/view/commandProviders/timelineCommandProvider.ts`.
- [x] `W01.P02.S08` - migrate the editor builder to a registered provider; `frontend/src/stores/view/commandProviders/editorCommandProvider.ts`.
- [x] `W01.P02.S09` - add the registerAllCommands aggregator imported once at the shell; `frontend/src/app/menus/registerAllCommands.ts`.
- [x] `W01.P02.S10` - refactor useCommandPaletteCommandView to build the context and call the host; `frontend/src/stores/view/commandPaletteCommands.ts`.
- [x] `W01.P02.S11` - update the palette command-assembly tests to the registry path; `frontend/src/stores/view/commandPaletteCommands.test.ts`.

### Phase `W01.P03` - fence corpus data out of the command plane

Remove per-feature, per-document, and per-lens standing commands and add the structural guard test.

- [x] `W01.P03.S12` - remove the per-feature navigation commands from the command plane; `frontend/src/stores/view/commandPaletteCommands.ts`.
- [x] `W01.P03.S13` - move feature archive from a standing command to an entity verb; `frontend/src/app/menus/sharedActions.ts`.
- [x] `W01.P03.S14` - remove the per-lens standing commands from the command plane; `frontend/src/stores/view/commandPaletteCommands.ts`.
- [x] `W01.P03.S15` - add the corpus-fence guard test; `frontend/src/stores/view/commandPalette.guard.test.ts`.

## Wave `W02` - three planes and the standardized open verb

Standardize the open verb on result entities, add the literal document-search plane, and model the three-mode palette. Depends on W01; authorized by the command-palette-planes ADR.

### Phase `W02.P04` - standardized open verb on result entities

Author the one shared open ActionDescriptor over the selection seam and compose it at every edge.

- [x] `W02.P04.S16` - author the shared openEntityAction builder over the selection seam; `frontend/src/app/menus/sharedActions.ts`.
- [x] `W02.P04.S17` - re-point the semantic-search result open onto openEntityAction; `frontend/src/app/palette/SearchPaletteSurface.tsx`.
- [x] `W02.P04.S18` - compose openEntityAction in the context-menu resolver open entry; `frontend/src/app/menus/sharedActions.ts`.
- [x] `W02.P04.S19` - unit-test the shared open verb across entity kinds; `frontend/src/app/menus/sharedActions.test.ts`.

### Phase `W02.P05` - document-search plane

Add the literal name and title finder over a bounded engine projection, producing result entities.

- [x] `W02.P05.S20` - spike and record the bounded engine projection choice for literal search; `.vault/reference/2026-06-21-command-palette-architecture-reference.md`.
- [x] `W02.P05.S21` - implement the document-search controller producing result entities; `frontend/src/stores/server/documentSearchController.ts`.
- [x] `W02.P05.S22` - bound the result list and read degradation from the tiers block; `frontend/src/stores/server/documentSearchController.ts`.
- [x] `W02.P05.S23` - unit-test the document-search controller; `frontend/src/stores/server/documentSearchController.test.ts`.

### Phase `W02.P06` - three-mode palette overlay

Extend the palette store and surface to command, semantic-search, and document-search modes with honest degradation.

- [x] `W02.P06.S24` - extend the commandPalette store to three modes; `frontend/src/stores/view/commandPalette.ts`.
- [x] `W02.P06.S25` - render the document-search mode surface to the binding Figma frame; `frontend/src/app/palette/DocumentSearchSurface.tsx`.
- [x] `W02.P06.S26` - wire the mode transitions and their keybindings; `frontend/src/stores/view/commandPalette.ts`.
- [x] `W02.P06.S27` - add render tests for the three-mode palette; `frontend/src/app/palette/CommandPalette.render.test.tsx`.

## Wave `W03` - action taxonomy, shortcuts, and backend verb feed

Complete the UI-action taxonomy across surfaces, derive inline accelerators from the keymap registry, and feed backend ops, reload, and settings verbs through providers. Depends on W01 and W02; authorized by the command-palette-actions ADR.

### Phase `W03.P07` - taxonomy and shortcut derivation

Extend the family taxonomy and derive every command inline accelerator from the keymap registry.

- [x] `W03.P07.S28` - extend the CommandFamily taxonomy to the full standard set; `frontend/src/stores/view/commandPaletteCommands.ts`.
- [x] `W03.P07.S29` - carry the live keybinding map in CommandContext and derive accelerators; `frontend/src/platform/actions/commandRegistry.ts`.
- [x] `W03.P07.S30` - render inline accelerators in the presentation view; `frontend/src/stores/view/commandPaletteCommands.ts`.
- [x] `W03.P07.S31` - test accelerator derivation from the keymap registry; `frontend/src/stores/view/commandPaletteCommands.test.ts`.

### Phase `W03.P08` - enroll the missing UI verbs across surfaces

Close the research F5 gap list, enrolling each missing verb as a provider entry and a KeybindingDef where bindable.

- [x] `W03.P08.S32` - enroll the focus-filter-field verb and its KeybindingDef; `frontend/src/stores/view/leftRailKeybindings.ts`.
- [x] `W03.P08.S33` - enroll the clear-filter verb; `frontend/src/stores/view/leftRailKeybindings.ts`.
- [x] `W03.P08.S34` - enroll the expand-tree verb against the live key set; `frontend/src/stores/view/leftRailKeybindings.ts`.
- [x] `W03.P08.S35` - enroll the pin and unpin node verb; `frontend/src/app/stage/menus/graphNodeMenu.ts`.
- [x] `W03.P08.S36` - enroll the open-island and focus-node verb; `frontend/src/app/stage/menus/graphNodeMenu.ts`.
- [x] `W03.P08.S37` - enroll the save-body editor verb via a store-reachable intent; `frontend/src/stores/view/editorKeybindings.ts`.
- [x] `W03.P08.S38` - enroll the rename-document editor verb; `frontend/src/stores/view/editorKeybindings.ts`.
- [x] `W03.P08.S39` - enroll the edit-mode toggle verb; `frontend/src/stores/view/editorKeybindings.ts`.
- [x] `W03.P08.S40` - enroll the reveal-in-file-manager verb; `frontend/src/app/menus/sharedActions.ts`.
- [x] `W03.P08.S41` - enroll the open-in-editor verb; `frontend/src/app/menus/sharedActions.ts`.
- [x] `W03.P08.S42` - enroll the copy path and id verb; `frontend/src/app/menus/sharedActions.ts`.
- [x] `W03.P08.S43` - enroll the neighbor-cycle and feature-cycle verbs; `frontend/src/stores/view/keyboardNavigation.ts`.

### Phase `W03.P09` - backend verb feed providers

Replace the ops whitelist branch with an ops provider, add the reload and refresh family, and derive settings commands from the schema.

- [x] `W03.P09.S44` - replace the OPS_WHITELIST branch with an ops command provider; `frontend/src/stores/view/commandProviders/opsCommandProvider.ts`.
- [x] `W03.P09.S45` - add the reload and refresh family wired to ops and rag-control; `frontend/src/stores/view/commandProviders/opsCommandProvider.ts`.
- [x] `W03.P09.S46` - derive settings quick-toggle commands from the served schema; `frontend/src/stores/view/commandProviders/settingsCommandProvider.ts`.
- [x] `W03.P09.S47` - test the ops and settings providers; `frontend/src/stores/view/commandProviders/opsCommandProvider.test.ts`.

## Wave `W04` - verify, review, and codify

Run the full lint gate and a live keyboard and palette pass, complete code review, and promote the three codification candidates. Depends on W01 through W03.

### Phase `W04.P10` - verification

Run the full lint gate to exit zero and a live keyboard and palette verification pass.

- [x] `W04.P10.S48` - run the full frontend lint gate to exit zero; `frontend`.
- [x] `W04.P10.S49` - run a live keyboard and palette verification pass against the running app; `frontend/src/app/palette`.

### Phase `W04.P11` - code review

Run the formal code review and land any required revisions before close.

- [x] `W04.P11.S50` - run the formal code review of the campaign; `.vault/audit/2026-06-21-command-palette-architecture-audit.md`.
- [x] `W04.P11.S51` - land any required revisions from the review; `frontend/src/stores/view/commandPaletteCommands.ts`.

### Phase `W04.P12` - codify

Promote the three codification candidates into project rules.

- [x] `W04.P12.S52` - codify palette-commands-come-from-the-one-provider-registry; `.vaultspec/rules/rules/palette-commands-come-from-the-one-provider-registry.md`.
- [x] `W04.P12.S53` - codify one-open-verb-for-every-result-entity; `.vaultspec/rules/rules/one-open-verb-for-every-result-entity.md`.
- [x] `W04.P12.S54` - codify palette-command-accelerators-derive-from-the-keymap-registry; `.vaultspec/rules/rules/palette-command-accelerators-derive-from-the-keymap-registry.md`.

## Description

This epic implements the three-ADR cluster of the `command-palette-architecture` campaign.
The palette today is hand-assembled (nine `buildX()` arrays concatenated in one mega-hook),
saturated with transient corpus data enrolled as standing commands, missing most standard UI
verbs, and disconnected from the backend's started shortcuts/actions work. The plan delivers,
in four sequenced waves:

`W01` builds the command-provider registry decided by the `command-palette-providers` ADR
(pure `(ctx) => CommandDescriptor[]` providers, a generic host with central gating,
deterministic registration), migrates the existing builders onto it preserving their tested
cores, and fences corpus data out of the command plane with a structural guard.

`W02` implements the `command-palette-planes` ADR: the one shared open verb over the canonical
selection seam composed by every edge, the new literal document-search plane, and the
three-mode palette overlay (command / semantic search / document search).

`W03` implements the `command-palette-actions` ADR: the full UI-action taxonomy enrolled
across surfaces, inline accelerators derived from the keymap registry (never hand-typed), and
the backend verb feed (ops provider, reload/refresh family, settings-schema provider).

`W04` verifies (full lint gate + live keyboard/palette pass), reviews, and codifies the three
candidate rules. The work obeys `dashboard-layer-ownership`, `unified-action-plane`,
`keyboard-shortcuts-bind-through-the-one-keymap-registry`, `stable-selectors`,
`bounded-by-default-for-every-accumulator`, and `engine-read-and-infer` (no new engine
endpoint; backend feeds verbs only). It coordinates with the adjacent in-flight
`keyboard-navigation` focus-spine campaign (shared keymap registry, no duplicate region-cycle
bindings).

## Steps

The executable structure is the four Wave blocks above (`W01` through `W04`), each
containing its Phases and Steps. This section is the narrative anchor; the canonical Step
rows live under their Phases.

## Parallelization

Waves are strictly sequenced: `W01` (the registry) is the foundation every later wave builds
on; `W02` and `W03` both consume the registry and the shared descriptor, so `W01` must land
first; `W04` verifies the whole. Within `W01`, the registry module phase precedes the builder
migration, which precedes the corpus fence. Within `W02`, the open-verb phase and the
document-search controller phase are independent and may run in parallel; both precede the
three-mode palette phase that composes them. Within `W03`, the shortcut-derivation phase
precedes the verb-enrollment phase; the backend-verb-feed phase is independent of both and may
run in parallel. The individual verb-enrollment steps are mutually independent. The campaign
is solo-driven; subagents may execute independent phases in parallel where the dependency
graph allows.

## Verification

- Every Step closed (`- [x]`), and `vaultspec-core vault check all` clean for the campaign
  features.
- The full lint gate passes: `just dev lint frontend` (eslint + prettier + tsc) exits 0
  (`declaring-green-runs-the-full-gate`).
- The command-provider registry is the sole source of palette commands: no `buildX()` array is
  hand-concatenated in `useCommandPaletteCommandView`; the corpus-fence guard test passes (no
  per-feature / per-document / per-lens standing command).
- One shared open `ActionDescriptor` is composed by the document-search result, the
  semantic-search result, and the context-menu open entry (no re-implementation); a unit test
  asserts the single seam.
- The full UI-action taxonomy is enrolled (the research F5 gap list closed); every command's
  inline accelerator is derived from the keymap registry; the legend cannot drift.
- The backend verb feed is a contributed provider (no `OPS_WHITELIST` branch in
  `buildCommands`); the reload/refresh family dispatches through `appDispatcher`; no new engine
  endpoint was added.
- Live verification: driving the running app, Cmd+K shows the clean command plane (no corpus
  flood), the three planes switch, document and semantic search both open a result through the
  one verb, and the enrolled verbs fire their correct intents.
- `vaultspec-code-review` signs off; the three codification candidates are promoted.
