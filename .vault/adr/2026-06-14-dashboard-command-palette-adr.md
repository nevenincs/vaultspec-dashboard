---
tags:
  - '#adr'
  - '#dashboard-command-palette'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - "[[2026-06-14-dashboard-design-language-adr]]"
  - "[[2026-06-14-dashboard-iconography-adr]]"
  - "[[2026-06-14-dashboard-design-language-research]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
---

# `dashboard-command-palette` adr: `command palette` | (**status:** `accepted`)

## Problem Statement

The command palette is the dashboard's universal navigation and verb surface — the
Ctrl/Cmd-K lifted layer that fronts feature navigation, lens application and saving, and
the whitelisted operational verbs, and is the cheap escape hatch that lets the
surrounding chrome stay minimal. It already ships as `frontend/src/app/palette/CommandPalette.tsx`
with unit and interactive test coverage, built during the GUI cycle on the base GUI ADR's
G2.a / G5.c decisions. Two pressures now require it to be re-specified against the new
base UI design language rather than left as built.

The first pressure is the design pivot. The base design-language ADR retired the
paper-warm brand skin and the hand-drawn glyph family in favour of the convergent
agentic-desktop register, and named the Cmd+K palette as a canonical cohort pattern: a
lifted surface, shortcuts shown inline, keyboard-first. The palette must now read as a
native member of that cohort and consume the new token, motion, density, and icon layers
rather than the retired ones.

The second pressure is two standing correctness debts the GUI audit surfaced on this
exact surface. The palette's accessibility contract is incomplete — it needs a true focus
trap with focus restore and a live region that announces selection and result-count
changes to assistive technology — and its operational verbs must dispatch only through the
platform `appDispatcher` seam, never via a direct-engine bypass. The seam routing has
since been wired (the palette's `runOp` now calls `dispatchOps`, which dispatches through
`appDispatcher`), so this ADR ratifies that routing as an invariant and pins the remaining
a11y obligations as required behaviour.

This ADR is spec work scoped to the palette alone. It re-decides nothing in the base
design language, the iconography ADR, or the four-layer architecture; it inherits all of
them and states what the palette is, the laws it obeys, and the behaviour it must carry.
It does not authorize a rebuild and it does not change application code.

## Considerations

The palette in its current form is a single app-chrome component,
`frontend/src/app/palette/CommandPalette.tsx`, with a pure command-assembly core
(`buildCommands`, `filterCommands`) covered by `CommandPalette.test.ts` and the safety
semantics covered by `CommandPalette.interactive.test.tsx`. It is invoked by a global
Ctrl/Cmd-K key handler, toggling an `open` state; it reads store state through hooks — the
filters vocabulary via `useFiltersVocabulary(scope)`, the saved lenses via `useLensStore`,
and the time-travel flag via `useViewStore` — and assembles three command families:
navigation (one `go to <feature>` per feature tag, running `selectNode`), lenses (apply a
built-in or saved lens, plus a contextual "save current filters as lens" command), and ops
(the `OPS_WHITELIST` verbs). It never fetches the engine directly. Ops intents flow through
the seam: `runOp` calls `dispatchOps`, which dispatches the `ops:run` action through
`appDispatcher`; the registered terminal handler in `frontend/src/app/right/opsActions.ts`
is the only place that touches `engineClient.opsCore` / `opsRag`. Destructive ops arm on
the first Enter and fire on the second via the shared `useConfirmable("ops:run")` hook over
the platform confirm guard, and the whole ops family is filtered out of the command list in
time-travel mode. The current visual layer still carries paper-warm utility classes
(`bg-paper-raised`, `text-ink`, `shadow-deep`, `animate-slide-in-down`) — the tokens this
ADR moves onto the new semantic layer.

What the base language requires of this surface is explicit. The palette is named in the
design-language ADR's density-and-layout law as the `Cmd/Ctrl+K` command palette presented
as a lifted surface, and in the distilled convergent language as the keyboard-first
escape hatch with shortcuts shown inline. It therefore inherits: the lifted-surface
elevation expressed through the semantic depth tier (background to foreground to panel to
dialog to modal), not a hand-listed shadow; the warm-hued low-chroma neutral surfaces
carried into dark via the `[data-theme]` remap, never a per-component colour; fast, subtle,
state-communicating motion where keyboard-initiated actions feel instant and
`prefers-reduced-motion` swaps transitions for instant state changes; the compact-but-
breathing density with tabular numerals on any data-bearing text; and the iconography
split — structural chrome marks from Lucide, expressive/domain marks from Phosphor, every
mark grayscale-safe and 14px-legible by shape. Inline shortcut display is a first-class
cohort affordance the base language mandates and the palette must carry.

## Constraints

The palette is app-chrome and is bound by the layer-ownership invariant: it may read store
state through stores hooks and selectors and emit intent, but it must never `fetch` the
engine directly and never read the raw `tiers` block. Every operational verb must dispatch
through the `appDispatcher` seam — the single place an intent is logged, traced, and
guardable — and never reach `engineClient` from the component; the seam's terminal handler
is the sole engine-touching point. This is the audit's no-direct-engine-bypass finding, now
load-bearing.

Time-travel mode is a hard gate on ops: when the view is in time-travel, the entire ops
command family is removed from the palette, mirroring the right rail's G4.b gate everywhere
an ops verb can be reached. Navigation and lens commands remain available in time-travel
because they are non-mutating; only the mutating verbs are gated. Destructive ops obey
arm-then-confirm: the first activation arms and announces, the second fires, and navigating
to a different command, editing the query, closing the palette, or pressing Escape all
disarm cleanly so a stale armed state can never fire.

The palette is a projection over the one model and a consumer of existing stores queries
and view stores: it adds no new wire client, defines no node shape of its own, and
introduces no new engine endpoint. It must honour the product invariants the base language
preserves — degradation is a designed state rendered honestly, not an error; ids are
stable; bounded reads stay bounded — by surfacing the store-mediated degraded and loading
states truthfully rather than failing silently or fabricating a healthy view.

What it must NOT do: it must not become a feature surface in its own right — every command
acts on a committed primitive that exists outside the palette (a real feature, a real lens,
a real whitelisted verb), so nothing is reachable only through the palette; it must not
grow its own ops whitelist or forward un-whitelisted verbs; it must not introduce a second
theming or motion mechanism, a bespoke shadow, a borrowed hex, or a third icon set; and it
must not animate keyboard-initiated state changes in a way that makes them feel laggy.

## Implementation

The palette is one lifted app-chrome surface that consumes store state, projects three
command families, and dispatches intent — re-skinned onto the new base language and
completed against its a11y contract. Concrete token values, class names, and code live in
adoption; this ADR pins behaviour and law.

Invocation and dismissal. A global Ctrl/Cmd-K toggles the palette open and closed; opening
clears the query, resets the cursor to the first row, and cancels any armed state. Escape
closes and disarms. A click on the lifted backdrop dismisses; a click inside does not. The
key handler intercepts Ctrl/Cmd-K everywhere so the palette is always one chord away — the
keyboard-first escape hatch the base language names.

Command taxonomy. Three families assemble from store state in a pure, unit-tested core.
Navigation contributes one entry per feature tag from the filters vocabulary, each
focusing that feature's node through the shared selection concept so selecting in the
palette focuses everywhere. Lenses contribute one entry per built-in and saved lens
(apply) plus a contextual "save current filters as lens" entry when the query is non-empty,
both acting through the lens store. Ops contribute the whitelisted core and rag verbs from
the single `OPS_WHITELIST`, each marked destructive (arm-to-confirm) and routed through the
seam. The families are visually grouped and each row carries a short hint naming its family
(navigate, filters, core, rag).

Object-then-action flow. The palette reads object-then-action: the user names the target
first — a feature, a lens, the current filter set — and the command expresses the action on
that already-identified object, rather than picking a free-floating verb and then hunting
for a target. Navigation is "go to <feature>"; the lens family is "lens: <name>" and "save
current filters as lens <name>"; ops verbs name the concrete operation. This keeps every
command a complete, unambiguous intent at the moment it is activated, which is also what
makes the live-region announcement and the arm-to-confirm prompt read as full sentences.

Inline shortcut display. Each row shows its activating affordance inline on the trailing
edge — the cohort pattern the base language mandates — so the palette teaches its own
keyboard grammar: the family hint and, where a command has a standing accelerator, that
accelerator rendered in the inline-shortcut treatment with tabular numerals and the
monospace reserve where a literal key is shown. The point is discoverability without a help
modal.

Fuzzy match. A single query input filters the assembled command list by match against the
command label, with the cursor reset to the top on every keystroke so the best match is
always pre-selected for an immediate Enter. The match is forgiving of word order and
partial tokens so a user can type the feature or verb fragment they remember; it stays a
pure function of the command list and the query, independently testable.

Lifted-surface elevation. The palette renders on the modal step of the semantic depth tier
— above background, foreground, panel, and dialog — expressed through the semantic
elevation and surface tokens and the `[data-theme]` remap, never a hand-listed shadow or a
per-component colour. Its surface is the warm-hued low-chroma raised neutral carried into
dark; its border is the soft low-contrast rule; its radius is the consistent rounded
geometry. The backdrop is a dimmed scrim. The whole surface reads as felt structure, not a
heavy box.

States. The palette renders four honest states. Empty query shows the full command list
(best-match-first ordering still applies once typing begins). No-results shows a quiet
"nothing matches" row in the muted-ink treatment, never a dead or error-looking surface.
Loading — when the filters vocabulary or lens set is still resolving — shows the commands
that are already available and a subtle, purposeful liveness cue for the pending family
rather than a blank list, tied to real in-progress state per the base motion law. Degraded
ops — when a backend the ops family targets is down — surface the store-mediated degraded
state truthfully (the verb shows as unavailable rather than firing into a void), because
degradation is a designed state, and an ops error returns a legible message in the palette
without closing it or implying success.

Accessibility contract. The palette is a labelled modal dialog that owns focus while open.
On open it captures the previously focused element and moves focus to the query input; on
close it restores focus to that element — the focus-restore obligation from the audit. A
true focus trap keeps Tab cycling within the dialog so focus can never escape to the chrome
behind the scrim while it is open. A polite live region announces selection changes as the
cursor moves and announces the result count as the query narrows, so a screen-reader user
hears the same state a sighted user sees; the arm-to-confirm transition announces the
"confirm?" prompt as well. The palette is fully keyboard-operable: arrows walk the list,
Enter activates (and, for destructive ops, arms then confirms), Escape closes, and every
row is reachable and activable without a pointer. Reduced-motion is honoured — the
open/close and any liveness cue collapse to instant state changes under
`prefers-reduced-motion`, and keyboard-initiated activations never wait on an animation.

Layer ownership. The palette is app-chrome: it reads store state through stores hooks and
selectors only, emits selection and lens and ops intent, and never fetches the engine and
never reads the raw `tiers` block. Operational verbs dispatch exclusively through the
`appDispatcher` seam; the seam's registered handler is the only place that calls the engine
client, so the palette inherits logging, tracing, and central guarding for free and the
no-direct-engine-bypass invariant holds structurally. The palette is a projection over the
one model — it adds no model, no endpoint, and no second wire client.

Arm-then-confirm for destructive ops. Every ops verb is destructive-by-default in the
palette: the first Enter arms the command (its label flips to a "confirm?" prompt, the live
region announces the prompt, and nothing runs), and the second Enter on the same armed
command fires it through the seam and closes the palette. Arming is single-slotted on the
shared confirm guard keyed to the ops action, with the armed command id tracked so that
moving the cursor to a different command, editing the query, closing the palette, or
pressing Escape disarms — a stale arm can never fire the wrong verb. In time-travel the ops
family is absent entirely, so the destructive path is unreachable in historical mode.

Base tokens, motion, density, icons. The palette consumes the semantic token layer (surface,
ink, rule, accent, the elevation tier) and the new `[data-theme]` remap; its motion obeys
the base grammar (short, subtle, state-communicating; instant for keyboard actions;
reduced-motion safe); its density is compact-but-breathing with tabular numerals on counts
and any data-bearing text and the monospace reserved for literal keys and identities; and
its icons come from the two sanctioned families — structural marks (the search affordance,
chevrons, close) from Lucide, any domain mark on a command row from Phosphor — each
grayscale-safe and legible at 14px by shape.

## Rationale

The palette did not need re-architecting; it needed re-grounding. It already embodies the
cohort pattern the base design-language ADR names — a lifted Cmd+K surface, keyboard-first,
the cheap escape hatch — so the decision is to inherit that language wholesale and move the
surface's tokens, motion, density, and icons onto the new semantic and iconography layers
rather than the retired paper-warm and hand-drawn ones. This is the on-trend and the
low-churn choice: the structure is right, only the skin and two completeness gaps change.

Ratifying the seam routing as an invariant follows the platform ADR's dispatch decision and
the layer-ownership rule: routing ops through `appDispatcher` is what makes every mutating
intent logged, traced, and centrally guardable, and what keeps the palette honest as
app-chrome that never bypasses the stores boundary. Pinning the focus-trap, focus-restore,
and live-region obligations as required behaviour answers the audit directly — a universal
verb surface that the keyboard and the screen reader cannot fully drive would fail the
keyboard-first promise the base language makes. Keeping every command anchored to a
committed primitive, and the ops family gated in time-travel and armed-to-confirm,
preserves the product invariants (state isolation, time-travel honesty, no
palette-only features) that the surrounding architecture already settled.

## Consequences

- **Gains.** A palette that reads native to the agentic-desktop cohort and shares the
  dashboard's token, motion, and icon layers for free; a complete a11y contract (focus
  trap, focus restore, live-region announcements, full keyboard operability, reduced-motion
  honesty) that makes the keyboard-first promise real for assistive technology; a single,
  auditable ops path through the seam with arm-to-confirm and time-travel gating; and a
  surface that stays a thin projection over the one model with no new wire client.
- **Costs and difficulties.** The a11y obligations are real behaviour to verify, not a
  re-skin — focus restore across the open/close lifecycle, a trap that survives every exit
  path, and announcements that fire on selection, result-count, and arm transitions all
  need explicit testing. The inline-shortcut treatment and tabular-numeral discipline are
  small but must be applied consistently. Re-tokenizing the surface must prove contrast per
  theme on the warm ground, as the base language warns.
- **Risks.** The seam invariant is a discipline as much as a structure — a future command
  family added without routing through `appDispatcher` would silently re-open the bypass; a
  test that asserts ops transit the seam is the guard. The time-travel ops gate must be
  re-applied to any new mutating family, or a historical-mode mutation leaks. The live
  region must stay polite and de-duplicated so it does not flood the screen reader on fast
  typing.
- **Pathways opened.** A complete, accessible, seam-routed palette is the template for any
  future verb surface: new navigation targets, new lenses, and newly whitelisted ops verbs
  drop in as additional commands with no new architecture, inheriting the elevation, the
  a11y contract, the gating, and the arm-to-confirm guard for free.

## Codification candidates

- **Rule slug:** `palette-ops-dispatch-through-the-seam`.
  **Rule:** Every operational verb reachable from the command palette must dispatch through
  the `appDispatcher` seam and never call the engine client directly, so all ops intents are
  logged, traced, centrally guarded, time-travel-gated, and armed-to-confirm in one place.
  (Candidate; promote only after it has held across one full execution cycle.)
