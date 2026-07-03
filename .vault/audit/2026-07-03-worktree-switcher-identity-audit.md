---
tags:
  - '#audit'
  - '#worktree-switcher-identity'
date: '2026-07-03'
modified: '2026-07-03'
related: []
---

# `worktree-switcher-identity` audit: `switcher identity display and location duplication`

## Scope

A UX and functionality review of the workspace/worktree/project switcher (the left rail's
`WorktreePicker` and its stores seams) plus the right rail's location display, requested as
a cornerstone-feature hardening pass. Question under audit: is the
project/worktree/branch identity obvious at a glance, is the dropdown coherent, and is the
location state centralized? Evidence: full code read of `frontend/src/app/left/WorktreePicker.tsx`,
`frontend/src/stores/server/queries.ts` (picker presentation + location anchor),
`frontend/src/stores/view/worktreePickerChrome.ts`, `frontend/src/app/right/StatusTab.tsx`,
plus live captures against the running app (four registered projects, two worktrees).

## Findings

### location-duplication | high | the right rail LocationStrip duplicates the left rail switcher

The right rail Status tab renders a worktree + branch + absolute-path strip that repeats the
left rail trigger's identity display, differing only by the path line. Location state is
stated twice, 20px apart, violating the requested one-place centralization.

### location-strip-literal-main | high | the LocationStrip "worktree name" is a hardcoded literal

`deriveLocationAnchor` sets `mainLabel: isMain ? "main" : null`: the leading word is the
string "main" shown iff the worktree is the default, not the worktree's name. It reads
correctly only when the default worktree happens to be named main; any other worktree shows
no name at all, and a default worktree in a differently-named folder would still say "main".

### trigger-no-project-identity | high | the trigger states no project identity

The trigger headline is the worktree path basename only. In the dominant
`repo-worktrees/branch` layout every project's primary worktree is named "main", so the
headline cannot identify the project. The codebase already solves this for project rows
(`workspaceRootName`) but the headline does not use it.

### recents-inverted-emphasis | medium | cross-project recents lead with the wrong token

Recent rows render the worktree basename full-ink with the distinguishing project label
faint and right-aligned; live capture showed three visually identical "main" rows. The
active row omits the project entirely.

### worktree-rows-no-branch | medium | dropdown worktree rows never show their branch

Rows show only the folder basename. A worktree named main checked out on a feature branch
reads as "main" in the list while the trigger shows the feature branch; the two surfaces
disagree about the same worktree's identity. The governing switcher ADR calls the branch
"the human-readable identity" of a row.

### all-worktrees-mislabel | medium | "All worktrees" lists only the active project's worktrees

With four projects registered, "All worktrees · 2" reads as a wrong machine-wide count. The
listing is the active project's `/map`; the label must name the project.

### chevron-detached | medium | the trigger chevron floats detached from the title

The title span is `flex-1`, pushing the 12px chevron to the pill's far right edge next to
the 16px rail-collapse button; on a short name like "main" the affordance reads as a
separate control. Dropdown rows also start text at four different leading columns
(icon rows vs cue-bar rows vs chevron rows).

### terminology-leaks | medium | internal vocabulary in user-facing strings

"worktree scope" / "choose a worktree scope" / "worktree scopes" (aria), "workspace map
unavailable", "no vault-bearing worktree", "no scope — pick a worktree first" (stage
overlay), and the "·bare" badge (set on `!has_vault`, which is not what bare means in git).
Casing drifts: "retry" vs "Retry", lowercase empty-state sentences.

### pending-status-mismatch | low | during a switch the trigger mixes target and old state

The headline shows the pending target worktree while the git-status line underneath still
reads the outgoing worktree's branch (`isActive` row vs headline row).

### aria-haspopup-mismatch | low | the trigger promises a listbox that does not exist

`aria-haspopup="listbox"` on the trigger, but the popup is a plain list of buttons with no
listbox/option roles.

### post-execution-review | pass | independent review of the executed fix found no revisions

A read-only reviewer audited the executed diff against the companion ADR and plan:
verdict PASS, no critical or high findings. Selector purity, the pending-aware headline,
the branch/recent label derivations, layer ownership, and the no-bridge deletion were each
confirmed; the two low cosmetic notes (a dangling frame-catalog row, a stale capture-helper
selector) were actioned before commit. The compact viewport was re-captured to confirm the
left-rail trigger identity block is mounted and legible there, since it is now the sole
location display.

## Recommendations

Centralize location identity in the left rail trigger as one block: project name over
worktree title (chevron hugging the text) over branch + git state over a faint mono
absolute path. Delete the LocationStrip and its location-anchor selector outright (no
bridge). In the dropdown: lead cross-project recents with the project, show the branch on
worktree rows, name the project in the worktree disclosure label, and align every row on
one leading glyph column. Sweep internal vocabulary out of user-facing strings and drop the
false listbox promise. Decisions recorded in the companion ADR; execution in the companion
plan.
