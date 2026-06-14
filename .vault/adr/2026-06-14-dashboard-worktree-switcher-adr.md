---
tags:
  - '#adr'
  - '#dashboard-worktree-switcher'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - "[[2026-06-14-dashboard-design-language-adr]]"
  - "[[2026-06-14-dashboard-iconography-adr]]"
  - "[[2026-06-14-dashboard-design-language-research]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
---

# `dashboard-worktree-switcher` adr: `worktree switcher` | (**status:** `accepted`)

## Problem Statement

The worktree switcher is the dashboard's scope chooser: the compact repository to branch
to worktree picker hosted at the top of the left scope rail that answers "where am I
pointed?" and sets the coarsest filter on everything the stage, timeline, and inspector
render. It is the single control through which the operator changes which vault corpus the
entire dashboard is looking at, and it is therefore the surface that owns the dashboard's
most dangerous state transition — the wholesale swap of stage scope.

This surface needs its own ADR for two reasons. First, the base UI design-language and
iconography ADRs have just retired the prior paper-warm brand skin and the hand-drawn
glyph family; the current switcher, `WorktreePicker.tsx`, still carries that legacy
(literal Unicode glyphs for the disclosure caret, the up/down/dirty badges, and the
warning mark; legacy `paper`/`ink` token names) and must be re-specified against the
inherited token, motion, density, and icon laws rather than re-skinned ad hoc. Second, and
more consequentially, the switcher is where the HIGH state-corruption invariant lives:
selecting a worktree must swap the stage scope wholesale and statelessly so that no
per-scope state — filters, lenses, pins, working set, opened islands, timeline mode, the
live-connection slice — bleeds across scopes (foundation audit finding 022, and the
sibling isolation findings 018 and 023). Getting that transition right is the reason this
control deserves a pinned specification rather than an incidental component. It is spec
work; it re-decides nothing the base language already settled and authorizes no
implementation.

## Considerations

The current form is real and working. `WorktreePicker.tsx` reads the workspace map through
the `useWorkspaceMap` stores query, flattens repositories to a single worktree list, and
sorts it with `orderWorktrees` — corpus-bearing worktrees first, defaults leading, then by
branch name. It renders a collapsed trigger showing the current worktree's branch plus a
git sync badge (ahead/behind/dirty pulled from the live status hook), and an expandable
list where each row carries the branch, a `default` marker, a `bare` marker for non-corpus
refs, and a warning mark when the map reports the worktree degraded. Selecting a row calls
the view store's `setScope` (the wholesale-stateless swap), docks the playhead back to
live, collapses the list, and durably persists the choice through the session API; a
rejected durable switch (the engine 400s an unknown or non-vault scope) surfaces as a
non-silent status line because the optimistic `setScope` has already moved the UI. Rows
without a vault corpus are disabled. The error branch renders a "workspace map
unavailable" line with a retry button, and `useWorkspaceMap` already self-heals by polling
every 8 s while in error state so the picker recovers after engine startup without a page
reload.

What the base language requires of this surface. As the topmost element of the attenuated
scope rail, the switcher is dimmed chrome that cedes attention to the stage (base-language
layers 4 and 7), with the active worktree the brightest thing in the control. Density is
compact-but-breathing with pixel-precise alignment. Depth is felt not seen: a soft rounded
low-contrast 1px-bordered trigger, no heavy box. Motion is fast, subtle, and
state-communicating, and keyboard-initiated actions never animate; `prefers-reduced-motion`
swaps any expand/collapse transition for an instant change. Color is spent not sprinkled:
the single muted accent carries the active-worktree selection and nothing else competes for
hue, and the dimmed-versus-primary distinction between corpus-bearing and bare refs is
carried by treatment, never hue alone. Typography is the UI sans with tabular numerals on
the ahead/behind counts, and the monospace is reserved for true path identity (the worktree
path shown on hover). Iconography is hybrid: the disclosure caret and the git sync marks
come from Lucide as structural chrome, replacing the current literal Unicode carets, arrows,
dot, and warning glyph.

What the wire contract requires, and the hosting relationship. The switcher reads
`GET /map` (foundation reference §3): repository to branches (default/feature/other
classification, advisory) to worktrees, each flagged with whether it contains a vault
corpus, with the engine's launch-default scope marked advisory-only, and with remote
feature refs that have no checkout marked `degraded: ["structural"]` (no working tree to
resolve against). Scope is fully stateless (§3, REDLINE-1): every working-tree-dependent
endpoint takes a required `scope` parameter validated per request, there is no
server-held scope state and no `POST /scope`, so a worktree selection is simply the value
the rest of the dashboard's queries are keyed by. Every response carries the per-tier
`tiers` degradation block (§2). The sidebar ADR is the parent host: it frames the left
rail and treats this switcher strictly as a hosted slot at the top of the rail, deferring
entirely to this ADR for the scope-selection contract, so this ADR specifies the control's
internal scope, behaviour, and UI/UX and nothing about the rail chrome around it.

## Constraints

The scope swap is wholesale and stateless — the 022 invariant. Selecting a worktree must
reset, in one cross-store move, every piece of state that embeds the previous corpus:
the filter model (its facet choices embed the previous scope's vocabulary), the lens and
pin stores (re-keyed to the new scope so prior pins/lenses do not bleed in — findings
018/022/023, adversarial isolation-01/02/03), the shared selection and selected id, the
working set, the opened islands, the session-pinned discovery candidates (old-corpus
semantic suggestions must not ride into the new slice), the timeline mode (the new scope
must arrive live, never pre-scrubbed to a foreign timestamp), the graph granularity
(reset to the constellation overview so an unfamiliar corpus does not open at 200 document
nodes), and the live-connection slice (the previous corpus's broken-link count and resume
sequence must not bleed in before the new stream arrives). Nothing scoped to the prior
corpus may survive the swap; this is the single most important behaviour of the control.

It reads `/map` and `tiers` only through the stores. The switcher is app-chrome and is
forbidden from fetching the engine directly, from defining its own worktree shape, and from
reading the raw `tiers` block; it consumes the `useWorkspaceMap` query hook, the live
status hook, and the view store's `setScope` action, and it emits the scope-selection
intent back through that action. It must not own the swap reset logic itself — that
cross-store reset is the stores layer's job in `setScope`, and the control only invokes it.

Error and degradation are honest, and recovery is built in. A failed `/map` read renders a
contained, non-alarming error with a manual retry, distinct from a `tiers`-reported
degradation; periodic poll recovery (the existing 8 s error-state refetch) lets the picker
self-heal after engine startup without a reload; and a rejected durable switch surfaces as
a non-silent status line rather than failing quietly. It must not present a healthy-looking
error and must not lie about a tier being available.

What it must NOT do. It must not hold server-held scope state or attempt a `POST /scope`
(the contract dropped it); must not let any per-scope state leak across a swap; must not
fetch, mint a private worktree identity, or read raw `tiers`; must not introduce a new
ground, palette, type scale, motion budget, or icon source; must not own the file browser
or the rail chrome (the sibling sidebar ADR owns those); and must not enable selection of a
bare, non-corpus worktree as a stage scope.

Parent dependencies and their stability. The base design-language and iconography ADRs are
accepted and supply the tokens, motion budget, density register, and the Lucide-chrome icon
source this control inherits wholesale. The foundation wire contract (`/map`, stateless
scope, the `tiers` block) is a settled parent feature already consumed by the shipping
picker. The view store's `setScope` already implements the wholesale-stateless reset across
the filter, pin, lens, live-status, and view stores, and the session API already persists
the durable choice; these are existing, working primitives this ADR re-specifies the
presentation around, not new mechanisms.

## Implementation

**Scope of this control.** The switcher is the scope chooser only: the repository to
branch to worktree picker at the top of the left rail, plus the wholesale-stateless
scope-swap path it triggers in the stores. It does not own the file browser below it, the
rail frame, or the git status surfaces elsewhere; the small inline git sync badge it shows
is a glanceable affordance on the active worktree, deduplicated through the same live
status query the now-strip and changes overview read.

**The repository to branch to worktree tree.** The control renders the `/map` structure as
a compact two-level switcher: a collapsed trigger showing the active worktree, and an
expandable list of the mapped landscape grouped under their repository and branch lineage.
Corpus-bearing worktrees are primary — full-ink, selectable, ordered first with the
launch-default leading; bare refs (no vault corpus) and the remote feature refs the map
marks `degraded: ["structural"]` render dimmed as context, visibly de-emphasised and not
selectable as a stage scope, because there is no working tree to resolve a corpus against.
The primary-versus-dimmed distinction is carried by ink weight and treatment first, with
any hue strictly redundant, honoring the grayscale-safe identity gate. Each row shows the
branch (the human-readable identity), the default and bare markers as quiet inline labels,
the full worktree path as monospace path-identity on hover/title, and the degraded marker as
a Lucide warning mark with its reason in the title. Repository and branch classification
(default/feature/other) is advisory framing only, never a selection gate.

**Selection to wholesale stateless scope swap.** Activating a corpus-bearing worktree row
emits the scope-selection intent by calling the view store's `setScope` with the worktree
id, which performs the single cross-store reset described in Constraints — the filter, pin,
lens, live-status, selection, working-set, opened-islands, pinned-discoveries, timeline-mode,
and granularity state all reset in one move so nothing from the prior corpus survives. The
control then docks the playhead to live (the mode reset's visible counterpart), collapses
the list, and issues the durable session write so the selection survives a reload; the
optimistic `setScope` is for responsiveness and the session write is the durable record.
This optimistic-then-durable split is deliberate: the UI moves immediately, and a rejected
durable switch (an unknown or non-vault scope the engine 400s with a tiers-bearing error)
surfaces as a non-silent status line saying the selection did not persist, rather than
either blocking the UI or failing quietly.

**Visual treatment of the active worktree.** The active worktree is the brightest element
in the control: its row carries the single muted accent as a subtle selection fill with
brightened ink and added weight (more than hue, per the grayscale-safe gate), and its branch
is the trigger's headline when collapsed. The inline git sync badge on the trigger renders
ahead/behind as Lucide arrow marks with tabular-numeral counts and a dirty indicator in the
muted accent when the worktree has uncommitted changes — a purposeful glanceable cue on real
git state, never ambient decoration, shown only when there is something to report.

**States.** The control renders these honest states. Loading: a quiet copy-toned "mapping
worktrees…" pending line while `/map` is in flight, no spinner theatre. Empty / no
worktrees: an approachable empty state when the map resolves to no selectable corpus-bearing
worktree, explaining the absence and prompting a pick rather than reading as a fault.
Degraded: when the `tiers` block (read only through the stores hook) reports a backend down,
or when individual worktrees carry the `degraded` structural marker, the control still lists
what it can and renders the affected facet as designed degraded state with the reason in copy
tone, never as a bare error. Error: a genuine `/map` failure renders a contained,
non-alarming "workspace map unavailable" line scoped to the control, with a manual retry
control, plus the automatic periodic poll recovery (the 8 s error-state refetch) that
self-heals the picker after engine startup without a page reload. The rejected-durable-switch
status line is a fifth, transient honest state distinct from all of the above.

**Keyboard contract and a11y.** The control is keyboard-first. The collapsed trigger is a
button carrying `aria-expanded` reflecting the list state; focus order runs trigger then,
when expanded, each worktree row in the corpus-first order, with bare/degraded rows present
in tab order but conveying their non-selectable state through `aria-disabled` and treatment.
Arrow keys move between rows in the expanded list following the tree's ordering,
Enter/Space activates the focused corpus-bearing worktree (a no-op with a conveyed reason on
a bare row), and Escape collapses the list returning focus to the trigger. The control is a
labelled landmark with intent-revealing `aria-label`s on the trigger, the retry control, and
each row; the active-worktree selection is conveyed by fill plus weight, not hue alone; the
degraded and rejected-switch messages use `role="status"` so they are announced. All
keyboard-initiated actions are instant — the expand/collapse never animates — and
`prefers-reduced-motion` collapses any remaining transition to an immediate state change.

**Place in the four-layer ownership map.** The switcher is app-chrome (the glass): it reads
the `/map` query and the live status through stores hooks, invokes the stores' `setScope`
action and the session-persistence mutation, and never fetches the engine, defines no
worktree shape of its own, and reads `tiers` only through a stores hook. The wholesale reset
that makes a swap clean lives in the stores layer, not here; the control's sole
responsibility is to present the map and emit the selection intent. It projects over the one
model: a worktree selection is simply the scope value every other view's query is keyed by,
and swapping it re-projects the entire dashboard over the new corpus without any view
holding cross-scope residue.

**How the swap resets the projection cleanly.** Because scope is fully stateless on the
wire and every working-tree-dependent query is keyed by `(scope, filter, as_of)`, changing
the scope value naturally re-keys and re-fetches every projection over the one model — the
stage constellation, the vault tree, the timeline, the inspector — against the new corpus.
The view store's wholesale reset is what guarantees the client-side residue is cleared in
the same move, so the new corpus is never contaminated by the prior scope's filters, lenses,
pins, selection, timeline position, or live-connection counters. Scope isolation is thus a
property of two cooperating mechanisms — the contract's stateless keying and the stores'
single-move reset — and the switcher's job is only to fire that one transition correctly.

**Tokens, motion, density, icons applied to this surface.** All visuals resolve to the
inherited `:root` token layer: surfaces are the warm low-chroma neutrals carried into dark,
the control dimmed relative to the stage with the active worktree brightest, borders the
soft rounded low-contrast 1px rule, selection and the dirty indicator the single muted
accent used sparingly. Type is the UI sans with tabular numerals on the ahead/behind counts
and the monospace on the worktree path; motion is the short token-bounded transition with
the reduced-motion and keyboard-instant carve-outs; icons are Lucide for the disclosure
caret, the git ahead/behind arrows, and the degraded warning mark, retiring the current
literal Unicode glyphs. No new ground, palette, type scale, motion budget, or icon source is
introduced.

## Rationale

The decision is a faithful application of the accepted base language to one surface, not a
fresh design. The base design-language ADR fixes the trend-follower register, the
attenuated-chrome law, the compact-but-breathing density, the felt-not-seen depth, and the
warmth-in-tokens discipline; the switcher as the topmost element of the scope rail is
exactly the kind of supporting chrome those laws govern, so re-specifying it against them is
correct and re-deciding any of them would be out of scope. The iconography ADR settles the
Lucide chrome source, which is what justifies retiring the current literal Unicode caret,
arrows, dot, and warning glyph in favour of maintained marks. The foundation wire contract
makes the rest mechanical: `/map` is the repository to branch to worktree projection with the
corpus and degraded flags, stateless scope is what makes a worktree selection nothing more
than a query key, and the `tiers` block is the truthfulness mechanism rendered as designed
degradation. Most importantly, the wholesale-stateless swap is pinned here because it is the
HIGH state-corruption invariant (finding 022) and the home of the isolation findings
018/023: keeping the reset in the stores' `setScope` and keeping the switcher a dumb invoker
is precisely the layer-ownership and projection discipline those findings demanded, and is
what stops cross-scope residue from re-scattering across the surface. The optimistic-then-
durable selection with an honest rejection line, and the existing poll-recovery on `/map`,
are the contract's degradation truthfulness applied to the one control that changes what the
whole dashboard sees.

## Consequences

- **Gains.** The switcher reads as a native member of the agentic-desktop cohort: a quiet,
  attenuated, keyboard-first scope chooser with the active worktree brightest and bare refs
  honestly de-emphasised. Moving the caret, sync arrows, and warning mark onto Lucide makes
  them grayscale-safe and theme-correct for free and retires the legacy Unicode glyphs.
  Pinning the wholesale-stateless swap as this control's defining behaviour, with the reset
  owned by the stores' `setScope`, keeps the 022 isolation invariant in one place and the
  control a dumb invoker. The honest five-state model (loading, empty, degraded, error with
  retry, rejected-switch) plus automatic poll recovery makes the control truthful and
  self-healing under engine startup and backend degradation.
- **Costs and difficulties.** The legacy Unicode glyphs and legacy token class names must be
  migrated to Lucide marks and the inherited tokens, and the degraded and empty states must
  be written with genuine copy tone rather than a generic error. The primary-versus-dimmed
  treatment for corpus-bearing versus bare/degraded worktrees must be designed to read by
  weight and treatment alone so the grayscale-safe gate holds. Tabular-numeral discipline on
  the ahead/behind counts and monospace on the path must be held deliberately.
- **Risks.** The standing temptation is to let the control accrete swap-reset logic locally
  "to be safe" or to grow a convenience fetch — both would breach the single-wire-client
  boundary and risk re-scattering the isolation logic the 022 finding consolidated into
  `setScope`; the reset must stay in the stores layer. A new piece of per-scope state added
  elsewhere in the dashboard that is not wired into `setScope`'s reset would silently
  reintroduce cross-scope bleed; the existing isolation invariant and its adversarial tests
  guard against that, and any new per-scope state must extend the reset. Warmth could creep
  into the empty state as decoration; the base language's warmth-in-tokens guardrail governs
  it.
- **Pathways opened.** A clean, projection-only switcher makes future scope tooling cheap to
  add as further stores-backed dumb controls in the hosted slot — a multi-repository
  grouping, a recent-scopes shortlist, or a future multi-scope composition the contract
  keeps open by keeping scope a parameter — without entangling the swap or the rail chrome.

## Codification candidates

The defining constraint of this surface — that a worktree selection swaps stage scope
wholesale and statelessly with no per-scope state bleeding across scopes — is already
codified. The HIGH state-corruption isolation invariant (finding 022, with siblings
018/023) is bound by the existing `dashboard-layer-ownership` rule (the stores layer is the
sole owner of the cross-scope reset), and the projection-over-one-model property by
`views-are-projections-of-one-model`; the contract's `tiers` truthfulness is bound by
`every-wire-response-carries-the-tiers-block`. This ADR is a per-surface application of those
settled rules and introduces no genuinely new durable constraint, so this section is
intentionally empty.
