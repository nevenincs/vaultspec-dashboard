---
tags:
  - '#adr'
  - '#worktree-switcher-identity'
date: '2026-07-03'
modified: '2026-07-03'
related:
  - '[[2026-07-03-worktree-switcher-identity-audit]]'
  - '[[2026-06-14-dashboard-worktree-switcher-adr]]'
  - '[[2026-06-20-left-rail-top-adr]]'
  - '[[2026-06-20-left-rail-top-research]]'
---

# `worktree-switcher-identity` adr: `one left-rail location identity` | (**status:** `accepted`)

## Problem Statement

The companion audit found the cornerstone scope switcher does not state where the operator
is: the trigger shows only a path basename ("main") with no project identity, the dropdown
shows visually identical rows for same-named worktrees across projects, worktree rows omit
their branch, and the right rail duplicates the whole display in a LocationStrip whose
"worktree name" is a hardcoded literal. Internal vocabulary ("scope", "workspace", "bare")
leaks into user-facing strings. The operator's requirement is explicit: location state must
be obvious and centralized in ONE place, the left rail.

## Considerations

- The left-rail-top ADR already names the top row the project switcher; the worktree
  switcher ADR names the branch the human-readable identity of a row. This ADR realigns the
  implementation with both, it does not replace them.
- `workspaceRootName` already derives a distinguishing project name from the
  `repo-worktrees/branch` layout; the fix is to apply it at the headline and recent rows,
  not to invent a new naming scheme.
- The engine serves worktree lists only for the ACTIVE project (`/map`); a full
  project-to-worktree tree for inactive projects would need a new wire read and is out of
  scope. The flattened dropdown sections stay; their labels must stop lying instead.
- Design rules bind: labels are user-facing plain language; no deprecation bridges on
  removal; store selectors return raw state.

## Considered options

- Keep the LocationStrip, add the project name to it: rejected; keeps the duplication the
  operator explicitly rejected and leaves two surfaces to drift.
- Move the absolute path into a tooltip only: rejected; "what folder am I reading" must be
  visible at a glance per the operator's requirement, not hover-gated.
- Rebuild the dropdown as a project-to-worktree tree: rejected for now; requires per-project
  map reads the engine does not serve. Recorded as a future coordination ask.
- Chosen: centralize the full identity block (project, worktree, branch and git state,
  path) in the left-rail trigger; delete the LocationStrip and its selector wholesale.

## Constraints

Frontend-only; no wire change. The compact viewport loses its bordered location card when
the LocationStrip goes; the left rail trigger carries the identity there too. Tests are
live-wire (no mocks) and several assert the exact strings being renamed; they move with the
strings in the same change.

## Implementation

The trigger becomes the one location identity block: a faint project line (via
`workspaceRootName` over the active registry root), the worktree title with the chevron
hugging the text (title no longer `flex-1`), the git-status line driven by the
pending-aware headline worktree (target during a switch, not the outgoing one), and a faint
mono absolute-path line with the full path as its tooltip. The presentation view in
`frontend/src/stores/server/queries.ts` gains the threaded active-project label, the
pending-aware headline worktree, and a per-row branch label; the dropdown worktree rows
render name plus branch, cross-project recent rows lead with the project, the worktree
disclosure label names the project, and every row starts on one leading glyph column. The
LocationStrip in `frontend/src/app/right/StatusTab.tsx` and the location-anchor selector
family are deleted with no alias or bridge. All user-facing strings drop internal
vocabulary ("scope", "workspace map", "vault-bearing", "bare") and adopt sentence case; the
trigger stops claiming `aria-haspopup="listbox"`.

## Rationale

One authoritative location surface removes the drift class outright (the literal-"main" bug
existed only because a second surface re-derived identity). Leading with the project on
cross-project rows makes the distinguishing token the primary ink, which is what identity
display is for. Naming the project in the disclosure label makes the count truthful.
Deleting rather than bridging follows the no-deprecation-bridges rule.

## Consequences

Gains: the operator reads project, worktree, branch, dirty/ahead/behind, and folder in one
glance at one place; the dropdown distinguishes same-named worktrees; screen-reader labels
speak plain language. Costs: the right rail loses its location header (accepted by the
operator); the trigger grows one line (path) - mitigated by faint caption styling. The
project-to-worktree tree remains a future engine ask; until then the dropdown stays
sectioned.
