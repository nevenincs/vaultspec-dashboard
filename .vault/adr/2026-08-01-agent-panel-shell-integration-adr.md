---
tags:
  - '#adr'
  - '#agent-panel'
date: '2026-08-01'
modified: '2026-08-01'
body_hash: 'sha256:bbf596b58119bbfa358076816ee2b7500a9adeaf566e28c71e0dce41c2de5de2'
related:
  - '[[2026-07-31-agent-panel-ux-research]]'
  - '[[2026-08-01-a2a-agent-flow-adr]]'
  - '[[2026-07-14-a2a-orchestration-edge-adr]]'
  - '[[2026-07-19-review-surface-flow-adr]]'
  - '[[2026-07-16-agentic-authoring-ux-adr]]'
  - '[[2026-07-31-visual-review-authored-states-adr]]'
  - '[[2026-06-22-mobile-responsive-layout-adr]]'
---

# `agent-panel-shell-integration` adr: `the agent panel becomes the graph's center-slot alternate — one toggle, one canonical home, the convergent composer and conversation grammar` | (**status:** `accepted`)

## Problem Statement

The shell today is [left rail | center dock {documents | graph} | activity
rail] with the graph treated as always-on, PLUS the AgentPanel as a
separate fourth grid column (agentic-authoring-ux D1). The owner's
proposal: the graph's center slot becomes a **{graph | agent panel}
toggle**, so agent flow lives where the graph lives, and an authoring
query ("research the rag performance feature") produces the default split
**[document being edited | agent panel]** in the center dock. The panel is
the interface where the user enters a query forwarded to a team or a
single agent, selects model and team, and attaches evidence with
`@rel/path` autocomplete. Its conversation rendering must follow what the
reference products actually do — verified live this pass
(`2026-07-31-agent-panel-ux-research` C1–C8), not guessed — and it must
render the mid-run clarification questionnaire the companion
`2026-08-01-a2a-agent-flow-adr` D5 defines. This record decides the
shell topology, the composer specification, and the conversation grammar.

## Considerations

- Dock ground truth (source-verified): the center is ONE dockview row;
  the graph is ALREADY a toggleable reserved panel — placeholder id
  `__graph__`, reconciled to the `graphVisible` shell verb, with the
  WebGL Stage portal-pinned over the placeholder rect
  (`GraphCanvasHost`) precisely so docking/toggling never re-parents the
  canvas (an app-lifetime singleton,
  `2026-07-31-visual-review-authored-states-adr` constraints). The
  visibility toggle already rides the dock's top-right header action
  cluster. When the graph is hidden, documents take the full width; with
  nothing open, the dock shows a ghost empty state.
- The AgentPanel's current home is an explicit 4th grid track appended to
  `gridColumns` — a second "beside the work" region competing with the
  dock for horizontal space. Two beside-the-work homes is the exact shape
  the owner's toggle proposal eliminates.
- The reference grammar is established: G1–G11 (opening/composer/shell)
  and C1–C8 (conversation rendering) in the grounding research, with
  coverage honesty recorded there (Antigravity blocked; no questionnaire
  UI observed in any reference — C-rules rest on Claude desktop and
  ChatGPT/Codex).
- C5 is the strongest convergent signal for topology: live run metadata
  (progress, roster, sources) belongs in a docked region beside the
  transcript, never interleaved into message flow. The dashboard already
  holds this state (`TeamRunProgressContext`, run-status roles/phase).
- The composer already carries most of the required anatomy panel-resident:
  `ComposerTeamSelector`, model pill, slash popover, mention chips
  (`agentComposer` store, cap 16), feedback batches, autonomy control
  composer-adjacent (review-surface-flow F2, landed).
- The panel's backend surface is entirely the frozen edge plus the
  companion ADR's three named contract events; nothing in this record
  adds wire.
- The compact shell currently mounts no agent surface at all; compact
  composition was an explicit deferral of the agentic-authoring-ux ADR.

## Considered options

- **Keep the 4th column and add a dock toggle too.** Rejected: two
  competing homes for one surface, permanent width starvation of the
  document pane during authoring flows, and a standing violation of the
  one-canonical-home mandate this campaign exists to serve.
- **Make the agent panel a free dockview document panel** (a draggable,
  closable tab like any document). Rejected: the panel is chrome-class,
  not a document — close/drag/tab-order semantics are wrong, and its
  lifecycle (recovery, chip fallback, keybinding target) is shell-owned,
  not workspace-owned.
- **Reserved center-slot panel toggled against the graph (CHOSEN).** The
  agent panel receives exactly the graph's own treatment: a reserved
  panel id in the same dock slot, an exclusive toggle, shell-verb state.
  Precedent is in-repo, proven, and canvas-safe.
- **Overlay/drawer over the graph.** Rejected: the non-modal law
  (review-surface-flow) exists because agent work needs the work visible;
  an overlay hides exactly the document the split is meant to show.

## Constraints

- The WebGL canvas singleton must never be re-parented; the toggle
  operates on the placeholder reconciliation only, exactly as
  `graphVisible` does today.
- Non-modal law: no agent operation ever opens a modal host
  (review-surface-flow); the questionnaire renders in-transcript.
- No new wire: this record consumes the frozen edge and the three
  contract events named in `2026-08-01-a2a-agent-flow-adr` D5 — nothing
  else. Relay frames stay non-authoritative (edge D3).
- Localization catalog law: every retired or added vocabulary key walks
  the four registered touch points; the module-size gate (1500) applies
  to all new frontend modules.
- The activity rail is untouched: it remains the status surface
  (activity-rail-realignment); this record changes only the center slot
  and the agent panel's home.

## Implementation

**D1 — The center slot is exclusive: `centerSlot: "graph" | "agent" |
"none"`.** The boolean `graphVisible` generalizes to a tri-state shell
verb. The agent panel becomes a second reserved dock panel (`__agent__`)
reconciled against `centerSlot === "agent"` exactly as `__graph__` is
against `"graph"`; the panel body is plain React (no portal needed — its
state lives in external stores, so placeholder add/remove is safe), while
the graph keeps its portal-pinned canvas untouched. The dock header
action cluster's graph toggle becomes a **segmented {graph | agent}
switch** (the toggle UX element), with the existing hide affordance
yielding `"none"`. The 4th grid track, `agentPanelClassName`,
`agentPanelWidth`, and the track math in `appShellGridColumns` are
DELETED, not bridged (`no-deprecation-bridges`). Every existing entry
point re-routes to the slot: footer AgentChip, `Mod+Alt+A`, palette
`agent:toggle-panel`, background menu, comment-send bridge, and the
Review chip (which opens the slot in the pending view). One vocabulary
ships with the re-route: the chip family and action labels move fully
under `common:agent.*`, retiring the "Approvals"/`panel:approvals`
naming.

**D2 — The default split is [document | agent].** With a document open,
selecting the agent slot (or starting any run) yields the owner's default:
document pane beside agent panel in the one dock row. With no document
open the agent panel takes the full center — which IS the begin idiom
(G1): a centered composer under a scope-personalized headline ("What
should we run against `<scope>`?" — the headline names the bound
worktree/document exactly as Codex names the repo), starter intent
affordances yielding to recents once history exists (G4/G11). With a live
transcript the composer docks to the panel bottom (G8: begin centers,
continue bottom-docks). Graph selected while a run streams → the existing
AgentChip remains the honest trace (unchanged behavior, new home).

**D3 — The composer is the two-row card, codified.** Row 1: free text;
placeholder teaches the product's own syntax ("Ask the team — @ to attach
evidence, / for commands"). Row 2 LEFT (what the agent works on): `+`
attach, the `@`-evidence chips, and the autonomy pill (which is the
approval-mode selector the references converge on, C6). Row 2 RIGHT (how
it thinks): the team/preset selector and the model picker rendering ONLY
served profiles (`2026-08-01-a2a-agent-flow-adr` D3), then send —
which swaps to a stop square while a run streams (C6). Enter sends;
there is no oversized send button. `@foobar` evidence attach: typing `@`
opens rel-path autocomplete riding the existing search-provider seam
(files-code + files-vault providers) scoped to the bound workspace;
accepted paths become mention chips (existing `agentComposer` cap 16)
and travel inside the message/prompt as structured rel-path references —
the a2a context harness already performs context-ref discovery; no new
wire. When autonomy is set to apply-automatically, a standing dismissible
warning banner renders above the composer (C7) — never a modal.

**D4 — Conversation rendering adopts C1–C8 as the transcript law.**
(a) User turns: right-aligned accent bubbles (settling the Figma
arbitration in the same direction as both references); assistant turns:
full-width open markdown — bubble-vs-open is the speaker cue (C1).
(b) Tool calls and thinking: ONE collapsed disclosure row per work
stretch ("Worked for …" with live elapsed), expanding to a flat
icon+label timeline that interleaves reasoning narration and tool steps —
one level deep, never nested, never separate turns (C2/C3). The existing
`ToolCallEntry` rows regroup under this disclosure; the inline
tool-permission prompt keeps its place inside the timeline.
(c) Proposals: the inline `ProposalCard` stays the happy-path review
object and gains the served aggregate diffstat (`+X −Y`) with per-file
stats, actions terminal-right — the C4 stat-card shape; full diffs stay
deferred to the existing DiffPanel.
(d) Run metadata — phase, role roster with per-role model, evidence
sources, elapsed — renders in a docked **run header region** of the panel
(collapsible), never interleaved into the transcript (C5). This is the
`TeamRunProgressContext` data rehomed, not new state.
(e) Turn recaps: an answered clarification renders as a bordered
question/answer recap card between turns (C8), the durable transcript
object the run's provenance deserves.

**D5 — The questionnaire surface: `ClarificationCard`.** Binds exactly
the companion ADR's D5 payload (≤4 questions; `choice` renders option
buttons, `text` renders a bounded input; `required` gates submit). It
renders in-transcript at the park point, non-modal, with the composer
disabled-with-hint while parked (the card is the answer surface — one
authority per state). Submit calls the new `clarification-respond` verb;
on success the card collapses into the C8 recap. Recovery is
authoritative: on reload the pending question re-renders from
`run-status` disclosure, never from relay memory. Honesty note carried
from the research: no reference app exhibited this surface; the design
derives from our wire shape plus Claude's observed recap-card precedent,
and is flagged for first-live-use review.

**D6 — Compact shell: named deferral, sharpened.** The center-slot
rehome is desktop-scope; compact composition remains deferred (as the
agentic-authoring-ux ADR already ruled) but the deferral now has a
number: the compact shell ships a read-only run-status affordance (chip →
sheet with transcript read and stop) before any compact composer is
attempted. Tracked in the plan; not part of this record's acceptance.

## Rationale

The owner's toggle proposal lands on the exact mechanism the codebase
already built for the graph: a reserved, shell-verb-reconciled dock panel
whose toggling is canvas-safe by construction. Choosing that shape makes
the rehome a deletion (the 4th track) plus a generalization (bool →
tri-state) rather than new architecture. The split default falls out for
free: dockview already renders documents beside the reserved panel. On
the conversation surface, every rule with two-product convergence (C1–C8)
is adopted as law — that is what "check it, don't guess" bought — while
the one surface no reference exhibits (the questionnaire) is designed
from our own authoritative wire shape and explicitly marked as ours. The
composer specification spends almost entirely on assets that exist
(selector, pill, chips, slash popover, autonomy control); its novelty is
the evidence autocomplete riding the established provider seam and the
codification of the left/right row law before it drifts.

## Consequences

- One canonical home, literally: agent flow occupies the graph's slot on
  demand, the document stays visible through every agent interaction, and
  the fourth column — with its width store, resize handle, and class
  seam — is deleted.
- The graph stops being always-on in favor of always-one-keypress-away;
  users in authoring flows get the [document | agent] split the owner
  specified as default.
- The transcript gains a settled, reference-verified grammar; the Figma
  frames that predate it (stale Approvals frame, missing diffstat)
  must be re-authored to match code — frame debt is recorded in the plan.
- The questionnaire ships as the product's first structured-question
  surface with an explicit unverified-by-reference flag; its first live
  team run is a named review moment.
- Entry-point collapse plus vocabulary retirement touches every
  registered chrome seam (chips, palette, keymap, menus) in one change —
  the actions-keymap-palette law makes this a bounded enrollment edit,
  and stale "Approvals" naming ends.
- Risk: tri-stating the center slot touches the dock reconciliation
  effect, historically a subtle seam (panel-restore races); the plan
  pins it with dedicated reconciliation tests mirroring the graph's.
- Risk: disabling the composer while a clarification parks could strand
  a user if disclosure fails; the disabled state must carry the same
  fail-closed re-read path recovery uses.

## Codification candidates

- **Rule slug:** `center-slot-is-exclusive`.
  **Rule:** The center dock's reserved slot renders the graph or the
  agent panel or neither — never both; both are shell-verb-reconciled
  reserved panels, and no agent surface may acquire a second home
  outside the slot.
- **Rule slug:** `transcript-grammar-is-c-rules`.
  **Rule:** User turns are accent bubbles, assistant turns open text;
  tool calls and reasoning share one collapsed disclosure per work
  stretch; file changes render as stat cards deferring full diffs; run
  metadata docks beside the transcript, never inside it.
- **Rule slug:** `questions-answer-where-they-park`.
  **Rule:** A mid-run question renders as an in-transcript card that is
  the sole answer surface while parked, recovers from authoritative
  status (never relay memory), and collapses into a durable recap card
  once answered.
