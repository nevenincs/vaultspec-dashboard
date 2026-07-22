---
tags:
  - '#adr'
  - '#review-surface-flow'
date: '2026-07-19'
modified: '2026-07-21'
related:
  - "[[2026-07-19-review-surface-flow-research]]"
  - "[[2026-07-16-agentic-authoring-ux-adr]]"
  - "[[2026-07-02-agentic-operation-modes-adr]]"
  - "[[2026-06-29-agentic-review-station-state-adr]]"
---

# `review-surface-flow` adr: `one review flow: de-modalized pending-changes inbox in the agent panel` | (**status:** `accepted`)

## Problem Statement

The product carries one shared proposal card mounted on two surfaces: inline
per-turn in the Agent transcript (bound by served `run_id`) and as the
standalone "Approvals" queue. The same-feature research finds the model
PARTIALLY-CONFORMANT against the industry: the inline card matches the
unanimous inline-first pattern, but the standalone queue is hosted in a MODAL
dialog (`ControlPanels`) — a shape no surveyed product uses for a cross-run
surface — and the modality contradicts the reasoning the agentic-authoring-ux
ADR itself used to reject its option O1. The autonomy control is stranded
inside that modal and cannot be seen before a proposal exists. There is no
route from the conversation to the rest of the pending queue. This ADR decides
the target flow: F1 de-modalize the station, F2 relocate the autonomy control,
plus the bridge affordance connecting the two surfaces. It AMENDS the
agentic-authoring-ux ADR's disposition row for the Approvals dialog; it does
not supersede that ADR, and it leaves the served review-station state model
(the station-state ADR) untouched.

## Considerations

- Industry unanimity (research benchmark): the happy path is inline in the
  conversation; every legitimate second surface (Codex cloud tasks, Cursor
  agents page, Antigravity Manager, the Copilot PR) is a cross-run inbox and
  never a modal.
- The standalone queue is functionally necessary: it alone covers proposals
  with no served `run_id`, proposals beyond the bounded transcript window or
  from expired sessions, and the applied-under-policy after-the-fact lane.
  Deleting it would orphan those classes — the queue must move, not die.
- The shared-card architecture (one `ProposalCard`, one `useReviewActions`)
  means the two mounts cannot diverge on verbs or eligibility; any host change
  is a container move, not a card rewrite.
- Operation mode is scope-level (worktree) with a narrow-only session override
  in the policy vocabulary (operation-modes ADR), but the wire serves no
  scope-level mode read: the mode is observable ONLY through a proposal's
  policy block. The mode-set verb exists (`POST /v1/mode`, worktree-global).
- The owner's mandate: every agent-action review lives in the same UI/UX where
  the user prompts and watches transcripts.

## Considered options

- **O1 — Collapse the station into the transcript entirely.** Rejected: orphans
  the three proposal classes the transcript cannot show; review-completeness
  broken.
- **O2 — Keep the modal "Approvals" dialog as-is.** Rejected: modality blocks
  the document and the transcript while deciding; contradicts the
  agentic-authoring-ux ADR's own O1 rejection; no industry precedent.
- **O3 — A second docked shell panel (its own grid track) for the inbox.**
  Rejected: doubles shell chrome for a queue that is empty most of the time;
  two right-hand docks compete for width; the inbox has no independent
  composer, so it is a VIEW, not a region.
- **O4 — Host the station body INSIDE the Agent panel as a "Pending changes"
  view, with a bridge affordance from the transcript — CHOSEN.** One region,
  one flow; the inbox opens beside the work without blocking anything; the
  autonomy control and the queue land composer-adjacent by construction.

## Constraints

- **Wire gap (now in-repo, sequenced as its own phase):** no scope-level
  operation-mode GET exists; the served mode is derived from proposal policy
  blocks. The authoring plane is owned in this repo, so the gap closes here:
  the engine adds a `GET /v1/mode` beside the existing mode-set verb on the
  authoring router, serving the effective worktree mode from the same policy
  store the set-verb writes (the DEFAULT effective mode is served explicitly
  when nothing was ever set — never a 404), through the shared envelope with
  `tiers`. Until that read lands, the relocated control keeps today's honest
  proposal-derived gating; the relocation itself is NOT blocked.
- **Counts are engine truth (wire-contract):** the queue projection is capped
  and carries a `truncated` flag; the bridge affordance must not fabricate a
  total. It may count the SERVED rows it can see and must degrade to a
  count-less "more pending changes" wording whenever the projection is
  truncated.
- **Design-system Figma binding:** the Approvals frame `1089:4437` predates the
  redesign and is stale; the target inbox view and the relocated autonomy
  control need frames authored/updated as part of this feature (Figma is the
  binding source; the divergence window closes with this ADR).
- Parent-feature stability: the Agent panel shell, the shared card, and the
  review store hooks are landed and reviewed (agentic-authoring-ux epic
  complete); this ADR moves containers only.

## Implementation

- **F1 — De-modalize.** The Agent panel gains a second view, "Pending
  changes", switched in the panel header (transcript ⇄ inbox; the transcript
  stays the default). The view hosts the existing `ReviewStationSection` body
  (queue rows, applied-under-policy lane, degraded/truncation states)
  unchanged. The "approvals" entry is removed from the modal `ControlPanels`
  host; the footer Approvals chip re-routes through the shared action seam to
  open the Agent panel directly in the inbox view. Chip identity, count
  source, and vocabulary keys are preserved; the modal Dialog host for
  approvals is deleted, not hidden. The OTHER three control panels (Search,
  Backend health, Vault health) stay modal DELIBERATELY — they are
  glance-and-close consoles over global status, not in-flow work; modality is
  wrong specifically for review because a review decision needs the work
  visible while deciding. The host asymmetry is principled, not temporary.
- **F2 — Autonomy relocation.** `AutonomyControl` mounts composer-adjacent in
  the Agent panel (above the composer slot), reading the same
  served-mode-observability it does today; the mount inside
  `ReviewStationSection` is removed (after F1 both would sit in the same
  panel). Same component, same mode-set seam, no behavioral change.
- **Bridge affordance.** When the served queue holds pending rows NOT
  correlated to the current session's runs, the transcript view shows a
  compact "N other pending changes" affordance (count honest per the
  truncation constraint) that switches the panel to the inbox view. It renders
  nothing when the queue is empty or fully represented inline — no standing
  chrome.
- **Interaction rules.** All existing action descriptors route through the one
  shared seam; the chip's re-route and the view switch are enrolled once
  (actions-keymap-palette law). No new fetch, no new client model, no raw
  `tiers` reads — the inbox view consumes the same store hooks the dialog body
  does today (a view rewrite freezes the contract).

## Rationale

The research verdict is that the inline card conforms and the modal host is the
liability. O4 resolves every non-conformance with the smallest true change:
`ReviewStationSection` is already self-contained, so the move is a host swap
plus a view switch; the card, the store hooks, and the served state model stay
frozen. Hosting the inbox inside the Agent panel — rather than beside it —
delivers the owner's "one flow" mandate literally: prompt, transcript, inline
review, cross-run inbox, and autonomy all live in one region with zero modal
interruptions, matching the conversation-primary hybrid the industry converged
on while keeping the cross-run coverage the transcript alone cannot provide.

## Consequences

- Gains: no modal ever interposes between the user and a review decision; the
  autonomy control becomes visible in the flow it governs; uncorrelated and
  after-the-fact proposals gain a signposted route from the conversation; the
  ControlPanels host shrinks to three genuinely global panels.
- Costs and risks: the Agent panel grows a view switcher (its first
  multi-view state — kept as local chrome in the panel's view store); tests
  bound to the "approvals" control panel and its opener must migrate;
  the footer chip's meaning shifts from "open dialog" to "open panel view"
  (one descriptor edit, guard-covered). Migration is low-risk because the card
  and store layers do not change.
- Adjacent residue already delivered before this ADR: the request-changes
  comment capture became an in-card inline composer (no modal), landed and
  live-verified separately — this ADR inherits, not schedules, that fix.
  Remaining Figma-side debt tied to this feature: the stale Approvals frame,
  plus new frames for the inbox view, the relocated autonomy placement, the
  inline request-changes capture, and the applied-under-policy lane.
- **Acceptance criteria (all mandatory before done):** full frontend gate
  (`just dev lint frontend`) green; live-wire vitest suite green; guard tests
  updated (control-panel vocabulary, action coverage); and a LIVE-DRIVE
  verification against the dev stack — headless-browser evidence that (1) the
  inbox opens inside the Agent panel while the editor stays interactive (no
  modal scrim), (2) the footer chip lands in the inbox view, (3) the autonomy
  control renders composer-adjacent when a mode is observable, (4) the bridge
  affordance appears exactly when out-of-session pending rows exist and
  switches views, (5) no "approvals" modal remains reachable. Screenshot
  artifacts are persisted with the execution records.
