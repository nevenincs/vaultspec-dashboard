---
tags:
  - "#audit"
  - "#dashboard-settings"
date: '2026-06-15'
related:
  - "[[2026-06-15-dashboard-settings-plan]]"
  - "[[2026-06-15-dashboard-settings-adr]]"
promoted_to:
  - 'rule:settings-are-schema-driven-from-one-registry'
modified: '2026-06-15'
---

# `dashboard-settings` audit: `code review and revision`

## Scope

An adversarial code review of the full `dashboard-settings` feature after execution:
the engine schema registry + typed validation + served route, the stores schema hook
and effective-value selector, the reusable Dialog and control kit, the schema-driven
settings dialog and entry points, and the theme migration. Reviewed against the project
rules (layer ownership, tiers-envelope, mock-mirrors-live, read-and-infer, OKLCH/warmth
tokens, sanctioned icon families, provenance-stable keys). All findings below were
resolved in the revision commit before close.

## Findings

No CRITICAL safety issues. The engine validation, mutex discipline, envelope/tiers
conformance, and layer ownership were found sound. Two HIGH and three MEDIUM findings
were raised and fixed:

- **HIGH - dead controls.** Three of four declared settings (`reduce_motion`,
  `default_granularity`, `node_label_scale`) persisted values that no code consumed, so
  the dialog offered live-looking controls that did nothing. RESOLVED: `reduce_motion`
  and `default_granularity` are now wired to real effects (a document attribute the
  stylesheet honors, and the view granularity a scope opens with) via an app-layer
  effects bridge; the unwired `node_label_scale` was removed from the registry (its
  slider control stays in the kit, unit-tested, for a future consuming setting).
- **HIGH - write-flood + disable-mid-interaction.** Slider/text controls fired one write
  per tick/keystroke and disabled themselves mid-interaction. RESOLVED: controls no
  longer disable during a write; continuous controls route through a debounced +
  optimistic-draft write at the dialog seam.
- **MEDIUM - reset-on-scope honesty.** "Reset to default" on a scope target wrote the
  default as a hidden override. RESOLVED: the scope action is now "Match global" (writes
  the inherited value; the PUT-only backend has no delete) and "Reset to default" appears
  only on the global target - labels match effects.
- **MEDIUM - mock integer divergence.** The mock accepted integers the live engine
  rejects. RESOLVED: the mock uses a strict decimal regex mirroring `parse::<i64>()`.
- **MEDIUM - theme reconcile revert.** A theme change could flash back to the stale
  server value for a frame. RESOLVED: the reconcile effect is gated on no in-flight theme
  write; a regression test pins the no-revert path.

Two LOW findings (the schema object carrying an unread `tiers` block into the app layer,
mirroring the pre-existing `SettingsState` convention; and the slider `step` being a UI
hint rather than an enforced constraint) were acknowledged and left as documented,
acceptable behaviour.

## Recommendations

- Functional + visual verification was performed against the mock origin in a real
  browser (theme applies and persists across both light and dark; `reduce_motion` flips
  `data-reduce-motion`; the per-scope override target renders) - keep that harness pattern
  for future settings.
- When a future setting needs the slider/text control, add its consumer in the same
  change (the dead-controls finding generalizes to a rule, below).

## Codification candidates

- **Source:** the HIGH dead-controls finding, plus the ADR's accepted candidate.
  **Rule slug:** `settings-are-schema-driven-from-one-registry`.
  **Rule:** Every user/application setting is declared once in the engine-owned settings
  registry (key, type, default, scope-eligibility, constraints, UI hint) and must have a
  real consumer when it ships; validation, the served schema, and the rendered control
  all derive from that one declaration - no setting is hand-wired outside the registry,
  and no setting persists a value nothing reads. (Promote after it holds across one more
  cycle, per the codify discipline - this is its first full execution.)
