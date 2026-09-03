---
tags:
  - '#research'
  - '#agent-panel'
date: '2026-07-31'
modified: '2026-08-02'
body_hash: 'sha256:1c1d494a9a2ff199aac0812989a5a11d47dee6f7adebe12cad7ecd829ecdb356'
related:
  - '[[2026-07-19-review-surface-flow-research]]'
  - '[[2026-07-19-review-surface-flow-adr]]'
  - '[[2026-07-14-a2a-orchestration-edge-adr]]'
  - '[[2026-07-16-agentic-authoring-ux-adr]]'
  - '[[2026-07-17-agent-wire-gaps-adr]]'
  - '[[2026-07-14-activity-rail-realignment-adr]]'
  - '[[2026-07-18-a2a-product-provisioning-adr]]'
---

# `agent-panel` research: `opening-surface convergence of agentic products and the UX grammar binding a canonical AgentPanel`

Charted the opening surfaces of four shipping agentic products — captured
first-party on this machine on 2026-07-31: ChatGPT desktop (opening in Codex
mode), Claude desktop, Google Antigravity (agent manager view), and
Perplexity web — and derived the convergent UX grammar they all implement.
Then inventoried where the dashboard's agent operations live today (scattered
across panels, modals, footer chips, and comment bridges) and bound every
element of the target UX to the operations the frozen a2a edge actually
serves. Grounds the same-feature `agent-panel` ADR: one canonical,
consolidated home for agent flow, with the a2a orchestrator as backend and
the dashboard as the sole product surface (edge ADR D7a).

The prior `2026-07-19-review-surface-flow-research` benchmarked the REVIEW
slice of this plane against seven agentic-dev products and produced an
accepted ADR (de-modalize the station into the Agent panel, relocate
autonomy composer-adjacent). This record widens the benchmark from the
review flow to the ENTIRE agent-operations surface: beginning a prompt,
entering a prompt, run supervision, and the shell that holds them.

## Findings

### Capture evidence

Four opening states, captured 2026-07-31 (transient session captures,
described here in full per `no-tracked-visual-dev-artifacts`; the findings
below stand on the prose, not the pixels):

| Product | Surface captured | Opening state |
| --- | --- | --- |
| ChatGPT desktop | Codex mode, project `main` bound | Bottom-docked composer, headline "What should we build in main?", four intent cards |
| Claude desktop | Home view | Centered composer, "How can I help you today?" placeholder, persona greeting headline |
| Google Antigravity | Agent manager (non-IDE view) | Centered composer, "Select Project" binding above input, syntax-teaching placeholder |
| Perplexity | Web home | Centered composer, "What do you want to know?", two mode cards |

### Convergence chart

Every dimension below converges across at least three of the four products;
most converge across all four.

| Dimension | ChatGPT/Codex | Claude | Antigravity | Perplexity |
| --- | --- | --- | --- | --- |
| Empty state IS the composer | yes | yes | yes | yes |
| Personalized headline question | "What should we build in main?" | "Neve returns!" + "How can I help you today?" | — (input leads) | "What do you want to know?" |
| Placeholder teaches scope/syntax | "Do anything" | "How can I help you today?" | "Ask anything, @ to mention, / for actions" | "Ask anything…" |
| Intent/starter cards | 4 (Explore/Build/Review/Fix) | none (recents carry) | none (recents carry) | 2 (Search/Computer) |
| Context bound at the input | project+machine+branch chips on composer | mode toggle in composer | "Select Project" directly above composer | mode toggle in composer |
| Two-row composer card | yes | yes | yes | yes |
| Row-2 left: what-agent-touches | `+`, Full-access permission chip | `+`, Chat\|Cowork | `+` | `+`, Search\|Computer |
| Row-2 right: how-it-thinks + modality | model+effort ("5.6 Terra High"), mic, voice | model+effort ("Opus 5 High"), mic, voice | model+effort ("Gemini 3.6 Flash (High)"), mic | model picker, mic, voice |
| Send button | none (Enter implicit) | none | none | none |
| Sidebar stack (top→bottom) | New → surfaces → Projects → recents → account | New → surfaces → Recents → account | New Conversation → History/Scheduled → Projects | New → surfaces → History → account |
| "Scheduled" as first-class surface | yes | yes | yes (Scheduled Tasks) | yes (Workflows) |
| Artifacts as first-class surface | Sites | Artifacts | (in-run artifacts) | Artefacts |
| Composer position | bottom (continue idiom) | center (begin idiom) | center | center |
| Chat ↔ agentic dichotomy, one toggle | Home\|Code (app-level) | Chat\|Cowork | manager\|"Open IDE" | Search\|Computer |
| Status is non-blocking | promo card adjacent to composer | corner toasts (MCP errors) | update pill + dismissible card | dismissible banner |
| History subordinate to New | yes | yes | yes | yes |

### The convergent grammar (natural-language UX rules)

- **G1 — The empty state is the composer.** No dashboard, wizard, or list
  interposes between opening the surface and typing the first prompt. The
  first keystroke is the first prompt.
- **G2 — An inviting question as headline, personalized from context.** The
  surface asks the user something ("What should we build in <project>?"),
  naming real context where it has any. Never a product-welcome.
- **G3 — The placeholder is documentation.** It states scope ("Do
  anything") and teaches special syntax inline ("@ to mention, / for
  actions") — the input explains itself, no tour.
- **G4 — Starter cards seed by intent, not feature.** Where cards exist
  they are user verbs (Explore / Build / Review / Fix), and they yield to
  recents once history exists.
- **G5 — A prompt is never contextless, and its context selector is never
  more than a few pixels from the text.** Project, branch, machine, or mode
  is bound on or immediately above the composer — before or with the first
  prompt, never after it.
- **G6 — The composer is a two-row card with a fixed left/right grammar.**
  Row 1: free text. Row 2 left: controls that change WHAT the agent works
  on (attach, mode, permission scope). Row 2 right: controls that change
  HOW it thinks (model + effort tier inline, previously settings-buried)
  and input modality. No prominent send button — Enter is the send.
- **G7 — The shell is a two-pane: fixed sidebar + open canvas, with an
  invariant sidebar stack.** (1) "New …" CTA pinned first, (2) a short
  fixed list of surfaces — and the nouns repeat across all four products:
  Projects, Artifacts, Scheduled, Skills/Plugins/Workflows — (3) scrollable
  recents with one-line truncated titles and "Show more", (4) account
  pinned last.
- **G8 — Composer position encodes posture.** Centered = "begin"
  (first-prompt idiom); bottom-docked = "continue" (conversation-in-progress
  idiom). Products switch position when the conversation starts.
- **G9 — One brand, two postures, one toggle.** Every product exposes its
  conversational↔agentic dichotomy as a single top-level switch
  (Chat|Cowork, Search|Computer, manager|IDE) — never as separate apps or
  buried settings.
- **G10 — System state never blocks the prompt.** Errors, updates, and
  promotions render as corner toasts, pills, or dismissible cards adjacent
  to the composer; nothing modal stands between launch and typing.
- **G11 — History is memory, not homepage.** Recents are always present,
  always subordinate; the products bet on "start something new".

The one-sentence rule beneath all eleven: minimize the distance between
opening the surface and a context-bound first prompt, and hang every
secondary decision (mode, model, effort, permissions, attachments) off the
edges of the input box itself.

### Conversation-rendering convergence (C-rules)

Second capture pass (2026-08-01), answering the owner's "how is a
conversation rendered — don't guess, check": existing conversations were
opened live in Claude desktop (both its plain-Chat and agentic-Cowork
modes) and ChatGPT/Codex desktop. Coverage honesty: Antigravity was
BLOCKED — its only visible window was pinned to a background runner
terminal with no chat chrome reachable by safe clicks — and NO structured
multi-choice questionnaire UI was observed in either inspected app; the
questionnaire surface below is therefore designed from our own wire
payload, not copied from a reference.

- **C1 — User turns are bubbles; assistant turns are open text.** User
  messages render as right-aligned rounded accent bubbles; assistant
  output is full-width unbubbled markdown. The only speaker cue is
  bubble-vs-no-bubble plus alignment.
- **C2 — Tool calls collapse to one disclosure row per work stretch.**
  "Used 7 tools ⌄" / "Worked for 1m 5s ›" — expanding reveals a flat
  chronological timeline of icon+label rows (search, edit, task…), one
  level deep, never nested cards, never separate chat turns.
- **C3 — Reasoning has no dedicated lane.** Thinking narration folds into
  the same collapsed disclosure as the tool steps and is revealed with
  them, interleaved in one timeline.
- **C4 — File changes are structured stat cards, never raw diffs.** A
  bordered card with aggregate `+X −Y`, terminal actions (Undo / Review),
  and a per-file list each with its own stat; full diff content is
  deferred to hover-preview or a review surface.
- **C5 — Live run metadata lives in a docked rail, not in the
  transcript.** Both products pin agent-run state beside the conversation
  (Claude: Progress checklist / Outputs / Context skills; ChatGPT:
  Environment / Subagents roster / Sources) — never interleaved into
  message flow.
- **C6 — The composer is bottom-docked and changes shape during a run.**
  An approval/autonomy pill sits beside the model+effort selector in both
  apps; ChatGPT swaps send → black-square stop while running, and pins a
  status chip row (active goal + elapsed) above the composer.
- **C7 — Elevated autonomy is a standing dismissible banner over the
  composer** ("Full access is on…", "Skip all approvals is on…") — a
  warning-tinted strip, never a blocking modal.
- **C8 — Structured Q&A leaves a recap card.** Claude Cowork renders
  answered clarifying questions as a bordered card of bold-question /
  gray-answer pairs sitting between turns — decisions as durable
  transcript objects, not ephemeral chat.

### Scatter inventory: where agent operations live in the dashboard today

Source-verified 2026-07-31 (this worktree). Routing note: the frontend has
exactly one route (`/` → `AppShell`); every "home" below is a shell region,
never a URL. The first finding is that consolidation is further along than
the campaign record suggests: the review-surface-flow ADR's F1/F2 are
LANDED — `ReviewStation.tsx` is now a headless export library with no host
of its own, the pending inbox and the autonomy control both live inside the
docked Agent panel, and the modal Approvals host is gone.

| # | Surface | Home | Entry point(s) | Endpoints |
| --- | --- | --- | --- | --- |
| 1 | `AgentPanel` (`app/agent/AgentPanel.tsx`) — the de-facto canonical host | non-modal docked 4th grid track in `AppShell` | footer `AgentChip`, `Mod+Alt+A`, Cmd+K `agent:toggle-panel`, background context menu, comment-send bridge, Review chip (opens `pending`) | aggregate `/authoring/v1/*` + `/ops/a2a/*` |
| 2 | Transcript + `ToolCallEntry` (inline tool-permission prompt, never a dialog) | AgentPanel `transcript` view (default) | panel-resident | sessions/turns/interrupts/agent-tools |
| 3 | `TeamRunTranscript` + progress context (live a2a relay, degraded fallback to polling) | AgentPanel `transcript` view | team-run start from Composer; reload recovery (`ActiveTeamRunRecovery`) | `POST /ops/a2a/run-status`, `GET /ops/a2a/runs/{id}/stream` |
| 4 | `Composer` + `ComposerTeamSelector` + model pill + slash-command popover | AgentPanel composer slot | panel-resident | `/ops/a2a/presets-list\|run-start\|run-cancel`, sessions/turns, feedback-batches, interrupts |
| 5 | `PendingChangesView` (cross-run proposal inbox, re-hosts `ReviewStationBody`) | AgentPanel `pending` view | footer **Review** chip / Cmd+K `panel:approvals` | proposals, reviews/decisions (3-verdict), apply-requests, acknowledge |
| 6 | `PendingChangesBridge` ("N other pending changes" signpost) | AgentPanel transcript view, composer-adjacent | auto-renders on uncorrelated proposals | same reads |
| 7 | Inline `ProposalCard` (exact `run_id` correlation) | inside a transcript turn | automatic | review endpoints via shared `useReviewActions` |
| 8 | `AgentAutonomyControl` (hosts `AutonomyControl`) | AgentPanel, composer-adjacent, transcript view only | panel-resident | `GET\|POST /authoring/v1/mode` (scope-level read + set, shipped) |
| 9 | Comment→agent "Send" bridge (`CommentThreadPanel` → `agentComposer` store) | document reader comment threads | per-comment Send icon; stages batch, opens AgentPanel | `POST /authoring/v1/feedback-batches` |
| 10 | `A2aLifecyclePanel` (install/start/stop/repair/update/rollback/remove/doctor) | **modal** control-panel `Dialog` (`ControlPanels`, id `agent-service`) | **Cmd+K only** — deliberately no footer chip, no rail affordance | `/a2a/lifecycle/status\|run\|jobs/{id}` |
| 11 | `AgentChip` (collapsed-panel run trace) | `FrameworkStatusCluster` rail footer (desktop + compact rail) | renders only while a run streams and panel is closed | session snapshot |
| 12 | Agent command plane (`agentCommandProvider`, `agentActions`) | Cmd+K palette + keymap + background menu | `agent:toggle-panel` / `agent:new-session` / `agent:stop-run` | run/session cancel |
| 13 | Editor agent-change marks + `ConflictResolutionPanel` | inline editor chrome (`MarkdownDocView`) | automatic on agent apply / dirty overlap | local acknowledge; direct-writes on save |

Structural findings the ADR must name:

- **(a) The lifecycle surface is the outlier.** `A2aLifecyclePanel` is the
  only agent surface that is modal, and the only one with no chip or rail
  affordance — palette-only. Every other agent surface is non-modal and
  in-flow; the review-surface ADR's modality argument applies to it
  verbatim.
- **(b) `ReviewStation.tsx` is a headless export bundle** (`ProposalCard`,
  `ReviewStationBody`, `AutonomyControl`, `useReviewActions`) with three
  panel-resident consumers — the single-implementation discipline holds;
  the duplication pressure sits here and must stay fenced.
- **(c) Two independent a2a clients** ride side by side —
  `stores/server/a2aLifecycle.ts` on `/a2a/lifecycle/*` and
  `stores/server/agent/a2aTeam.ts` on `/ops/a2a/*` — with no shared
  degradation seam beyond `readAgentTierAvailability`.
- **(d) The compact/mobile shell has zero agent surface of its own** — it
  inherits only what `FrameworkStatusCluster` renders. On coarse pointers
  the agent plane effectively does not exist.
- **(e) Vocabulary is three-way:** `common:agent.*` (panel, unified),
  `common:agentService.*` (lifecycle modal), `documents:reviewStation.*`
  (review verbs) — and the footer chip that opens the agent inbox is still
  named **Review** with action id `panel:approvals`.

### Binding map: target UX element → operation the frozen edge serves

Every element of the target panel binds to an operation that already exists
on the ratified cross-repo edge (`2026-07-14-a2a-orchestration-edge-adr`)
or to a named, filed gap. Nothing below requires a new wire contract except
where marked GAP.

| Panel element (grammar rule) | Bound operation | Authority |
| --- | --- | --- |
| Composer send — first prompt starts a run (G1, G5, G6) | `/ops/a2a/run-start` (preset id + prompt + feature tag; engine injects `workspace_root`, provisions per-role actor tokens) | edge D1, D2 |
| Team/preset selector, composer row-2 right (G6 "how it thinks") | `/ops/a2a/presets-list` | edge D1 |
| Context chips — scope/worktree bound at the composer (G5) | `ScopeCell.root` echoed as `expected_scope` generation fence on `run-start`/`active-runs` | edge D1 amendment 2026-07-19 |
| Run transcript / live progress | per-run SSE `GET /ops/a2a/runs/{run_id}/stream` (non-authoritative relay; truth re-read from `run-status` + durable events) | edge D3 |
| Run header status / stop | `/ops/a2a/run-status`, `/ops/a2a/run-cancel` | edge D1 |
| Reload/recovery — rebind the one active run (G11) | `/ops/a2a/active-runs` (single-unambiguous-result rule) | edge D1 amendment |
| Inline proposal review card, in-transcript (review grammar) | `/authoring/v1` proposal lifecycle + three-verdict decisions (`approve`/`reject`/`request_changes` wire verdict `edit`, required comment) | edge D3 amendment; `2026-07-19-review-surface-flow-adr` |
| Cross-run "Pending changes" inbox view | served review-station projection, served eligibility | review-surface-flow F1 |
| Autonomy control, composer-adjacent (G6 row-2 left: permission scope) | `GET|POST /authoring/v1/mode` — scope-level read + set, shipped; control hidden when no served mode | review-surface-flow F2 (landed) |
| Comment→agent feedback (review grammar: "do it differently" is composer-shaped) | feedback-batch create/read + `feedback_batch_id` turn field | edge D3 amendment (shipped `d5bfbac932`) |
| Service health / degradation strip (G10 non-blocking) | `/ops/a2a/service-state`; `agent` tier degradation, never inferred from transport | edge D1, amendment (3) |
| Sidebar "Agents" lifecycle (start/stop/repair the sibling) | `/a2a/lifecycle/*` client (attach-never-own, machine-global discovery) | `2026-07-18-a2a-product-provisioning-adr` W05 |
| Run↔proposal correlation (inline card exact bind) | served proposal `run_id` where present; actor-identity correlation otherwise — full link is a filed cross-team GAP | review-surface research; wire-gaps record |
| Scheduled surface (G7 sidebar noun) | a2a persistent task queue exists sibling-side; dashboard surface is FUTURE — no frozen verb yet (GAP, deliberate) | edge D7e |
| Voice / mic (G6 far right) | deliberately EXCLUDED — no speech seam exists in the product; the grammar slot stays empty rather than faked | this record |

### Grammar scorecard: where the panel stands today

The landed panel already satisfies more of the grammar than the campaign
record suggests; what remains is a bounded consolidation, not a rebuild.

- **G6 largely MET:** the composer is panel-resident with the team/preset
  selector and model pill on the card, the autonomy (permission-scope)
  control composer-adjacent, the slash popover teaching commands, and the
  inline tool-permission prompt in the transcript (never a dialog). The
  left/right row grammar (what-agent-touches left, how-it-thinks right) is
  not yet codified as a law and should be.
- **G10 MET:** the `agent` degradation tier, relay-fallback-to-polling,
  and non-modal status chips implement "status never blocks the prompt"
  faithfully — except finding (c): two a2a clients without one shared
  degradation seam.
- **G1/G2/G8 NOT MET:** the panel has no begin idiom. There is no empty
  state whose content is a centered composer with a personalized headline
  ("What should we run against `<scope>`?"); the composer sits in the same
  docked slot whether or not a session exists, and reaching it at all
  means locating a chip, chord, or menu.
- **G5 half-met:** scope is bound rigorously on the wire (`expected_scope`
  generation fence) but invisibly — no chip on the composer renders the
  scope/worktree a run will bind to before send. The binding truth exists;
  it is simply not shown at the input.
- **G7 NOT MET:** the fixed-surface stack does not exist as one region.
  Entry points are a scatter (footer chips, palette ids, chords, context
  menus); the lifecycle surface is palette-only and modal (finding a); the
  compact shell has nothing (finding d).
- **G9 NOT MET:** no single conversational↔agentic posture switch; the
  single-agent session plane (`/authoring/v1`) and the team-run plane
  (`/ops/a2a`) meet in one composer but their posture split is implicit.
- **G11 NOT MET:** no recents. The transcript is single-session; there is
  no run/session history list anywhere in the shell, though the wire
  (`GET /authoring/v1/sessions`, `active-runs`) already serves the data.

### Re-capture pass (2026-08-01, first-party, pixels on disk)

A second capture pass was taken directly from the running applications on this
machine (window captures via PrintWindow/screen copy), after the owner mandated
that the applications themselves remain the binding reference. The images live
IN-REPO but untracked (per `no-tracked-visual-dev-artifacts`) at
`.tmp/ui-captures/` — gitignored, machine-local, logged here so they are never
lost: `claude-desktop.png`, `chatgpt-desktop.png`, `chatgpt-composer.png`,
`antigravity-desktop.png`, `zcode-desktop.png`, `claude-begin.png`
(a working copy also sits at `C:/Users/hello/ui-captures/`).

New in this pass: **ZCode desktop joins the reference set** (it was not in the
2026-07-31 pass). Its opening state: sidebar `New task` (with `Ctrl+N`
accelerator shown inline), `Search` (`Ctrl+K`), `Automations`, `Skills`, a
`Group|Project` toggle, then Projects and Tasks lists; main canvas a
time-personalized headline, a `Select project ˅` pill directly above the
composer, and the placeholder "Ask ZCode anything, @ for …". ZCode frames every
conversation as a TASK — outcome-oriented naming, no chat noun anywhere.

What the pixels confirm or sharpen against the prose capture:

- **C4 sharpened:** the ChatGPT/Codex file-change card shows the aggregate
  diffstat COLORED (`+155` green, `−833` red) under a bold "Edited 10 files"
  title, an icon tile at left, `Review changes ↗` as the terminal action, and a
  per-file list rendering the directory path muted with the filename emphasized.
- **Claude desktop has moved to an app-level `Home|Code` toggle** (the G9 slot,
  previously observed as Chat|Cowork), with sidebar `+ New`, `Projects`,
  `Artifacts`, `Scheduled`, `Dispatch (Beta)`, `Customize`, then scrollable
  `Recents`.
- **The conversation header idiom is title-with-menu:** Claude renders the open
  conversation's title center-top with a chevron (a conversation-actions menu);
  Codex renders the title with a trailing `…` overflow. Conversation-scoped verbs
  (rename/archive) live behind the title's own menu — navigation to OTHER
  conversations never does; recents stay in the sidebar/history surface
  (Antigravity names it `Conversation History`).
- **G5 confirmed verbatim** in Antigravity and ZCode: a `Select Project ˅` pill
  sits immediately above the input; Antigravity's model pill reads
  `Gemini 3.6 Flash (High)` — provider-family model name plus effort tier in one
  value-label.
- **Recents rows carry an unread/activity blue dot** (Codex project conversation
  rows), and no visible send button appears in any captured composer.

## Recommendation

The canonical home already exists — the docked, non-modal AgentPanel — and
the review-surface-flow rehomes into it are landed. The ADR should declare
it canonical and finish the consolidation with these bounded moves:

1. **Rehome the lifecycle surface (finding a).** Delete the modal
   `agent-service` control panel; the a2a service lifecycle becomes an
   AgentPanel view (transcript ⇄ pending ⇄ service) with a real entry
   affordance. The review-surface ADR's modality argument generalizes:
   agent work needs the work visible, for the whole plane, not just
   review. Deleted, not hidden (`no-deprecation-bridges`).
2. **Adopt the begin idiom (G1/G2/G5/G8).** The panel's empty state is a
   centered composer with a personalized headline naming the bound scope,
   and chips on the composer rendering the same `ScopeCell` + preset truth
   the generation fence already enforces — showing at the input what the
   wire already binds. With a live session/run the composer docks bottom
   (continue idiom). Codify the composer row grammar (G6 left/right) as a
   law while it still holds by accident.
3. **One entry grammar + one vocabulary (G7/G9, finding e).** A single
   invariant stack inside the panel (New run CTA → views → recents →
   status strip); the footer chip family collapses to one Agent identity;
   `panel:approvals`/"Review" and `agentService.*` labels retire into
   `common:agent.*` (four touch points per catalog law).
4. **Recents (G11).** A sessions/runs recents list in the panel — one-line
   truncated titles, "Show more" — fed entirely by the shipped wire
   (`GET /authoring/v1/sessions`, `/ops/a2a/active-runs`). No new
   endpoints.
5. **One degradation seam (finding c, G10).** The two a2a clients
   (`a2aLifecycle.ts`, `a2aTeam.ts`) keep their planes but read one shared
   agent-tier availability seam, so the panel renders one coherent service
   truth.
6. **Compact-shell parity (finding d).** The panel earns a compact
   presentation; on coarse pointers today the agent plane does not exist.
7. **Bind, don't build.** Every element maps to the binding table; this is
   a rehoming of shipped operations onto a convergent grammar. The only
   deliberate future is the Scheduled surface (a2a's task queue has no
   frozen verb yet — edge D7e); voice stays an empty grammar slot.
8. **Sequence.** The ADR extends the accepted review-surface-flow record
   (F1/F2 landed, not re-litigated) and builds strictly on the frozen edge
   (`2026-07-14-a2a-orchestration-edge-adr` D1–D8); nothing here is a
   wire-contract event except what it explicitly defers.
