---
tags:
  - '#adr'
  - '#keyboard-action-system'
date: '2026-06-19'
modified: '2026-07-17'
related:
  - "[[2026-06-19-keyboard-action-system-research]]"
---

# `keyboard-action-system` adr: `one keymap registry binds chords to the existing action plane` | (**status:** `accepted`)

## Problem Statement

The dashboard has a mature, centralized **action backend** — the `ActionDescriptor` verb unit
and the dispatcher middleware seam — but **no keyboard layer over it**. Keyboard handling is
instead ~29 scattered, hardcoded sites (research finding F2): a global `Ctrl+K` listener, a
global arrow/bracket navigation listener, a canvas graph-walk binding, a `?` legend whose
keycaps are *hand-transcribed* and free to drift, plus a long tail of widget-intrinsic ARIA
handlers. No chord is configurable; the same key effect is duplicated across sites; and the
legend lies the moment a handler changes. The campaign goal is a designed, centralized, global
action-triggering layer driven by **configurable** keyboard shortcuts across every surface
(filter controls, command navigation, left/right rail, timeline, graph), coupled with
**hardening the settings schema** so bindings register, persist, and customize through the one
engine-owned registry. This ADR fixes the architecture of that layer before any code lands.

## Considerations

- **The backend is done; this is a binding layer (F1).** A keybinding must not invent a new
  effect channel. It resolves to an existing `ActionDescriptor` and fires that descriptor's
  existing `run()` (store intent) or `dispatch` (seam) lane. The `ActionDescriptor` already
  reserves an `accelerator` hint field and its header already names "keybindings later." The
  work is *chord → action id → fire*, plus the catalog of bindable action ids per surface.
- **Two classes of key handling must stay separate (F2).** *Class A* = true command shortcuts
  (global + context commands): these become registry-driven and rebindable. *Class B* =
  widget-intrinsic ARIA interaction (focus traps, dismiss-on-escape, roving-tabindex tree/tab/
  segment navigation, menu/listbox cursoring): the ARIA Authoring Practices fix these keys, and
  rebinding `ArrowDown` inside a listbox would break the widget. Class B stays in components and
  is out of registry scope. The predicate dividing them is load-bearing.
- **Settings are engine-owned, schema-driven, string-valued (F3).** The governing rule
  `settings-are-schema-driven-from-one-registry` forbids dead controls and any setting wired
  beside the registry. A customizable-binding surface must be a declared setting with a real
  consumer (the dispatcher) shipped in the same change.
- **The engine knows nothing of frontend action ids.** It must stay that way (consistent with
  the read-and-infer boundary and existing layering). The persistence shape cannot force the
  engine to enumerate `ActionDescriptor` ids.
- **Layer ownership.** The binding layer is shared intent: it belongs in the `platform`
  substrate (next to `action.ts`/`dispatch.ts`) and the `stores` layer; `app/`/`scene/`
  surfaces *contribute* action catalogs and *consume* the dispatcher, never grow their own
  global key listener or read raw `tiers`.
- **No deprecation bridges (standing user preference).** Scattered Class-A handlers are
  replaced, not shimmed; the hand-transcribed legend is deleted and derived from the registry.

## Constraints

- **No new runtime dependency.** A normalized-chord primitive, a registry, and one window
  listener are small, pure TypeScript; no keybinding library is introduced (consistent with
  "verify established usage" — none exists here, and the surface is small enough to own).
- **Parent-feature stability.** The two seams this builds on are mature and stable: the
  `ActionDescriptor`/dispatcher plane (shipped, consumed by palette + context menu) and the
  settings registry (shipped, five live settings, schema-driven UI). The only engine change is
  additive: one new `SettingType`/`ControlKind` pair and one `SettingDef`. No wire-shape break,
  no storage migration (values stay string-valued).
- **Accessibility floor must not regress.** The existing keyboard-operability guarantees
  (graph arrow-walk, no-keyboard-trap on Tab, live-region announcements, instant non-animated
  keyboard selection) are a WCAG floor and must be *preserved through* the convergence, not
  dropped. Class B handlers are explicitly untouched for this reason.
- **Bounded by default.** The persisted override map and any retained binding/event structures
  carry explicit caps at creation (`bounded-by-default-for-every-accumulator`).

## Implementation

The design is four layers, landing core-first then enrolling surfaces.

**1. The chord primitive (`platform`, F6).** A single pure module defines a normalized
`Chord` — modifier set + a normalized key name — with `parse`, `format` (canonical string:
fixed modifier order, platform `Cmd`/`Ctrl` reconciled, stable key names), and `matches(event)`.
This one canonical string form is reused everywhere: default catalog, persisted overrides,
dispatcher lookup key, legend keycaps, and the `accelerator` hint already on `ActionDescriptor`.
Small and fully unit-testable with no DOM.

**2. The keybinding registry (`platform` + `stores`).** A declarative catalog of **bindable
actions**, each an entry `{ id, defaultChord, label, group, context }` resolving to an
`ActionDescriptor` (by reference or by a resolver the owning surface contributes). The registry
owns: the default chord per action, the action's display metadata for the legend and the
settings recorder, and its **context** (see below). Effective bindings are
`defaults ⊕ user overrides`; the registry is the single source of truth for *what can be bound*.

**3. The global dispatcher (`stores` + one `app` mount).** Exactly **one** window `keydown`
listener owns precedence and the cross-cutting gates that today are reimplemented three times:
the **form-target guard** (skip when typing in input/textarea/select/contentEditable), the
**focus-context** resolution (which contexts are active given current focus), and the
**time-travel** gate (mutating descriptors are inert in time-travel, reusing the existing
`disabledInTimeTravel` property). It normalizes the event to a `Chord`, resolves it against the
active contexts (most-specific context wins), and — on a hit — fires the resolved
`ActionDescriptor` via `isRunnable` → `run()`/`dispatch`. Class B widget handlers continue to
run on their focused elements and are never consulted here; the dispatcher only ever owns
Class A.

**Context model (decision 4).** Each binding declares a `context`: `global` (always active),
or a named surface context (`canvas`, `timeline`, `left-rail`, `right-rail`, `filters`) that is
active only when focus is within that surface (or, for `canvas`, when the canvas host owns
focus — folding in today's `graphWalk` focus check). The same physical key may bind different
actions in different contexts without collision; the dispatcher resolves by *most specific
active context first, then global*. This subsumes the current ad-hoc "only when canvas owns
focus" / "skip in form fields" checks into one declared model.

**4. Settings-schema hardening for customization (engine + stores + UI, ratifying F4 shape b).**
The engine settings registry gains **one** new setting, `keybindings`, of a new value type that
carries a **sparse override map** (`action_id → canonical chord string`), defaulting to empty.
The engine validates the value is well-formed and that every chord parses and is within a
declared **size cap** — *without* enumerating action ids (it does not know them; unknown ids are
tolerated and reconciled by the frontend). A new `ControlKind` (`keybinding`) renders, in the
Settings dialog, the **full catalog from the frontend registry** as per-action chord recorders
grouped by surface, writing back only the sparse overrides. **Conflict handling (decision 7):**
the recorder detects when a chosen chord already binds another action in an overlapping context
and surfaces it inline (warn + offer reassign); the registry exposes a pure conflict-check the
recorder and a test both use. The dispatcher reads `effective settings → overrides`, merges over
the registry defaults, and binds — so the setting is genuinely consumed (no dead control).

> **Amendment (2026-07-15, keyboard-shortcut-conflict-review):** Decision 7's "pure
> conflict-check the recorder and a test both use" is now formally scope-aware. The
> registry's conflict predicate (`findConflicts` / `conflictsForCandidate`) flags a pair
> only when the two bindings share a canonical chord AND sit at EQUAL context specificity
> (both global, or both the same named surface context); a global-vs-surface shadow is by
> definition not a conflict, since the dispatcher's most-specific-active-context-wins rule
> resolves it. This closes a recorder false-positive where the ten deliberate
> global-vs-canvas arrow/`E` shadows rendered as conflicts on a stock install. The
> definition lives once in `registry.ts` and is consumed by both the recorder and the
> default-set guard — no surface re-derives it.

**5. Legend convergence.** The hand-transcribed `KEYBOARD_SHORTCUT_GROUPS` is **deleted**; the
`?` legend is *derived* from the registry (label + effective chord per group), so it can never
drift from the live bindings again. The `?` and `Ctrl+K` openers themselves become `global`
registry bindings.

**6. Per-surface enrollment.** With the core in place, each surface contributes its
`ActionDescriptor` catalog with stable bindable ids and replaces its hardcoded Class-A handler:
command navigation (palette open/close/move/activate), filter controls (KIND/TOPIC/STATUS/
HEALTH/EDITED toggles, clear-all, focus glob/regex), left rail (focus, mode switch, expand/
collapse, reveal), right rail (tab switch, focus search, work-tree step), timeline (playhead
step/nudge/jump-to-live, range clear, mode), and graph (walk/open/expand/clear, neighbour/
feature cycle, lens/layout, fit/reset). Each enrollment deletes the corresponding scattered
handler — no bridge.

A separate `reference` document will capture the concrete chord-grammar, the registry entry
shape, and the override-map validation contract as code-level detail.

## Rationale

The research (F1) is decisive: the costly part of a keyboard system — a centralized, logged,
guardable action backend — already exists and is already consumed by two affordances. Inventing
a parallel system would violate `views-are-projections-of-one-model`/`dashboard-layer-ownership`
and recreate drift. Binding chords to the existing `ActionDescriptor` plane is therefore the
minimal, in-architecture move, and the `accelerator` field plus the "keybindings later" comment
show it was the designed trajectory. Keeping Class B in components (F2) respects the ARIA widget
contracts and the existing accessibility floor; routing only Class A centrally is what makes the
registry coherent. Shape (b) for persistence (F4) is chosen over per-action SettingDefs because
it keeps the engine free of frontend action-id coupling, keeps the registry to one *honest*
consumed setting (satisfying `settings-are-schema-driven-from-one-registry` without dozens of
rows), and locates the action catalog where the action ids already live. Deriving the legend
from the registry removes a standing drift defect rather than papering over it, consistent with
the no-bridge preference.

## Consequences

- **Gains.** One place to add or rebind any command; a legend that cannot lie; one form-target/
  focus/time-travel gate instead of three copies; full keyboard operability of every surface;
  user-customizable shortcuts persisted through the existing settings wire with no migration.
- **Costs / difficulties.** The Class A/B predicate must be applied carefully per handler during
  convergence — misclassifying a widget key as a global binding would break a widget; this is
  the main review risk. The context/precedence model adds a small resolution cost on every
  keydown (bounded, pure). Enrollment touches many surfaces, so it is sequenced as its own waves
  behind the stable core.
- **Pitfalls.** A surface re-growing a private global listener "for one quick key" would
  re-scatter the problem — the codification candidate fences this. An override map left
  unbounded or a chord grammar that accepts ambiguous forms would reintroduce accumulator/drift
  risk — both carry explicit caps/normalization.
- **Pathways opened.** A command-and-shortcut system that future surfaces inherit for free; a
  natural home for a future "command everything" palette parity with the keymap; and a
  rollback-ready action trail (the dispatcher already has the middleware seam).

## Codification candidates

- **Rule slug:** `keyboard-shortcuts-bind-through-the-one-keymap-registry`.
  **Rule:** Every command keyboard shortcut (Class A) is declared once in the central keybinding
  registry and resolves to an `ActionDescriptor` fired by the single global dispatcher; no
  `app/` or `scene/` surface may grow its own global `keydown` listener, and the `?` legend is
  derived from the registry, never hand-transcribed. Widget-intrinsic ARIA key interaction
  (Class B) stays in its component and is never routed through the registry.

  *(Promote only after it holds across at least one full enrollment cycle, per the codify
  discipline — named here as the durable constraint this decision introduces.)*
