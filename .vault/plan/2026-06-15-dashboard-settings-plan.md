---
tags:
  - '#plan'
  - '#dashboard-settings'
date: '2026-06-15'
modified: '2026-06-15'
tier: L3
related:
  - '[[2026-06-15-dashboard-settings-adr]]'
  - '[[2026-06-15-dashboard-settings-research]]'
  - '[[2026-06-14-user-state-persistence-adr]]'
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
     Replace dashboard-settings with a kebab-case feature tag, e.g. #foo-bar.
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

# `dashboard-settings` plan

## Wave `W01` - Engine: schema authority, typed validation, served schema route

Establish the engine-owned settings registry as the single source of truth, add typed validation and effective-value resolution over the existing string-valued store, and serve the schema route. Foundation wave; every later wave depends on its wire shape. Backed by the dashboard-settings ADR and research.

### Phase `W01.P01` - Settings schema registry and typed value codec

Define the declarative registry types, author the v1 entries, and encode/decode typed values over the existing string value column.

- [ ] `W01.P01.S01` - Define the settings schema registry types: key, value type, default, scope eligibility, constraints, and UI-hint control kind; `engine/crates/vaultspec-session/src/settings_schema.rs`.
- [ ] `W01.P01.S02` - Author the v1 registry entries including the initial extendable setting set; `engine/crates/vaultspec-session/src/settings_schema.rs`.
- [ ] `W01.P01.S03` - Implement typed value encode and decode over the existing string value column with legacy-raw and absent-key default fallback; `engine/crates/vaultspec-session/src/settings.rs`.

### Phase `W01.P02` - Typed validation and effective-value resolution

Validate writes against the registry with typed error kinds and resolve effective values with scoped-then-global precedence and default fallback.

- [ ] `W01.P02.S04` - Add registry validation producing typed error kinds for unknown key and type or constraint violation; `engine/crates/vaultspec-session/src/settings.rs`.
- [ ] `W01.P02.S05` - Implement effective-value resolution with scoped-then-global precedence, default fallback, and per-key provenance; `engine/crates/vaultspec-session/src/settings.rs`.
- [ ] `W01.P02.S06` - Wire typed validation into PUT /settings returning typed errors through the shared envelope helper; `engine/crates/vaultspec-api/src/routes/session.rs`.

### Phase `W01.P03` - Served schema route and conformance

Serve the registry over GET /settings/schema through the shared envelope and pin the wire shape, typed errors, and value codec with conformance tests.

- [ ] `W01.P03.S07` - Add the GET /settings/schema route serving the grouped, ordered, described registry through the shared envelope; `engine/crates/vaultspec-api/src/routes/session.rs`.
- [ ] `W01.P03.S08` - Add conformance tests for the schema route shape, the typed-error envelope, and the JSON value codec roundtrip; `engine/tests/tests/conformance.rs`.
- [ ] `W01.P03.S09` - Run the Rust gate (cargo fmt --check, clippy, tests) to exit 0; `engine/`.

## Wave `W02` - Stores: schema and value hooks, effective-value selector, mock parity

Make the stores layer the sole client of the served schema and values: schema hook, effective-value selector with provenance, and mockEngine parity proven against a captured live sample. Depends on W01; backs W03 and W04.

### Phase `W02.P04` - Client wire surface for schema and effective values

Add the engine client method, types, schema query hook, and the effective-value selector with provenance in the stores layer.

- [ ] `W02.P04.S10` - Add the engine client method and types for GET /settings/schema; `frontend/src/stores/server/engine.ts`.
- [ ] `W02.P04.S11` - Add the useSettingsSchema query hook with its query key and invalidation wiring; `frontend/src/stores/server/queries.ts`.
- [ ] `W02.P04.S12` - Add the effective-value selector resolving scoped-then-global with default fallback and provenance over schema and values; `frontend/src/stores/server/settingsSelectors.ts`.

### Phase `W02.P05` - Mock parity and client tests

Extend mockEngine to serve the schema and typed values identically to live and prove parity through a captured-sample adapter test.

- [ ] `W02.P05.S13` - Extend mockEngine to serve the schema route and typed values byte-for-byte as the live engine; `frontend/src/stores/server/mockEngine.ts`.
- [ ] `W02.P05.S14` - Add a captured-sample test proving mock mirrors live schema and value shape through the client adapter path; `frontend/src/stores/server/settings.test.ts`.
- [ ] `W02.P05.S15` - Run the frontend lint and test gate for the stores changes to exit 0; `frontend/`.

## Wave `W03` - App primitives: reusable Dialog and token-driven control kit

Introduce the two reusable chrome primitives the app lacks: a Dialog (focus trap, scrim, animated entry) and a token-driven form-control kit keyed by UI-hint control kind. Schema-agnostic; may run in parallel with W02. Backs W04.

### Phase `W03.P06` - Reusable Dialog primitive

Build a token-driven Dialog primitive with focus trap, scrim, animated entry, and Escape/backdrop dismiss, generalised from the command-palette precedent.

- [ ] `W03.P06.S16` - Build the reusable Dialog primitive with focus trap, scrim, animated entry, and Escape or backdrop dismiss; `frontend/src/app/chrome/Dialog.tsx`.
- [ ] `W03.P06.S17` - Add Dialog render and accessibility tests covering focus trap and dismiss paths; `frontend/src/app/chrome/Dialog.render.test.tsx`.

### Phase `W03.P07` - Token-driven control kit and control registry

Build the enum, boolean, string, and number controls and the registry mapping a UI-hint control kind to its component.

- [ ] `W03.P07.S18` - Build the enum or segmented control with roving keyboard movement and a grayscale-safe active cue; `frontend/src/app/settings/controls/EnumControl.tsx`.
- [ ] `W03.P07.S19` - Build the boolean switch control; `frontend/src/app/settings/controls/SwitchControl.tsx`.
- [ ] `W03.P07.S20` - Build the string text control; `frontend/src/app/settings/controls/TextControl.tsx`.
- [ ] `W03.P07.S21` - Build the number slider control with drag and keyboard input; `frontend/src/app/settings/controls/NumberControl.tsx`.
- [ ] `W03.P07.S22` - Build the control registry mapping a UI-hint control kind to its control component; `frontend/src/app/settings/controls/registry.ts`.
- [ ] `W03.P07.S23` - Add control-kit render tests across all four control kinds; `frontend/src/app/settings/controls/controls.render.test.tsx`.

## Wave `W04` - App: schema-driven settings dialog and entry points

Compose the Dialog, control registry, schema, and effective values into the SettingsDialog with scope-override affordances, and mount the gear entry point and command-palette command. Depends on W02 and W03.

### Phase `W04.P08` - Schema-driven SettingsDialog

Compose Dialog, control registry, schema, and effective values into the SettingsDialog with write-through and scope-override affordances.

- [ ] `W04.P08.S24` - Build the SettingsDialog composing the Dialog with categories built from the served schema and effective values; `frontend/src/app/settings/SettingsDialog.tsx`.
- [ ] `W04.P08.S25` - Render per-setting rows through the control registry with label, description, group, and ordering from the schema; `frontend/src/app/settings/SettingsDialog.tsx`.
- [ ] `W04.P08.S26` - Implement write-through on change via usePutSettings with pending and error handling; `frontend/src/app/settings/SettingsDialog.tsx`.
- [ ] `W04.P08.S27` - Implement the scope-override affordance: global versus active-scope, inheriting-global cue, and clear-override or reset-to-default; `frontend/src/app/settings/SettingsDialog.tsx`.
- [ ] `W04.P08.S28` - Add SettingsDialog render tests covering schema-driven rendering and override states; `frontend/src/app/settings/SettingsDialog.render.test.tsx`.

### Phase `W04.P09` - Entry points

Mount the gear entry point and the command-palette Settings command, both opening the dialog, with open/close wiring.

- [ ] `W04.P09.S29` - Add the gear entry point using the Lucide Settings icon in the chrome to open the dialog; `frontend/src/app/AppShell.tsx`.
- [ ] `W04.P09.S30` - Add a Settings command to the command palette routing to the dialog; `frontend/src/app/palette/CommandPalette.tsx`.
- [ ] `W04.P09.S31` - Wire dialog open and close state for both entry points and add coverage tests; `frontend/src/app/settings/useSettingsDialog.ts`.

## Wave `W05` - Platform: theme migration into the unified model and full verification

Migrate theme into the registry as a global enum setting with cache-then-reconcile to preserve no-FOUC, then run the full lint gate, test suites, and code review. Depends on W04.

### Phase `W05.P10` - Theme migration into the unified model

Migrate theme into the registry as a global enum setting with cache-then-reconcile to preserve the no-FOUC guarantee.

- [ ] `W05.P10.S32` - Add the theme registry entry as a scope-ineligible global enum setting; `engine/crates/vaultspec-session/src/settings_schema.rs`.
- [ ] `W05.P10.S33` - Reconcile the theme controller to the unified model: localStorage as pre-paint cache, server as authority, cache-then-reconcile on load; `frontend/src/platform/theme/themeController.ts`.
- [ ] `W05.P10.S34` - Route theme writes through the settings model while updating the pre-paint cache; `frontend/src/platform/theme/useTheme.ts`.
- [ ] `W05.P10.S35` - Update theme controller and useTheme tests for the reconcile path preserving no-FOUC; `frontend/src/platform/theme/themeController.test.ts`.

### Phase `W05.P11` - Full verification and review

Run the full lint gate, engine and frontend test suites, and a code-review pass over the complete feature.

- [ ] `W05.P11.S36` - Update mockEngine and conformance fixtures for the theme setting end-to-end; `frontend/src/stores/server/mockEngine.ts`.
- [ ] `W05.P11.S37` - Run the full lint gate (just dev lint all) to exit 0 including prettier and rustfmt; `.`.
- [ ] `W05.P11.S38` - Run the engine and frontend test suites to green; `.`.
- [ ] `W05.P11.S39` - Run a vaultspec-code-review pass over the full feature and record the audit; `.vault/audit/`.

## Description

This plan implements the `dashboard-settings` ADR: a declarative settings registry owned by
the engine becomes the single source of truth for every user/application setting. Each
setting declares its key, value type, default, scope-eligibility, constraints, and a UI-hint
control kind once; that registry drives typed validation on write, a served
`GET /settings/schema` route, and schema-driven control rendering in a new modal settings
dialog. The work reuses the existing `vaultspec-session` persistence backbone (the
`(scope, key, value)` table, the `{global, scoped}` wire shape, the sanctioned-write fence)
and the OKLCH design-token foundation; it introduces two reusable chrome primitives the app
currently lacks (a Dialog and a token-driven form-control kit). Theme is migrated from its
localStorage-only home into the unified model as a global enum setting, with localStorage
retained only as the synchronous pre-paint cache to preserve the no-FOUC guarantee. The plan
is grounded in the research and ADR linked in `related:`, and respects the layer-ownership,
tiers-envelope, mock-mirrors-live, and design-token rules.

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

Waves are sequenced by their data dependency on the served schema, with one deliberate
overlap. `W01` (engine schema, validation, served route) is the foundation and must land
first. `W02` (stores hooks, effective-value selector, mock parity) depends on `W01`'s wire
shape. `W03` (the reusable Dialog primitive and the token-driven control kit) is
schema-agnostic chrome and may be executed in parallel with `W02` once `W01` settles the
control-kind catalogue, since neither touches the other's files. `W04` (the schema-driven
SettingsDialog and entry points) depends on both `W02` and `W03`. `W05` (theme migration and
full verification) depends on `W04`. Within a wave, phases are largely sequential because
later phases consume earlier ones; the individual control components in `W03.P07` (the four
control kinds) carry no interdependency and may be built in parallel.

## Verification

- `GET /settings/schema` serves the grouped, ordered, fully-described registry through the
  shared envelope helper with a tiers block; conformance tests pin its shape.
- `PUT /settings` rejects unknown keys and type/constraint violations with typed error kinds
  carried on the tiers-bearing error envelope; conformance tests pin the typed errors and
  the JSON typed-value encode/decode roundtrip over the existing string column.
- The `mockEngine` serves the schema route and typed values byte-for-byte as the live
  engine, proven by a captured-sample test through the client adapter path.
- The settings dialog renders every registry-declared setting through the control registry
  with correct effective-value resolution (scoped-then-global, default fallback) and honest
  scope-override / inheriting-global affordances; render tests cover the schema-driven path.
- The gear entry point and the command-palette "Settings" command both open the dialog.
- Theme is persisted server-side as a registry setting and applied pre-paint with no FOUC;
  theme controller tests cover the cache-then-reconcile path.
- The full lint gate (`just dev lint all`) exits 0 including prettier and rustfmt, and the
  engine and frontend test suites pass; a `vaultspec-code-review` pass signs off the feature.
- The plan is complete when every Step is closed (`- [x]`).
