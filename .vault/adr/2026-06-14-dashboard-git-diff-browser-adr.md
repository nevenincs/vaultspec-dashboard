---
tags:
  - '#adr'
  - '#dashboard-git-diff-browser'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - "[[2026-06-14-dashboard-design-language-adr]]"
  - "[[2026-06-14-dashboard-iconography-adr]]"
  - "[[2026-06-14-dashboard-design-language-research]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
---

# `dashboard-git-diff-browser` adr: `git diff browser` | (**status:** `accepted`)

## Problem Statement

The dashboard's design-driven recodification re-skins every surface onto the base UI
language. This ADR pins the **git diff browser**: the surface for browsing the active
worktree's git working-tree state and changes — repository status (clean or dirty,
ahead/behind divergence against upstream), the changed-files list, expand/collapse of
change rows, and a diff view for a selected file. It is spec work; it codifies what the
surface is and the UX laws it obeys under the inherited base language, and it changes no
application code.

The surface matters because the dashboard is a knowledge-graph instrument over a
vault that lives in git, and the operator needs to see what has changed in the working
tree at a glance and inspect the actual textual change in a file. The current form is a
thin status overview, not a diff browser; this ADR scopes the fuller surface while
honoring the engine's read-and-infer boundary and the one law this surface guards above
all others: diff legibility is sacred.

## Considerations

The current form is `frontend/src/app/right/ChangesOverview.tsx`, the right-rail
"changes overview". Today it renders three things from two stores hooks: a git status
header (`useEngineStatus` → `git.branch`, `git.ahead`, `git.behind`, and a count of
`git.dirty`), a "working changes" list of dirty file paths (rendered by basename, vault
paths flagged, no per-file diff body), and recent-commit plus vault-activity event rows
(`useEngineEvents`) with expand/collapse to cross-highlight associated node ids on the
stage. It already carries two explicit forward markers: a `TODO(fe-platform)` to wire a
per-file diff once a stores hook lands, and a `TODO(contract)` requesting a dedicated
`sha` plus `subject` field on commit events. It currently uses ad-hoc Unicode glyphs
(`⑂`, `✎`, `✏`, `☑`, `↑`/`↓`) and the prior paper-warm tokens.

The base design-language ADR requires this surface to read as a native member of the
agentic-desktop cohort: warm low-chroma neutrals, one muted accent spent only on
selection and interactive highlight, structure felt through subtle elevation and soft
rounded borders rather than heavy boxes, tabular numerals mandatory on the ahead/behind
counts and the per-file add/remove tallies, monospace reserved for true code and
identity (the diff body, file paths, short SHAs), keyboard-first interaction, and fast
state-communicating motion that goes instant under reduced-motion. The iconography ADR
supplies the marks: Lucide for structural chrome (chevrons for expand/collapse) and
Phosphor for the domain plane (`git-commit`, `git-branch`, file marks), each passing the
14px grayscale-by-shape gate. The retired hand-drawn glyphs and the ad-hoc Unicode
characters both leave.

The wire contract (foundation reference §6/§7) supplies the data: `/status` returns the
point-in-time rollup including `git: { branch, ahead, behind, dirty: string[] }` for the
active worktree, and the `git` SSE channel streams HEAD moves, ref changes, and
worktree dirty-state changes. The map worktree shape also carries optional `ahead` and
`behind` (absent when no upstream is configured). This ADR notes that the surface may
**expand** the current status overview into a fuller diff browser — a status-grouped
changed-files list and an actual diff view — and scopes that expansion here, while
recording honestly that two of its richer affordances (per-file status grouping beyond a
flat path list, and a per-file diff body) are not yet served by the v1 wire and depend
on a read-only diff capability the engine does not currently expose.

## Constraints

- **The engine is read-and-infer; this surface never writes git.** No stage, unstage,
  commit, discard, checkout, or any working-tree mutation may appear on this surface or
  in any hook feeding it. The browser observes git state; it never changes it. Git data
  arrives only through the `/status` snapshot, the `git` SSE channel, and — for a future
  diff body — a read-only `/ops/git` style pass-through that returns a diff verbatim
  without engine semantics. Any write-shaped affordance is out of scope and forbidden.

- **Diff legibility is sacred.** Per the base language's color discipline, added and
  removed semantics keep their high-contrast green and red even within the warm theme,
  overriding warmth on conflict. This is the one place where the single-accent
  restraint is deliberately set aside: the diff is allowed two saturated semantic hues
  because legibility of change is the surface's whole purpose.

- **Color is never the sole signal.** Added/removed lines must also carry a `+`/`-`
  gutter glyph and a programmatic label, and changed-files rows must carry a status
  letter or labeled mark, so the diff and the change list read correctly in grayscale,
  for color-blind operators, and to assistive technology — the base language's
  grayscale-safe identity gate applied to diff state.

- **Reads `tiers` only through the stores layer.** The surface is app chrome; it
  consumes stores selectors and the stores' git SSE subscription and never fetches the
  engine directly and never reads the raw `tiers` block. When the git tier is absent
  from a response, that is a designed degraded state ("no repository state"), rendered
  as such, never as an error.

- **It must NOT** define its own git data shape, hold its own query cache, open its own
  SSE connection, exceed the contract's bounded event/diff payloads, or render an
  unbounded full-tree diff inline.

- **Parent-feature stability.** The status snapshot, the `git` channel, ahead/behind,
  and the tiers mechanism are settled v1 contract. The two richer affordances depend on
  capability the wire does not yet serve: the `dirty` field is a flat `string[]` of
  paths with no per-file status grouping (added vs. modified vs. deleted vs. untracked),
  and there is no per-file diff endpoint (the contract's `/graph/diff` is the temporal
  graph delta, a different thing entirely). This ADR specifies the full surface but
  marks the status-grouped list and the diff body as engine-blocked, to be served by a
  read-only diff pass-through and a richer dirty-entry shape requested as a contract
  capability addition.

## Implementation

**Scope.** The git diff browser is the right-rail surface owning the active worktree's
working-tree state and its changes. It comprises a repository status header, a
changed-files list grouped by status, expand/collapse change rows, and a diff view for a
selected file. It absorbs and re-skins today's `ChangesOverview` status header and dirty
list under the base language, keeps the commit/activity event rows as adjacent context,
and adds the diff-view affordance as the surface's reason to exist. The fuller list
grouping and the diff body are specified now and land as the engine capability arrives.

**Repository status header.** A compact, attenuated header band states the worktree's
identity and divergence: a Phosphor `git-branch` mark, the branch name, and the
ahead/behind divergence rendered with tabular numerals and an explicit up/down mark plus
label (not arrows alone). Divergence shows only when an upstream is configured (absent
ahead/behind means "no upstream", not "zero"). A status pill states clean versus the
changed-file count, color reinforced by a label so "clean" and "N changed" read in
grayscale. The header uses the muted accent only for the selection/focus ring, never as
fill; structure is a single soft rounded border on a raised surface.

**Changed-files list grouped by status.** The dirty set is presented grouped by git
status — staged, modified, added, deleted, untracked, renamed — each group labeled, each
row carrying a Phosphor file mark, a status letter or labeled status mark (so status is
not color-only), the file's path shown by basename with the full path on hover and to
assistive technology, and a vault marker for `.vault/` corpus files. Rows are dense but
breathing per the base density law. Until the wire serves per-file status, the list
degrades gracefully to the current flat changed-paths rendering under one "working
changes" group; the grouping is the target shape, the flat list the honest interim.

**Expand/collapse change rows.** Each change row is a disclosure: a Lucide chevron
toggles the row open to reveal that file's diff view inline (or, when a diff body is not
yet available, the file's status and path detail). The same semantic disclosure
animation is used everywhere on the surface and on the commit/activity rows, fast and
short, instant under reduced-motion and for keyboard-initiated toggles. Expansion state
is local view state and isolated per scope so switching worktree does not leak an open
row across scopes.

**The diff view.** The selected file's diff renders as a reviewable, scannable document
(the instrument-surface grammar), not a chat or a modal: a hunk-by-hunk body in
monospace, each hunk introduced by its range header, with tabular line numbers in twin
gutters (old and new) and a change-type gutter glyph. Added lines are high-contrast
green with a `+` glyph and an "added" programmatic label; removed lines are high-contrast
red with a `-` glyph and a "removed" label; context lines are neutral ink. The green/red
override warmth and are the surface's defended exception to single-accent restraint.
The diff body is bounded (the engine serves a bounded read-only diff, never an unbounded
full-tree dump inline) and states any truncation honestly. The diff is a pure projection
of read-only git data; it offers no line-staging or any write affordance.

**States.** Loading: a subtle liveness cue while the status snapshot or a diff is in
flight, tied to real in-progress work, never ambient. Empty / clean-tree: an
approachable empty state ("working tree clean") in the warm copy tone, with the status
header still showing branch and divergence. Degraded per `tiers` (git tier absent): a
designed "no repository state" state — the surface reports the repository view is
unavailable, distinct from an error and never rendered as a failure, with the rest of
the chrome unaffected. Error (a request genuinely failed): a legible error with a retry
affordance, distinguished from degradation. A file with no textual diff (binary, or a
pure rename) states that plainly rather than rendering an empty body.

**Keyboard contract and a11y.** The surface is keyboard-first: the changed-files list is
arrow-navigable, a row's disclosure toggles by keyboard, and the diff body is navigable
by keyboard (hunk-to-hunk and line scrolling) without a pointer. Keyboard-initiated
toggles never animate. Color is never the sole signal anywhere: add/remove carry `+`/`-`
glyphs and labels, file status carries a letter or labeled mark, clean/dirty carry text.
All icons are decorative-hidden with the meaning carried in adjacent text or an
accessible label; full paths and SHAs are exposed to assistive technology even when
visually truncated. `prefers-reduced-motion` swaps every transition for an instant state
change. Tabular numerals on every count and on the diff line-number gutters keep columns
aligned.

**Layer ownership and projection.** The git diff browser is app chrome in
`frontend/src/app/`. It consumes stores selectors for git status and the stores' git SSE
subscription, and a future stores diff query for the diff body; it never fetches the
engine directly, never opens its own SSE connection, never reads the raw `tiers` block,
and never writes. It is a dumb view projecting over the one model: git working-tree
state is a projection the stores layer owns and exposes, and this surface subscribes and
emits selection intent (select a file, select a commit to cross-highlight on the stage)
back through the view store. A new richer git projection (status-grouped entries, diff
body) lands as a stores query over the engine's read-only git surface, not as a new
fetch in chrome. Base tokens, motion grammar, density, and the two sanctioned icon
families apply throughout.

## Rationale

The decision inherits the base UI language and the iconography ADR wholesale and
re-decides nothing about color, theme, depth, typography, motion, density, or icon
sources; it applies them to one surface. The single genuine tension — warmth versus
diff legibility — is resolved exactly as the base language already pre-resolved it: diff
green/red override warmth, because change legibility is this surface's entire reason for
being and the base color discipline names diff legibility as sacred. Pairing that with
the grayscale-safe "color is never the sole signal" gate makes the diff correct for
color-blind operators and assistive technology without weakening the high-contrast
treatment, which is the same shape-first identity discipline the base language applies to
tiers and node types.

Honoring read-and-infer keeps the surface aligned with the settled engine boundary: a
git browser is naturally tempted toward stage/commit affordances, and naming that
boundary explicitly forecloses scope creep that would breach the engine contract. The
layer-ownership and projection rules settle who owns the git model (the stores layer,
the sole wire client) and let this ADR specify the surface without reopening
architecture — the diff view is one more projection over the one model, surfaced by a
stores query, consumed by a dumb view. Scoping the fuller list-grouping and diff body
now, while marking them engine-blocked, records the target shape honestly rather than
either pretending the wire already serves them or pretending the surface is only a status
strip.

## Consequences

- **Gains.** The right-rail changes surface becomes a real git diff browser, native to
  the agentic-desktop cohort, with a defended sacred-legible diff view. The ad-hoc
  Unicode glyphs and paper-warm tokens are retired in favor of the two sanctioned icon
  families and the shared token layer. The status-grouped list and the diff body are
  specified, so the engine capability requests have a concrete consumer to satisfy.
  Degradation, keyboard navigation, and grayscale-safe diff state are designed in from
  the start rather than retrofitted.

- **Costs and difficulties.** The richest affordances are engine-blocked: per-file
  status grouping needs the `dirty` field to carry a status per entry rather than a flat
  path, and the diff view needs a read-only diff pass-through the wire does not yet
  expose. Until both land, the surface ships the re-skinned status header and a flat (or
  single-group) changed-files list, with the diff view behind the capability. Defending
  green/red contrast against warm-theme drift is a standing discipline, not a one-time
  fix, and the diff gutters demand careful tabular alignment work.

- **Risks.** The read-and-infer boundary is a discipline the surface must keep honoring;
  a future contributor adding a "discard" or "stage" button would breach the engine
  contract. The diff body must stay bounded — an unbounded inline full-tree diff is the
  scale cliff the bounded-payload rules exist to prevent. The capability requests must be
  routed through the contract as additions, not improvised as engine semantics.

- **Pathways opened.** A read-only diff pass-through and a richer dirty-entry shape, once
  served, benefit any surface that wants to show change detail. The commit cross-
  highlight already wired here extends naturally to letting a selected diff file
  cross-highlight its vault node on the stage, deepening the graph-instrument framing.

## Codification candidates

Empty. This ADR applies already-settled constraints — read-and-infer, diff-legibility-
sacred, color-not-sole-signal, layer ownership, tiers truthfulness — to one surface; it
introduces no new cross-session obligation beyond those existing rules and candidates.
