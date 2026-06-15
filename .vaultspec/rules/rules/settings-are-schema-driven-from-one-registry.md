---
derived_from:
  - "audit:2026-06-15-dashboard-settings-audit"
---

# Settings are schema-driven from one engine-owned registry

## Rule

Every user/application setting is declared exactly once in the engine-owned settings
registry (`engine/crates/vaultspec-session/src/settings_schema.rs`) — its key, value type
and constraints, default, scope-eligibility, and UI-hint control kind — and validation,
the served `/settings/schema`, the effective-value resolution, and the rendered control
all derive from that one declaration; no setting is hand-wired into storage, the wire, or
the dialog outside the registry, and no setting ships persisting a value nothing reads.

## Why

The `dashboard-settings` cycle (ADR `2026-06-15-dashboard-settings-adr`) built the
settings module so that adding a setting is one registry entry that fans out to every
layer, and its review (`2026-06-15-dashboard-settings-audit`) caught the two failure modes
this rule fences. The dominant one: three of four declared settings shipped as **dead
controls** — the dialog rendered live-looking switches/segments/sliders that persisted
values no code consumed, a UX honesty failure (the user changes a setting, sees it "save,"
and nothing happens). The other: anything hand-wired beside the registry (a bespoke
fetch, a second source of truth, a control that bypasses the schema) re-creates the
N-place-edit and mock-vs-live drift the single registry exists to prevent. The registry is
the single source of truth precisely so a new setting cannot drift across the engine
validation, the wire, and the UI — and so a control on screen always means a real,
consumed preference. Sibling of `mock-mirrors-live-wire-shape`, `dashboard-layer-ownership`
(the stores layer is the sole client of the served schema), and
`every-wire-response-carries-the-tiers-block` (the schema route rides the shared envelope).

## How

- **Good:** a new preference lands as one `SettingDef` in the engine registry (key, type,
  default, scope-eligibility, control hint) AND its consumer in the same change — the
  served schema, typed `PUT` validation, the effective-value selector, and the
  schema-driven control all pick it up with no further edits; the dialog renders it
  unchanged.
- **Good:** a setting needs a control kind the kit lacks — add the one control component
  and one entry in the control registry; the schema still drives which settings render it.
- **Bad:** declaring a setting in the registry with no code reading its value — it renders
  as a control that silently does nothing (the dead-controls finding). Drop it until its
  consumer exists, or ship the consumer alongside it.
- **Bad:** a component reading or writing settings by calling the engine directly,
  defining its own setting shape, or rendering a bespoke settings control outside the
  schema-driven path — that bypasses the single registry and re-scatters validation and
  wire access the registry centralizes.

## Status

Active. Promoted from the `dashboard-settings` review at the close of the feature's first
full execution cycle (research → ADR → plan → execute → review → codify). The intent — one
registry, every setting consumed — is what keeps the module honest and cheap to extend.

## Source

Audit `2026-06-15-dashboard-settings-audit` (the HIGH dead-controls finding) and ADR
`2026-06-15-dashboard-settings-adr` (the accepted codification candidate). Research
`2026-06-15-dashboard-settings-research`. Sibling rules `mock-mirrors-live-wire-shape`,
`dashboard-layer-ownership`, `every-wire-response-carries-the-tiers-block`,
`views-are-projections-of-one-model`.
