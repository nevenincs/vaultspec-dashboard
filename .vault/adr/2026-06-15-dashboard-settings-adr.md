---
tags:
  - '#adr'
  - '#dashboard-settings'
date: '2026-06-15'
modified: '2026-06-15'
related:
  - "[[2026-06-15-dashboard-settings-research]]"
  - "[[2026-06-14-user-state-persistence-adr]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #adr) and one feature tag.
     Replace dashboard-settings with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     Status convention: the H1 status value is one of proposed, accepted,
     rejected, or deprecated. A new ADR starts as proposed; it moves to
     accepted or rejected when the decision is made, and to deprecated
     when a later ADR supersedes it.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `dashboard-settings` adr: `engine-owned served settings schema with modal UI` | (**status:** `accepted`)

## Problem Statement

The dashboard has a working settings persistence backbone but no settings *module*: no UI
through which a user inspects or changes preferences, and no schema that makes adding a new
setting cheap. Today the `vaultspec-session` crate stores settings as untyped free-form
string key/value pairs (global and per-scope), the frontend exposes conformant but
entirely unconsumed `useSettings`/`usePutSettings` hooks, and the only live preference —
theme — lives outside that model in localStorage. The research established that the real
requirement is **extendability**: a settings module is only successful if adding the next
setting is a single declaration rather than coordinated edits across storage, validation,
the wire, the client cache, a control, and a label. This ADR fixes where the schema lives,
how one declaration fans out, what the UI surface is, and how theme folds in.

## Considerations

- **Extendability is the load-bearing requirement.** The dominant failure mode for
  settings systems is N-place edits per setting. The decision space is fundamentally about
  the single source of truth and how it propagates.
- **The backbone is reusable, not replaceable.** The `(scope, key, value, updated_at)`
  table, the `{global, scoped}` wire shape under the `{data, tiers}` envelope, the global
  vs per-scope keying, and the sanctioned-write fence of `vaultspec-session` all stay. The
  new work is a *typed schema layer* wrapping read/write — not a new store.
- **Layer ownership is already settled.** The engine serves the wire and is the only place
  inference and now schema authority live; `frontend/src/stores/` is the sole wire client;
  `frontend/src/app/` is dumb chrome that reads through hooks and never fetches or reads the
  raw tiers block; `frontend/src/platform/` owns framework-free substrate (theme). The
  settings module must respect these one-way boundaries.
- **The design system lacks primitives.** There is no reusable Dialog and no reusable form
  controls. The module necessarily introduces a small, token-driven control kit and a
  dialog shell; both are reusable beyond settings, so they are designed as shared chrome
  primitives, not settings-private widgets.
- **Theme has a no-FOUC constraint.** Theme must apply before first paint, which is why it
  is localStorage-today. Folding it into the server model must preserve a synchronous
  pre-paint source.
- **Schema-driven rendering vs. hand-built forms.** A served schema can drive automatic
  control rendering (extendable, uniform) or merely document keys while forms are
  hand-built (familiar, but re-introduces per-setting UI edits). Extendability favours
  schema-driven rendering with a small fixed catalogue of control kinds.

## Constraints

- **Read-and-infer fence.** Only `vaultspec-session` may write; the inference crates stay
  pure. The schema layer and its validation live in or beside `vaultspec-session`/the API
  layer and write only `user-state.sqlite3` rows. No `.vault/` or git mutation.
- **Every wire response carries the tiers block via the shared envelope helper.** The new
  `/settings/schema` route and the typed `PUT` errors must ride the shared `envelope()`
  helper; no hand-built bodies.
- **Mock mirrors live wire shape.** The GUI `mockEngine` must serve the schema route and
  the typed value shapes byte-for-byte as the live engine, proven against a captured
  sample through the same client path.
- **Design tokens and icon families.** All control chrome derives from the OKLCH semantic
  token tier and per-`[data-theme]` remaps (no hardcoded hex, no `dark:` variant);
  structural chrome icons are Lucide, domain marks Phosphor.
- **Parent-feature stability.** The backbone (`user-state-persistence`, complete) and the
  design-token foundation (`dashboard-design-adoption`, complete) are both shipped and
  stable. The dependency on the existing string-valued `value` column is the only schema
  migration surface; values become typed by JSON-encoding into that column, so no DDL
  change is forced for v1.

## Implementation

The module layers in four planes, each respecting the ownership boundaries.

**Engine — schema authority and typed validation.** A declarative settings *registry* is
authored in Rust beside `vaultspec-session`: each entry declares a stable key, a value
type (enum, boolean, string, integer/number), a default, scope-eligibility (global-only or
scope-overridable), constraints (enum members, numeric range, string limits), and a UI hint
(control kind, label, group/category, ordering, description). The registry is the single
source of truth. `PUT /settings` gains validation: an unknown key or a value violating the
declared type/constraint returns a typed error kind through the shared envelope (the GUI
distinguishes "your write was invalid" from "a tier is down"). Typed values are
JSON-encoded into the existing string `value` column, so the storage table is unchanged;
reads decode by the registry's declared type and synthesize the declared default when a key
is absent. A new `GET /settings/schema` route serves the registry (grouped, ordered,
fully described) under the `{data, tiers}` envelope; `GET /settings` continues to serve
current values. Conformance tests pin the schema route, the typed-error envelope, and the
JSON value encoding.

**Stores — the sole client of schema + values.** New hooks expose the served schema
(`useSettingsSchema`) alongside the existing value hooks, plus a small selector that
resolves *effective* values (scoped-then-global precedence, falling back to schema
defaults) and reports per-key provenance (default / global / scope-override). The
`mockEngine` is extended to serve the schema and typed values identically to live, with a
captured-sample test through the tolerant adapter.

**App — the schema-driven settings dialog.** A new reusable **Dialog** primitive (focus
trap, scrim, animated entry, Escape/backdrop dismiss — generalized from the command-palette
precedent) hosts a **SettingsDialog**. The dialog reads the schema and effective values
and renders **categories** as sections; each setting renders through a **control registry**
that maps a UI-hint control kind to a token-driven control component (segmented/enum,
switch/boolean, text/string, slider/number). Adding a setting is then one registry entry on
the engine (and, only if it needs a never-seen control kind, one new control renderer).
Each scope-overridable setting shows the active-scope override with an honest "inheriting
global" affordance and a reset-to-default / clear-override action. A new **gear entry
point** (Lucide `Settings`) mounts in the chrome and opens the dialog; the command palette
gains a "Settings" command routing to the same dialog.

**Platform — theme as a schema-declared setting.** Theme is migrated into the registry as a
scope-ineligible (global) enum setting. The theme controller becomes a consumer of the
unified model: it still applies `data-theme` pre-paint from a synchronous localStorage
*cache*, but the authoritative value is the server setting; on load the controller
reconciles cache to server, and writes go through the settings model (updating both server
and the pre-paint cache). The no-FOUC guarantee is preserved by keeping the synchronous
cache read at boot.

## Rationale

The research (F1–F5) showed the backbone is sound but untyped, the hooks are unused, no UI
exists, and the design system lacks the needed primitives — and that extendability is an
*architecture* choice, not a feature. Engine-owned served schema is chosen over a
frontend-only registry because it makes validation honest at the only place that can
enforce it (the writer), keeps one source of truth on the wire rather than two declarations
that drift, and matches the existing law that the engine serves the wire and the client
projects over it (`views-are-projections-of-one-model`, `engine-read-and-infer`,
`every-wire-response-carries-the-tiers-block`). Schema-driven rendering is chosen because it
is the mechanism that actually delivers the one-declaration extendability the goal demands.
A modal dialog is chosen over a rail tab because settings are a focused, growing,
secondary surface that benefits from dedicated space and a reusable dialog the rest of the
app currently lacks. Migrating theme unifies the preference model and proves the schema
end-to-end on a real, already-shipped preference.

## Consequences

- **Gain:** adding a setting becomes a single engine declaration that automatically gains
  validation, wire exposure, an effective-value resolution, and a rendered control — the
  extendability goal, structurally enforced.
- **Gain:** two reusable primitives (a Dialog and a token-driven control kit) land that the
  whole app can reuse; the command palette's bespoke modal can later converge onto the
  shared Dialog.
- **Gain:** one unified preference model; theme stops being a special case.
- **Cost / difficulty:** the control-kind catalogue is a real API surface — too small and
  settings can't express themselves, too large and it sprawls. v1 fixes a deliberately
  small catalogue (enum, boolean, string, number) and treats new kinds as explicit
  additions.
- **Cost:** typed values JSON-encoded into a string column means read decoding must tolerate
  legacy raw-string rows and absent keys (synthesize defaults); this is the only migration
  subtlety and is handled by decode-with-fallback, consistent with the store's best-effort
  re-derivable posture.
- **Pitfall:** the no-FOUC theme path must keep a synchronous pre-paint cache; routing theme
  *only* through the async server model would reintroduce a flash. The cache-then-reconcile
  design avoids it but must be implemented deliberately.
- **Pathway opened:** the served schema enables future settings search/command surfacing,
  import/export of preferences, and per-workspace policy defaults without re-architecting.

## Codification candidates

- **Rule slug:** `settings-are-schema-driven-from-one-registry`.
  **Rule:** Every user/application setting is declared once in the engine-owned settings
  registry (key, type, default, scope-eligibility, constraints, UI hint); validation, the
  served schema, and the rendered control all derive from that declaration — no setting is
  hand-wired into storage, the wire, or the UI outside the registry. *(Candidate only;
  promote after it holds across one full execution cycle per the codify discipline.)*
