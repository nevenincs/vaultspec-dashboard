---
tags:
  - '#adr'
  - '#workspace-picker-dialog'
date: '2026-07-14'
modified: '2026-07-14'
related:
  - "[[2026-07-14-workspace-picker-dialog-research]]"
  - "[[2026-07-12-single-app-runtime-adr]]"
  - "[[2026-06-14-dashboard-workspace-registry-adr]]"
  - "[[2026-06-20-left-rail-top-adr]]"
---

# `workspace-picker-dialog` adr: `production add-project folder picker` | (**status:** `accepted`)

## Problem Statement

The add-project dialog — the surface every entry point (worktree dropdown, project
navigator, mobile switcher sheet, first-run onboarding, command palette) funnels
into for registering a workspace root — is a typed-path prompt with a one-level
folder list hidden behind a "Browse…" link. Research confirmed it is buggy (browse
never seeds from the typed path, focus drops per level, level flashes, Enter races
registration), inverts picker convention (click navigates; choosing needs a
separate header button), lacks every standard control (breadcrumbs, places,
filter, autocomplete, hidden-folder handling, registered markers), and has no
Figma design — a design-system-rule violation on a production surface. This ADR
decides the production redesign.

## Considerations

- single-app-runtime O6 stands: a browser SPA cannot open a native folder dialog;
  the picker is an in-app browse surface over the engine.
- dashboard-workspace-registry semantics are frozen: registration stays the
  validated `add_workspace` write on `PUT /session`; no second registration path.
- Wire-contract law: displayed/filterable state (hidden, registered, places,
  filtered listings) must be backend-served, never frontend-derived; error
  degradation reads typed truth, not message text.
- Filtering law: a client may not narrow a truncated listing; any narrowing of a
  capped level must apply engine-side pre-cap.
- Resource-bounds law: every listing stays capped and stated; probes stay
  non-recursive read-only metadata.
- Design-system law: Figma is binding; frames must exist before the surface ships.

## Considered options

- **O1 Native OS picker** — rejected (re-affirms single-app-runtime O6): the SPA
  cannot invoke one, and an engine-spawned dialog breaks headless/remote serves.
- **O2 Browser File System Access API** — rejected: Chromium-only, returns opaque
  handles without absolute paths, so it cannot feed `add_workspace`.
- **O3 Patch the existing browser minimally** (seed from input, fix focus) —
  rejected: leaves the inverted interaction model, no places/filter/breadcrumbs,
  and still no design; does not reach the production bar.
- **O4 Full in-app picker: redesigned dialog + enriched `/fs/list` projection —
  CHOSEN.** One dialog upgrade serves all five entry points; the engine serves the
  new display truth; Figma frames bind the design.

## Constraints

- `GET /fs/list` today serves one level, name-sorted, `MAX_ENTRIES = 256`,
  `is_git`/`is_managed` only; enrichment must stay read-only, bounded, and
  non-recursive (two metadata probes per row remain the ceiling; the hidden
  attribute rides the same directory-entry metadata).
- The engine holds the workspace registry and the session; the client must not
  re-derive registration state by path comparison (Windows case/normalization
  hazards).
- Registered-root recents (`useProjectHistory`) and the registry (`useWorkspaces`)
  already exist client-side as stores seams; the picker composes, never re-fetches.
- The kit `Dialog`, `Button`, `StateBlock`, `Skeleton`, focus-zone, and token
  system are the only primitives; no bespoke atoms (design-system rule).
- Error copy must stay friendly; the raw engine/git message never renders.

## Implementation

**D1 — Select-then-confirm interaction model.** The browser becomes the dialog's
body (full dialog height, not a 12rem strip behind a link). Single click/arrow
selects a row; double-click or Enter (and the breadcrumb) navigates; the primary
footer button confirms the SELECTION, falling back to the current directory when
no row is selected. Any visible folder is choosable without entering it.
Selection and browse level stay widget-intrinsic component state; the path draft
stays in the add-project chrome store.
*Amended 2026-07-15 (user decision during execution):* the confirm carries a
STATIC "Pick folder" label rather than interpolating the chosen folder's name —
a basename in the button ("Add `code`") read as a different action, and the
selection is already visible in the browser and the path field.

**D2 — Breadcrumb path bar replaces `..` and the truncated header.** The current
location renders as clickable segments (roots-overflow at the left); the `..` row
disappears. Keyboard focus is preserved across level changes (the list refocuses
its first row after navigation; `placeholderData: keepPreviousData` on the level
query kills the flash).

**D3 — Places rail.** A left rail inside the dialog lists: Home, filesystem
roots/drives, registered projects (jump straight to a root's parent), and recent
picker locations. Home and drives are engine-served (D4); registered projects and
recents compose from the existing `useWorkspaces` / `useProjectHistory` seams.
On compact widths the rail collapses to a horizontal chip row.

**D4 — `/fs/list` projection enrichment (additive, wire-contract event).** The
response gains: per-entry `is_hidden` (dotfolder or OS hidden attribute) and
`is_registered` (engine-side registry cross-reference); a roots-level `places`
block (home directory + drives with labels); request params `q` (name filter
applied PRE-cap, so a truncated level stays filterable engine-side) and `hidden`
(include hidden entries, default false, applied pre-cap). Sorting stays
name-sorted; the cap and stated `truncated` are unchanged. Registered rows render
marked and non-actionable; hidden rows appear only under an explicit "show
hidden" toggle and render de-emphasized.

**D5 — Path field and browser are one control.** The path input reflects the
browsed location live; typing/pasting an absolute path re-roots the browser to
the deepest existing ancestor (debounced, via the same level query); child-name
autocomplete completes the last segment from the parent level's served entries.
Enter in the path field navigates/roots — it never submits registration directly;
only the footer button registers.

**D6 — Typed refusal reasons.** `add_workspace` refusals carry a typed machine
`reason` (`not_a_directory`, `not_a_git_workspace`, `already_registered`,
`unreadable`) in the error envelope beside the human message; the client maps
reason → friendly copy and deletes the message-regex mapping (no bridge kept).

**D7 — Figma-first design coverage.** Author the dialog's frames in the binding
file before implementation: default (places + browser), selection active, filter
active, hidden shown, error, truncated, degraded, and first-run context, at
desktop and compact widths, composed from Kit atoms and tokens. Node names equal
the React exports (name-as-contract). The dialog keeps the shared action id
`left-rail:add-project` and its export name, so all five entry points and the
keymap/palette enrollment are untouched.

## Rationale

Research (see `related:`) showed every defect and gap concentrates in one dialog
consumed by five surfaces, so a single redesigned picker is the highest-leverage
fix. The interaction model (D1/D2) follows the conventions operators already know
from VS Code's in-app open-folder and OS dialogs — select-then-confirm with
breadcrumbs — which directly resolves the reported "difficult to navigate".
Engine-served `is_hidden`/`is_registered`/`places`/`q` (D4) is forced by the
wire-contract and filtering laws: the client may neither derive display truth nor
narrow a truncated level. Typed reasons (D6) replace the brittle message-regex
with contract truth, matching the tiers philosophy. Figma-first (D7) closes the
standing design-system violation rather than perpetuating it.

## Consequences

- All five entry points upgrade at once; no consumer changes beyond the dialog.
- The `/fs/list` enrichment is additive but IS a wire contract event (new fields,
  new params, typed refusal reasons) — reviewed engine + GUI, live-wire tested
  over the fixture vault.
- The engine route grows registry access (for `is_registered`) and a home-dir
  probe; both stay read-only. Windows hidden-attribute detection adds a per-row
  metadata read within the existing probe ceiling.
- The message-regex error mapper is deleted, not bridged; any caller of the old
  shape would need the typed reason (none known).
- New Figma frames become the binding source for this dialog; future visual
  drift is checkable against them.
- Autocomplete stays bounded (it reads the already-cached parent level; no
  per-keystroke wire fan-out), at the cost of not completing across
  truncated-away names — accepted; `q` filtering covers that path.
