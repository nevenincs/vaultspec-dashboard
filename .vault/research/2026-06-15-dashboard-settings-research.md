---
tags:
  - '#research'
  - '#dashboard-settings'
date: '2026-06-15'
modified: '2026-06-15'
related:
  - "[[2026-06-14-user-state-persistence-adr]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
  - "[[2026-06-14-dashboard-design-language-adr]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #research) and one feature tag.
     Replace dashboard-settings with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `dashboard-settings` research: `extendable settings schema and UI`

This research grounds a new settings module for the dashboard: a single place where a
user inspects and changes their preferences, and an architecture where *adding a new
setting is one declaration, not edits scattered across five layers*. The investigation
used `vaultspec-rag` semantic search plus three parallel codebase sweeps over the engine
settings crate, the frontend stores/app layers, and the design-token system. The driving
goal is an **easily extendable settings schema and UI**: extendability is the primary
requirement, so the central question is where the schema lives and how one declaration
fans out to validation, the wire, and rendered controls.

## Findings

### F1 — A settings persistence backbone already exists, but it is untyped free-form K/V

The `vaultspec-session` crate (engine workspace) already persists durable user state in a
SQLite store (`user-state.sqlite3`, separate from the inference cache) with a
`settings(scope, key, value, updated_at)` table keyed by `(scope, key)`. Global settings
live under the empty-string scope sentinel; per-scope overrides live under the absolute
worktree-path scope token, with **no implicit fallback** (a client composes precedence).
The crate is the **sanctioned write exception** to the read-and-infer fence: it writes
only its own SQLite rows, never `.vault/` documents or git.

`GET /settings` serves `{ data: { global: {k:v}, scoped: { <scope>: {k:v} } }, tiers }`
through the shared envelope helper; `PUT /settings` takes `{ scope?, key, value }` and
echoes the full state. Conformance tests pin this wire shape and the tiers block on
success and error.

The decisive gap: **values are stored and served as raw strings with no schema,
validation, key registry, or defaults**. Any key, any value, is accepted silently. There
is no `/settings/schema` introspection and no typed read. This is the layer the new
module must build *on top of*, not replace.

### F2 — The frontend has conformant settings hooks that nothing consumes yet

The stores layer exposes `useSettings()` (read) and `usePutSettings()` (write,
`{ scope?, key, value }`) over the `{global, scoped}` shape, with correct cache-seed +
invalidate behaviour. These hooks are **exported but imported by zero components** — the
wire is plumbed end-to-end and unused. A new UI is the first real consumer.

### F3 — There is no settings UI, and theme is the only live preference (localStorage-only)

An exhaustive sweep found **no settings panel, modal, dialog, or preferences surface**
anywhere in `frontend/src/app/`. The only user-tunable preference today is theme, owned by
a framework-free controller in the platform substrate
(`system | light | dark | high-contrast`) persisted to **localStorage** (`vaultspec-theme`),
applied pre-paint via the `data-theme` attribute to avoid a flash. Theme therefore lives
*outside* the server settings model. Graph layout params (`AlgorithmPanel`) are ephemeral
scene state, never persisted. The split rule today: durable "where am I" session state is
server-persisted; ephemeral view state is localStorage or in-memory.

### F4 — The design system has tokens but lacks generic form-control and dialog primitives

The OKLCH token system is mature: primitive ramps → semantic role tier (surface/ink/
border/accent/focus) → public chrome utilities, with literal-hex scene-read tokens, plus
elevation, radius, density, motion, and typography scales, all remapped per `[data-theme]`.
But there is **no reusable Dialog/Modal/Sheet** and **no reusable form controls** (toggle,
switch, select, slider, checkbox, radio, labelled field row). The only modal precedent is
`CommandPalette` (its own focus-trap + scrim + animated entry). A settings module must
therefore *introduce* a small, reusable, token-driven control kit and a dialog shell — and
that kit is itself reusable beyond settings. Icons come from the two sanctioned families
(Lucide structural chrome, Phosphor domain marks); a gear affordance is a Lucide `Settings`.

### F5 — Extendability is an architecture choice, not a feature: schema as single source of truth

The recurring failure mode for settings UIs is N-place edits per new setting (storage,
validation, wire, hook, control, label). The research conclusion — confirmed with the
user — is a **declarative settings schema as the single source of truth**, owned by the
engine and *served*: each setting declares key, type, default, scope-eligibility,
constraints, and a UI-control hint **once** in Rust. That registry then drives (a) PUT
validation with typed error kinds, (b) a `/settings/schema` endpoint the client reads, and
(c) **schema-driven UI rendering** — the settings dialog builds its controls from served
metadata, so adding a setting is one schema entry plus, at most, one new control renderer
if a novel control type is introduced. This honours `engine-read-and-infer` (the
sanctioned session-crate exception still does the writing), `every-wire-response-carries-
the-tiers-block` (schema rides the envelope), and `views-are-projections-of-one-model`
(the settings dialog is a projection over the served schema + values, not a new model).

## Decisions taken into the ADR (confirmed with user)

- **Schema home:** engine-owned and served. Schema declared in Rust, validated on `PUT`,
  exposed via a `/settings/schema` endpoint; the frontend renders controls from served
  metadata. Storage stays the existing `(scope, key, value)` table (values serialized per
  the declared type); the schema layer wraps read/write with validation, defaults, and
  typed errors.
- **UI surface:** a categorized **modal settings dialog** launched from a gear affordance
  (and reachable via the command palette). This requires a new reusable Dialog primitive
  and a small token-driven form-control kit.
- **Theme:** **migrated into the settings model** as a schema-declared setting persisted
  server-side, with localStorage retained only as the pre-paint cache to keep the no-FOUC
  guarantee. The theme controller becomes a consumer/cache of the unified model.
- **Per-scope vs global:** the schema declares each setting's scope-eligibility; the dialog
  exposes global settings and, for scope-eligible ones, the active-scope override with
  honest "inheriting global" affordances. Precedence resolution is the documented client
  composition (scoped-then-global) the existing model already implies.

## Open questions for the ADR / plan

- The exact set of typed control kinds for v1 (enum/segmented, boolean/switch, string/text,
  number/slider) and the JSON encoding of typed values on the existing string-valued column.
- Whether `/settings/schema` is a standalone route or the schema is folded into the
  `GET /settings` envelope; envelope-honesty and caching argue for a dedicated, cacheable
  schema route plus values on `GET /settings`.
- Migration/versioning posture for the schema and any defaults backfill, consistent with the
  prototype "best-effort, re-derivable" stance of `user-state.sqlite3`.
- Where the gear entry point mounts (left-rail header beside the theme control vs. a global
  top affordance) and how the dialog composes with the existing command-palette focus model.
