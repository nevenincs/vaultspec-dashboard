---
tags:
  - '#adr'
  - '#agentic-authoring-ux'
date: '2026-07-16'
modified: '2026-07-16'
related:
  - "[[2026-07-16-agentic-authoring-ux-research]]"
  - "[[2026-07-14-agentic-feedback-loop-adr]]"
  - "[[2026-07-14-a2a-orchestration-edge-adr]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #adr) and one feature tag.
     Replace agentic-authoring-ux with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     Status convention: the H1 status value is one of proposed, accepted,
     rejected, superseded, or deprecated. A new ADR starts as proposed; it
     moves to accepted or rejected when the decision is made; it becomes
     superseded when a later ADR replaces it (set by vault adr supersede,
     which also records superseded_by); and deprecated when it is retired
     without a direct successor.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `agentic-authoring-ux` adr: `one docked agent panel unifying authoring, agent, and review` | (**status:** `accepted`)

## Problem Statement

The dashboard's document half is complete and already meets the sparseness bar (research Part B §A–B: one `left-rail:new-document` ActionDescriptor across three surfaces, one declarative editor toolbar, one properties popover). The agent half is the inverse: the backend ships the entire agent-conversation plane — sessions, turns, runs cancel/resume, interrupts, the agent-tool catalog/prepare/execute/permission-decision, operation mode (`authoring/http/mod.rs:470–565`) — and already emits `SessionCreated`/`RunStarted` on the same SSE feed the frontend subscribes to, yet **zero frontend surface exists for any of it**; those events are silently dropped (Part B §E–G, §O). Between the two halves sit three defects the inventory names precisely: review is gated behind a fake "Sign in" that mints a provenance token for one hardcoded `human:local-operator` — a pattern zero of eight surveyed products use (Part A §7, Part B §D); two independently-built diff renderers duplicate one job (§C); and the built comment plane cannot reach an agent because the composer its bridge ADR depends on does not exist (§M).

This ADR is the north-star decision for the epic: one cohesive, sparse, direct agentic-authoring UX. It decides the shell, the composer, the transcript, cancellation and steering, the review detangle, the comment→agent bridge (disposing of the proposed agentic-feedback-loop ADR), diff unification, the action surface, and the a2a wiring seam — and disposes of every element the current-state inventory enumerates.

## Considerations

- **The governing mandate:** uniform, bloat-free, sparse, direct. Every element earns its place; anything whose purpose is not clear within ~2 seconds does not ship. One seam per verb; reuse over reinvention; silent/ambient over ceremony.
- **Part A's eight non-negotiable patterns are convergent across eight products** (Claude Code, Cursor, Windsurf, Codex, Copilot, Antigravity, Devin, Figma): docked non-modal panel; multiline Enter-to-send composer with slash-commands and mid-stream queueing; `@`-mention → removable chips (Figma proves the pattern generalizes to a non-file corpus); collapsed-by-default tool calls with per-call status; collapsed, dimmed, cost-labeled thinking; small adjacent model + agent selectors; inline in-session preview-then-approve review with **no separate sign-in** (the strongest finding); manager surfaces only for genuine multi-agent concurrency.
- **The left rail cannot host the composer.** `LeftRail.tsx` codifies a single navigation law: the rail issues NO mutation intent — every interaction is select-scope, select-node, or view-local affordance. An agent composer is the strongest mutation intent in the product. The missing "4th slot" is therefore not missing; it is correctly absent.
- **The backend is ahead of the UI everywhere except one place.** Sessions/turns/runs/interrupts/tools/mode are live and tested; the only genuinely missing backend concept is a queued prompt mid-run (turns are linear `POST /sessions/{id}/turns`) — a cross-team ask, not a UI-only fix. The a2a orchestration edge is an accepted contract with zero implementation on either side; its D3 relayed SSE channel will carry token/tool-call frames when built.
- **The built exemplars are the template, not the casualty.** `CreateDocDialog`, `EditorToolbar`, `PropertiesPopover`, `FrameworkStatusCluster` already demonstrate the house grammar: one ActionDescriptor per verb enrolled across eligible planes, bounded served status enums mapped to one label+tone, disabled-with-reason over hidden, single mount in `AppShell`.
- **Project rules bind the design:** stores is the sole wire client; displayed/filterable state is engine-served; degradation reads `tiers`; new default chords must clear the reserved-chord denylist and the vetted-out `Mod+Alt+*` candidates (B/K/E/C/M/H/D per the keyboard-shortcut-conflict-review ADR); Figma is the binding source of truth, so every new element needs frames (today there are zero for the agent half, Part B §Q); every rendered string is plain language.

## Considered options

- **O1 — Agent as a modal dialog inside `ControlPanels` (the ReviewStation pattern).** Rejected: a modal blocks the document the agent is editing; Part A §8 is unanimous that the agent panel never modal-blocks the work surface.
- **O2 — A separate full-page agent workspace (Antigravity-Manager style).** Rejected as speculative: the manager surface is justified only by genuine concurrent multi-agent orchestration, which vaultspec does not yet have. Named a non-goal with a return trigger.
- **O3 — Left-rail 4th slot hosting a prompt toggle/composer.** Rejected: violates the rail's codified no-mutation-intent law; also buries the keystone input in navigation chrome.
- **O4 — One docked, collapsible agent panel beside the work surface, with review inlined into its transcript — CHOSEN.** Matches the dominant shell across all surveyed products, reuses the existing dock/right-region composition, and dissolves the review sign-in gate by construction: approval happens where the change appears.
- **For review specifically — keep the gated ReviewStation and re-label it.** Rejected: the gate is a category error (zero-of-eight evidence); relabeling ceremony does not remove it.

## Constraints

- Four-layer boundaries hold: all new wire access lives in `frontend/src/stores/` (a new `stores/server/agent/` slice beside `stores/server/authoring/`); `app/` components render and emit intent only; the frontend never calls a2a directly (accepted a2a ADR — engine pass-through only).
- Run/turn/session status vocabulary is engine-served; the frontend maps served tokens to labels and tones exactly as `EditorStatus` does. No client-derived status.
- Every new stream consumer, transcript buffer, and queue is bounded at creation (resource-bounds rule); the transcript retains a capped window with truth recoverable from durable events, never from the relay (a2a D3).
- Every new verb is one ActionDescriptor enrolled across its eligible planes; every new default chord clears the reserved denylist and the AltGr guardrail; palette accelerators derive from the keymap registry.
- Every new element gets a Figma frame before or with its build (design-system rule); all labels plain language.
- No deprecation bridges: the sign-in vocabulary, the duplicate diff implementation, and any interim affordance replaced by a backend concept are deleted outright at cutover.

## Implementation

**D1 — The shell: one docked agent panel, named "Agent", beside the work surface; the left-rail slot is never built.** The Agent panel docks as a sibling region beside the document/graph surface (right side, resizable within bounds), mounted once in `AppShell` like `CreateDocDialog`. Idle and collapsed it is a single minimal affordance: a compact chip in the footer status cluster (the `FrameworkStatusCluster` grammar) showing nothing when no session exists, and "Agent working" with the served run state while a run streams collapsed. It never modal-blocks; the editor, graph, comments, and the panel coexist in one layout with no surface toggling another away. Entry points: the footer chip, `Cmd+K`, and a default chord (D8). The left rail keeps exactly three slots — the rail's navigation law stands.

**D2 — The composer is the keystone: multiline, Enter-to-send, slash-commands, mention chips, two small selectors.** A bottom-docked multiline composer inside the panel: Enter submits, `Shift+Enter` inserts a newline. `/` opens an inline popover fed by the ONE command-provider registry (`stores/view/commandRegistry.ts`) filtered to composer-eligible commands — no second command list. `@` opens the corpus picker reusing the existing `AutocompleteCombobox` (the create-dialog/properties component) resolving vault FEATURES and DOCUMENTS; selections render as removable chips above the input (Figma proves the pattern on a non-file corpus). Two small adjacent comboboxes sit in the composer chrome, separate and never merged: **Model** and **Team** (a2a presets via the engine pass-through `presets-list`; a single-agent default until a2a lands). The composer NEVER locks during a run: while streaming, submit enqueues (D4). This one component unblocks inventory classes E/F/G/J/K/L/M.

**D3 — The transcript: fixed turn order, collapsed tool calls with per-call status, dimmed cost-labeled thinking, inline permission prompts.** Each turn renders in fixed order: user prompt → thinking → tool calls → final text. Tool calls are collapsed-by-default single-line entries with per-call served status (running/done/failed), individually expandable — never a flat expanded log. Thinking is one collapsed, visually dimmed block with a duration/token cost hint in its header, streamed when the relay carries tokens. A pending tool-permission decision renders as an inline blocking entry in the transcript with Approve/Deny wired to `POST /v1/agent-tools/{id}/permission-decision` — the in-session prompt pattern, never a dialog. Wire truth splits per the accepted a2a D3: durable lifecycle events (the authoring SSE feed — the adapter gains cases for the currently-dropped `session.created`/`run.started` and future run kinds) are authoritative; token/tool-call streams ride the relayed engine SSE channel when a2a builds it; until then the transcript honestly shows turn boundaries, durable events, and settled proposals, with bounded `run-status` polling — degradation the a2a ADR itself names contract-conformant. Settled turns collapse transient running state to terminal status only.

**D4 — Stop, steer, and the queued prompt.** One **Stop** action (`agent:stop-run`) wired to the existing `POST /v1/runs/{id}/cancel`, rendered as a single button replacing Send while a run streams, plus a Cmd+K command — cancel and stop are one verb, one seam. **Steer** is not a separate control: when the run parks on an interrupt, the composer itself targets `POST /v1/interrupts/{id}/resume` — the same input, contextual destination, zero new chrome. **Queued prompt mid-run:** the backend has no concept (linear turns). Interim: the composer holds exactly ONE pending prompt client-side, rendered as a removable "Queued" chip, dispatched as the next turn on run settle — bounded, honest, and deleted outright when the backend concept lands. A coordination ASK is filed for a real queued-turn primitive.

**D5 — Review detangle: kill the sign-in gate; provenance becomes ambient; approval becomes inline.** The `ReviewerIdentity` component and its entire Sign in/Sign out/Signing in vocabulary are DELETED. The actor-token bootstrap moves to the stores seam as an ambient lazy mint: the first mutating authoring intent (edit, comment, approve, prompt) bootstraps the token transparently, exactly as editing already does — no surface ever renders auth vocabulary for a single implicit local operator. Per-change review moves inline: when a run settles into a proposal, the transcript renders a **proposal card** — served summary, change count, one Show-changes diff (D7), and Approve/Reject/Apply buttons driven by served `eligibility`, preview-then-approve as the default posture. The ReviewStation dialog is REDESIGNED, not deleted: renamed **"Review"**, ungated, it remains the cross-session queue and audit view (including the applied-under-policy lane) for anything not decided inline. The **operation-mode** switch gets its first UI as one small control in the Review header wired to `POST /v1/mode`, rendering served mode tokens as plain labels ("Review each change" / "Apply automatically, log for review"). The dead review-claim routes get NO UI: single-operator product today; return trigger below.

**D6 — The comment→agent bridge: ACCEPT the agentic-feedback-loop ADR, with one amendment.** The proposed `2026-07-14-agentic-feedback-loop-adr` is accepted as-is in substance — anchored comments batch immutably and attach to the next ordinary composer turn (its D2), the exact mechanism this ADR's composer now makes buildable. One amendment: the attached-comments affordance uses the SAME chip grammar as D2's `@`-mention chips — a "4 comments" removable chip above the input, one attachment treatment, not a parallel one. Additionally each comment thread gains one small **"Send to agent"** action (context menu + thread affordance) that stages that comment into the pending set. Its D4 cross-repo `feedback_batch_id` continuation remains an open ask on the a2a edge, unchanged.

**D7 — One diff primitive.** The two renderers (in-editor draft-vs-saved in `MarkdownDocView`, proposal `DiffPanel` with its own `diffLines`/`diffStat`) collapse into one `DiffView` primitive parameterized by source (draft-vs-saved | proposal-preview), one line-diff implementation, one visual grammar (gutter, add/remove tokens, truncation notice). Both call sites consume it; the duplicate implementation is deleted. The editor's `Mod+Alt+G` toggle and the proposal card's Show-changes both open the same component.

**D8 — The agent action surface: shared ActionDescriptors, vetted chords.** Exactly four verbs enroll, each as ONE ActionDescriptor across its eligible planes (palette, keymap, context menus), exactly as document creation does: `agent:toggle-panel` (Cmd+K "Agent: Open/Close panel", default chord proposed `Mod+Alt+A` — in the structural family, not among the vetted-out candidates B/K/E/C/M/H/D, subject to the denylist guard and per-entry reservation citation before shipping), `agent:stop-run` (Cmd+K + the in-panel button; no default chord — sparse), `agent:new-session` (Cmd+K + panel header), `comment:send-to-agent` (comment context menu + thread affordance). Nothing else enrolls until it proves recurring use; sessions are corpus-transient and never become standing palette commands.

**D9 — The a2a wiring seam: build against the engine now, enrich when a2a lands.** A new bounded `stores/server/agent/` slice is the sole client for: authoring sessions/turns/runs/interrupts/agent-tools (live today — the panel works against the engine's own authoring plane before any a2a code exists), the `/ops/a2a/{verb}` pass-through (`presets-list` feeds the Team selector; `run-start`/`run-status`/`run-cancel` bind team runs; `service-state` feeds degradation), and the relayed SSE channel when the a2a team ships it (their D3). Degradation reads `tiers` only; a2a-down renders the Team selector disabled-with-reason while single-agent authoring sessions keep working. Truth recovery always re-reads `run-status` + durable events, never the relay.

## Element disposition table

Every element from research Part B plus every element this ADR introduces. Placement names the owning surface; names are the user-facing labels (plain language).

| Element | Disposition | Placement | Name | Sparseness justification |
|---|---|---|---|---|
| `left-rail:new-document` action + 3-surface enrollment | KEEP | rail/palette/menus | New document | The template pattern; one id, three planes |
| `CreateDocDialog` 2-stage flow | KEEP | AppShell mount | New document | Already sparse, eligibility-gated |
| `EditorToolbar` | KEEP | editor header | — | One declarative table, one seam |
| Save + `EditorStatus` label | KEEP | editor header | Saved/Saving/… | Bounded served enum, one label+tone |
| `PropertiesPopover` | KEEP | editor header | Properties | One popover for all metadata; reuses combobox |
| In-editor draft-vs-saved diff | REDESIGN | editor (`Mod+Alt+G`) | Show changes | Same verb → consumes D7 `DiffView` |
| `DiffPanel` (proposal) | REDESIGN | proposal card / Review | Show changes | Merged into D7 `DiffView` |
| Duplicate `diffLines`/`diffStat` impl | CUT | — | — | One line-diff implementation only |
| ReviewStation dialog "Approvals" | REDESIGN | ControlPanels | Review | Ungated queue + audit; inline cards take the happy path |
| `ReviewerIdentity` sign-in/out UI | CUT | — | — | Auth vocabulary for one implicit actor; zero-of-eight pattern |
| Actor-token bootstrap | REDESIGN | stores seam (ambient) | (invisible) | Provenance is plumbing, not ceremony |
| `AppliedUnderPolicyLane` | KEEP | Review dialog | Applied under policy | Honest after-the-fact review of autonomous mode |
| Approve/Reject/Submit/Apply/Rollback buttons | KEEP | proposal card + Review | (as labeled) | Served-eligibility-driven; uniform grammar |
| Review-claim routes UI | CUT (no build) | — | — | Single operator; no second reviewer exists |
| Operation-mode switch | BUILD | Review header | Autonomy | First UI for a live route users can't currently see |
| Agent panel | BUILD | docked beside work surface | Agent | The shell; Part A §8 unanimous |
| Collapsed-agent footer chip | BUILD | footer status cluster | Agent working | Only visible when collapsed + active; else nothing |
| Composer | BUILD | Agent panel, bottom-docked | (placeholder: "Message the agent") | The keystone; unblocks classes E/F/G/J/K/L/M |
| Slash-command popover | BUILD | composer | / | Fed by the one command registry; no second list |
| `@`-mention corpus picker + chips | BUILD | composer | @ | Reuses `AutocompleteCombobox`; explicit opt-in context |
| Model selector | BUILD | composer chrome | Model | Small, adjacent, separate |
| Team selector | BUILD | composer chrome | Team | a2a presets; disabled-with-reason until a2a lands |
| Turn transcript | BUILD | Agent panel | — | Fixed order; collapse-on-settle |
| Tool-call entry | BUILD | transcript | (tool name + status) | Collapsed default, per-call expand |
| Thinking block | BUILD | transcript | Thinking (Ns) | Collapsed, dimmed, cost-labeled |
| Tool-permission prompt | BUILD | transcript, inline | Allow / Deny | In-session prompt, never a dialog |
| Proposal card (inline review) | BUILD | transcript | (summary + actions) | Preview-then-approve where the change appears |
| Stop button | BUILD | composer (replaces Send mid-run) | Stop | One verb for cancel+stop; one seam |
| Steer input | BUILD (no new chrome) | composer, contextual | — | Same input targets interrupt resume |
| Queued-prompt chip | BUILD (interim) | composer | Queued | One-slot, honest; deleted at backend cutover |
| Session list / new session | BUILD | Agent panel header | New session / recents | One header menu; sessions never enter the palette |
| SSE adapter session/run cases | BUILD | stores liveAdapters | (invisible) | Stops silent data loss on events already emitted |
| `stores/server/agent/` slice | BUILD | stores | (invisible) | Sole wire client for the agent plane |
| Comment thread panel | KEEP | viewer | Comments | Built, sparse, anchored |
| "Send to agent" on comment | BUILD | comment menu + thread | Send to agent | The one bridge affordance (D6) |
| Attached-comments chip | BUILD | composer | N comments | Same chip grammar as mentions; one treatment |
| Left-rail 4th slot / prompt toggle | CUT (never build) | — | — | Violates the rail's no-mutation-intent law |
| Status precedents (`FrameworkStatusCluster`, `DataActivityIndicator`, `StatusTab`, `PlanStepTree`) | KEEP | as today | — | Sparse-by-design; agent chip joins the cluster |
| Separate multi-agent manager surface | CUT (non-goal) | — | — | Speculative until real concurrency |

## Decomposition and build sequence

Settled HERE: shell placement (D1), composer shape (D2), transcript grammar (D3), stop/steer (D4), review detangle + ambient provenance (D5), feedback-loop ADR acceptance + amendment (D6), diff unification (D7), action surface (D8), a2a seam posture (D9), and the full element disposition. No decision above is deferred to a sub-ADR — the epic executes as plans, not more records.

Buildable phase order for the coder lanes:

1. **P1 — Detangle + unify (no new surface):** D7 `DiffView` unification; D5 sign-in-gate deletion + ambient token bootstrap + Review dialog rename/ungate. Pure simplification; shrinks the codebase before growth.
2. **P2 — The keystone shell:** D1 panel + footer chip; D2 composer (mentions, selectors, slash); sessions/turns wiring in the new `stores/server/agent/` slice; SSE adapter cases for `session.created`/`run.started`; D8 ActionDescriptors + chord vetting. Ships working single-agent authoring sessions against the live engine plane.
3. **P3 — The live transcript:** D3 tool-call/thinking/permission entries; D4 Stop, steer-via-composer, one-slot queued chip; inline proposal card consuming `DiffView`.
4. **P4 — The bridge + mode:** D6 comment→agent attachment (executes the accepted feedback-loop ADR frontend-side); D5's operation-mode control.
5. **P5 — a2a enrichment (cross-team gated):** Team selector on `presets-list`, team `run-start`/`run-status`, relayed-channel consumption. Blocked on the a2a team's build; everything before it ships independently.

Figma frames for every BUILD row precede or accompany each phase (zero exist today, Part B §Q).

Cross-team ASKS (filed, not patched around): (1) authoring backend — a queued-turn primitive (D4); (2) a2a/engine — the D3 relayed SSE channel and the `feedback_batch_id` continuation field (feedback-loop D4); (3) engine — run/turn/tool-call status enums served with the same bounded-vocabulary discipline as `EditorStatus`, if any gap surfaces at build time.

## Non-goals

- **A separate multi-agent manager surface.** Return trigger: the first real concurrent multi-team a2a run a user must supervise in parallel.
- **Review-claim UI ("someone else is reviewing").** Return trigger: a second concurrent human reviewer becomes a real deployment.
- **A general-purpose chat assistant.** The Agent panel is document-authoring only: every session is an authoring session whose output is ledgered proposals — no corpus-unrelated Q&A surface.
- **Raw chain-of-thought persistence or replay.** Thinking display is ephemeral relay content; durable truth is the lifecycle event feed only (a2a D5 fence).
- **Per-comment agent disposition state.** The feedback-loop ADR's constraint stands: agents consume comments, never resolve or rewrite them.
- **Queued multi-prompt composition.** One pending slot only until the backend primitive exists; the interim slot is deleted, not bridged, at cutover.

## Rationale

The evidence base is unusually one-sided. Part A shows eight independent products converging on the same shell, composer, transcript, and — decisively — inline ungated review; Part B shows vaultspec already owns every durable primitive (sessions, turns, runs, interrupts, tools, mode, comments, proposals, events) and every design-system precedent (one-descriptor actions, bounded status enums, eligibility gating, the combobox, the dialog grammar) the missing half needs. The cheapest correct system is therefore assembly, not invention: one panel, one composer, one transcript grammar, one diff primitive, one chip grammar — each reusing a seam that already exists. The two deletions (sign-in gate, duplicate diff) are chosen over redesign-in-place because both are category errors the sparseness mandate cannot amortize: the gate adds ceremony to the exact surface where friction hurts most, and the duplicate renderer is a second implementation of one verb. Building against the engine's live authoring plane first (D9) decouples the epic from the a2a team's schedule while honoring the accepted edge contract verbatim.

## Consequences

- **Gains.** The silently-dropped agent backend becomes visible product; review friction drops to zero ceremony (no sign-in, approval where the change appears); the comment plane becomes an agent input, completing the feedback loop its ADR designed; the codebase loses a duplicate diff implementation and a fake auth surface; every new verb lands in the established action/keymap/palette planes so the agent half inherits the document half's uniformity; the frontend is ready for a2a the day its relay ships.
- **Costs.** A new standing panel region enters the desktop layout (bounded, collapsible, but real screen budget); the transcript is a new bounded-buffer/stream-consumer class to test; roughly a dozen new Figma frames must be authored to keep the binding-source rule honest; the one-slot queued chip is a deliberate interim that must actually be deleted at backend cutover.
- **Pitfalls.** The `Mod+Alt+A` chord is provisional until reservation-vetted per the keyboard ADR's per-entry citation standard; degraded (relay-absent) transcripts must never fake liveness — bounded polling with honest state labels; mobile/compact composition of the panel is not designed here and will need its own pass against the unified-rail layout.
- **Pathways.** The proposal-card grammar generalizes to future artifact types (plans, audits) without new review surfaces; the Team selector and relayed channel are the beachhead for the manager surface if its return trigger ever fires; the ambient-provenance seam is where a real multi-user identity story would later plug in without resurrecting the gate.

## Verification strategy

- **D1/D2** — panel mounts once in `AppShell`; composer keyboard contract (Enter/Shift+Enter/slash/mention) covered by render tests against the live wire; the footer chip renders only in the collapsed+active state.
- **D3** — adapter tests prove `session.created`/`run.started` are consumed, not dropped; transcript tests assert fixed turn order, collapse-on-settle, and bounded buffer eviction.
- **D4** — Stop wires to `/runs/{id}/cancel` and the queued chip dispatches exactly once on settle; steer targets resume only while an interrupt is pending.
- **D5** — grep-level guard: no "Sign in" vocabulary remains in `frontend/src`; review actions execute with zero prior editing (the ambient mint); mode control round-trips `POST /v1/mode`.
- **D6/D7** — one `diffLines` implementation exists (the duplicate is deleted); both diff call sites render `DiffView`; the comments chip snapshots into the batch per the feedback-loop ADR's own verification.
- **D8** — `actionCoverage.guard.test.ts` and the reserved-chord denylist guard extend to the four new descriptors.
- **Full gate** — `just dev lint frontend` + the live-wire vitest suite green before any phase reports done.
