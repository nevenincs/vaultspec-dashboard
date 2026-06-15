---
generated: true
tags:
  - '#index'
  - '#dashboard-settings'
date: '2026-06-15'
modified: '2026-06-15'
related:
  - '[[2026-06-15-dashboard-settings-W01-P01-S01]]'
  - '[[2026-06-15-dashboard-settings-W01-P01-S02]]'
  - '[[2026-06-15-dashboard-settings-W01-P01-S03]]'
  - '[[2026-06-15-dashboard-settings-W01-P02-S04]]'
  - '[[2026-06-15-dashboard-settings-W01-P02-S05]]'
  - '[[2026-06-15-dashboard-settings-W01-P02-S06]]'
  - '[[2026-06-15-dashboard-settings-W01-P03-S07]]'
  - '[[2026-06-15-dashboard-settings-W01-P03-S08]]'
  - '[[2026-06-15-dashboard-settings-W01-P03-S09]]'
  - '[[2026-06-15-dashboard-settings-W02-P04-S10]]'
  - '[[2026-06-15-dashboard-settings-W02-P04-S11]]'
  - '[[2026-06-15-dashboard-settings-W02-P04-S12]]'
  - '[[2026-06-15-dashboard-settings-W02-P05-S13]]'
  - '[[2026-06-15-dashboard-settings-W02-P05-S14]]'
  - '[[2026-06-15-dashboard-settings-W02-P05-S15]]'
  - '[[2026-06-15-dashboard-settings-W03-P06-S16]]'
  - '[[2026-06-15-dashboard-settings-W03-P06-S17]]'
  - '[[2026-06-15-dashboard-settings-W03-P07-S18]]'
  - '[[2026-06-15-dashboard-settings-W03-P07-S19]]'
  - '[[2026-06-15-dashboard-settings-W03-P07-S20]]'
  - '[[2026-06-15-dashboard-settings-W03-P07-S21]]'
  - '[[2026-06-15-dashboard-settings-W03-P07-S22]]'
  - '[[2026-06-15-dashboard-settings-W03-P07-S23]]'
  - '[[2026-06-15-dashboard-settings-W04-P08-S24]]'
  - '[[2026-06-15-dashboard-settings-W04-P08-S25]]'
  - '[[2026-06-15-dashboard-settings-W04-P08-S26]]'
  - '[[2026-06-15-dashboard-settings-W04-P08-S27]]'
  - '[[2026-06-15-dashboard-settings-W04-P08-S28]]'
  - '[[2026-06-15-dashboard-settings-W04-P09-S29]]'
  - '[[2026-06-15-dashboard-settings-W04-P09-S30]]'
  - '[[2026-06-15-dashboard-settings-W04-P09-S31]]'
  - '[[2026-06-15-dashboard-settings-W05-P10-S32]]'
  - '[[2026-06-15-dashboard-settings-W05-P10-S33]]'
  - '[[2026-06-15-dashboard-settings-W05-P10-S34]]'
  - '[[2026-06-15-dashboard-settings-W05-P10-S35]]'
  - '[[2026-06-15-dashboard-settings-W05-P11-S36]]'
  - '[[2026-06-15-dashboard-settings-W05-P11-S37]]'
  - '[[2026-06-15-dashboard-settings-W05-P11-S38]]'
  - '[[2026-06-15-dashboard-settings-W05-P11-S39]]'
  - '[[2026-06-15-dashboard-settings-adr]]'
  - '[[2026-06-15-dashboard-settings-audit]]'
  - '[[2026-06-15-dashboard-settings-plan]]'
  - '[[2026-06-15-dashboard-settings-research]]'
---

# `dashboard-settings` feature index

Auto-generated index of all documents tagged with `#dashboard-settings`.

## Documents

### adr

- `2026-06-15-dashboard-settings-adr` - `dashboard-settings` adr: `engine-owned served settings schema with modal UI` | (**status:** `accepted`)

### audit

- `2026-06-15-dashboard-settings-audit` - `dashboard-settings` audit: `code review and revision`

### exec

- `2026-06-15-dashboard-settings-W01-P01-S01` - Define the settings schema registry types: key, value type, default, scope eligibility, constraints, and UI-hint control kind
- `2026-06-15-dashboard-settings-W01-P01-S02` - Author the v1 registry entries including the initial extendable setting set
- `2026-06-15-dashboard-settings-W01-P01-S03` - Implement typed value encode and decode over the existing string value column with legacy-raw and absent-key default fallback
- `2026-06-15-dashboard-settings-W01-P02-S04` - Add registry validation producing typed error kinds for unknown key and type or constraint violation
- `2026-06-15-dashboard-settings-W01-P02-S05` - Implement effective-value resolution with scoped-then-global precedence, default fallback, and per-key provenance
- `2026-06-15-dashboard-settings-W01-P02-S06` - Wire typed validation into PUT /settings returning typed errors through the shared envelope helper
- `2026-06-15-dashboard-settings-W01-P03-S07` - Add the GET /settings/schema route serving the grouped, ordered, described registry through the shared envelope
- `2026-06-15-dashboard-settings-W01-P03-S08` - Add conformance tests for the schema route shape, the typed-error envelope, and the JSON value codec roundtrip
- `2026-06-15-dashboard-settings-W01-P03-S09` - Run the Rust gate (cargo fmt --check, clippy, tests) to exit 0
- `2026-06-15-dashboard-settings-W02-P04-S10` - Add the engine client method and types for GET /settings/schema
- `2026-06-15-dashboard-settings-W02-P04-S11` - Add the useSettingsSchema query hook with its query key and invalidation wiring
- `2026-06-15-dashboard-settings-W02-P04-S12` - Add the effective-value selector resolving scoped-then-global with default fallback and provenance over schema and values
- `2026-06-15-dashboard-settings-W02-P05-S13` - Extend mockEngine to serve the schema route and typed values byte-for-byte as the live engine
- `2026-06-15-dashboard-settings-W02-P05-S14` - Add a captured-sample test proving mock mirrors live schema and value shape through the client adapter path
- `2026-06-15-dashboard-settings-W02-P05-S15` - Run the frontend lint and test gate for the stores changes to exit 0
- `2026-06-15-dashboard-settings-W03-P06-S16` - Build the reusable Dialog primitive with focus trap, scrim, animated entry, and Escape or backdrop dismiss
- `2026-06-15-dashboard-settings-W03-P06-S17` - Add Dialog render and accessibility tests covering focus trap and dismiss paths
- `2026-06-15-dashboard-settings-W03-P07-S18` - Build the enum or segmented control with roving keyboard movement and a grayscale-safe active cue
- `2026-06-15-dashboard-settings-W03-P07-S19` - Build the boolean switch control
- `2026-06-15-dashboard-settings-W03-P07-S20` - Build the string text control
- `2026-06-15-dashboard-settings-W03-P07-S21` - Build the number slider control with drag and keyboard input
- `2026-06-15-dashboard-settings-W03-P07-S22` - Build the control registry mapping a UI-hint control kind to its control component
- `2026-06-15-dashboard-settings-W03-P07-S23` - Add control-kit render tests across all four control kinds
- `2026-06-15-dashboard-settings-W04-P08-S24` - Build the SettingsDialog composing the Dialog with categories built from the served schema and effective values
- `2026-06-15-dashboard-settings-W04-P08-S25` - Render per-setting rows through the control registry with label, description, group, and ordering from the schema
- `2026-06-15-dashboard-settings-W04-P08-S26` - Implement write-through on change via usePutSettings with pending and error handling
- `2026-06-15-dashboard-settings-W04-P08-S27` - Implement the scope-override affordance: global versus active-scope, inheriting-global cue, and clear-override or reset-to-default
- `2026-06-15-dashboard-settings-W04-P08-S28` - Add SettingsDialog render tests covering schema-driven rendering and override states
- `2026-06-15-dashboard-settings-W04-P09-S29` - Add the gear entry point using the Lucide Settings icon in the chrome to open the dialog
- `2026-06-15-dashboard-settings-W04-P09-S30` - Add a Settings command to the command palette routing to the dialog
- `2026-06-15-dashboard-settings-W04-P09-S31` - Wire dialog open and close state for both entry points and add coverage tests
- `2026-06-15-dashboard-settings-W05-P10-S32` - Add the theme registry entry as a scope-ineligible global enum setting
- `2026-06-15-dashboard-settings-W05-P10-S33` - Reconcile the theme controller to the unified model: localStorage as pre-paint cache, server as authority, cache-then-reconcile on load
- `2026-06-15-dashboard-settings-W05-P10-S34` - Route theme writes through the settings model while updating the pre-paint cache
- `2026-06-15-dashboard-settings-W05-P10-S35` - Update theme controller and useTheme tests for the reconcile path preserving no-FOUC
- `2026-06-15-dashboard-settings-W05-P11-S36` - Update mockEngine and conformance fixtures for the theme setting end-to-end
- `2026-06-15-dashboard-settings-W05-P11-S37` - Run the full lint gate (just dev lint all) to exit 0 including prettier and rustfmt
- `2026-06-15-dashboard-settings-W05-P11-S38` - Run the engine and frontend test suites to green
- `2026-06-15-dashboard-settings-W05-P11-S39` - Run a vaultspec-code-review pass over the full feature and record the audit

### plan

- `2026-06-15-dashboard-settings-plan` - `dashboard-settings` plan

### research

- `2026-06-15-dashboard-settings-research` - `dashboard-settings` research: `extendable settings schema and UI`
