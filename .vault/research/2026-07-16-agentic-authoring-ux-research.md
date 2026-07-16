---
tags:
  - '#research'
  - '#agentic-authoring-ux'
date: '2026-07-16'
modified: '2026-07-16'
related: []
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #research) and one feature tag.
     Replace agentic-authoring-ux with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `agentic-authoring-ux` research: `modern agentic-application UX standards`

Grounding for a hard architectural epic: unify the vaultspec dashboard's
authoring + agent + review surfaces into ONE cohesive, simplified,
highly-polished agentic-application UX. This document has two parts — **Part A**
distills how modern agentic applications structure their UX (the standard the
Fable architect designs toward); **Part B** is the exhaustive current-state
element inventory of what vaultspec has today, judged for sparseness (keep /
cut / redesign). Part A is complete; Part B is filled from the internal audit.

## Part A — Modern agentic-application UX standards

Surveyed: Anthropic Claude Code, Cursor, Windsurf/Cascade, OpenAI Codex
(CLI + IDE), GitHub Copilot (agent mode / Workspace / cloud agent), Google
Antigravity, Devin, Figma design agent. Every claim carries a source; one line
(Enter-to-send convention) is flagged as inferred, not product-by-product
confirmed.

### 1. Prompt / composer input

Bottom- or panel-docked MULTILINE composer (never single-line). Slash (`/`)
opens an inline command popover for mode/model/utility actions. Enter submits;
a modifier inserts a literal newline (Codex `Ctrl+J`) — Enter-to-send with an
explicit newline escape, not the reverse. All studied products let you QUEUE a
follow-up prompt while the agent is still streaming (Codex: Tab queues the next
turn) rather than locking input during generation. Cursor/Windsurf dock the
composer in an IDE sidebar; Codex CLI docks it terminal-style at the bottom.
*Implication:* the composer stays input-able and accepts queued follow-ups
mid-stream; it never locks during generation.

### 2. Continuous tool-call view

Tool calls render INLINE in the turn as collapsed-by-default entries with
per-call status (running / done / failed); expand is per-call, not global —
that is what keeps the transcript scannable. Claude Code's fullscreen renderer
collapses call+result as one unit, expandable on click. Codex's 2026 changelog
lists "improved tool activity styling and progress indicators" as ongoing work
— a sign this surface is still actively tuned industry-wide, not solved.
*Implication:* tool-call entries need a collapsed default + per-entry status; a
flat always-expanded log is the noise failure mode every product is fighting.

### 3. Thinking / reasoning display

Collapsed by default, streamed, visually de-emphasized (dimmed) versus tool
calls and the final answer; opt-in expand, header carrying a cost hint
(duration / tokens). A live Claude Code proposal shows the emerging micro-
pattern verbatim: "⟐ Thinking (1.2s, 340 tokens) [Ctrl-O to expand]".
Antigravity and Devin instead surface a curated Artifact / plan rather than raw
chain-of-thought. *Implication:* reasoning is a collapsed, dimmed, streamed
block distinct from tool calls and final output — never a raw full-weight CoT
dump.

### 4. Model selector + agent / team selector

Model choice is a dedicated WAI-ARIA combobox, kept SEPARATE from an
agent-mode / autonomy selector when one exists (a second, smaller adjacent
control, not merged). GitLab Duo puts the agent dropdown directly below the
model selector. Antigravity formalizes a dedicated "Manager" surface for
orchestrating up to five parallel agents. *Implication:* keep model + agent /
team selection as small adjacent composer-chrome controls, not buried in
settings.

### 5. Context-adding (@ / + mention)

Universal `@`-mention opens a filtered picker (files / symbols / components);
selections render as REMOVABLE CHIPS in or above the input. Context is explicit
and opt-in — agents do not implicitly consider the whole project unless
mentioned. Figma's agent extends the identical `@` syntax to DESIGN PRIMITIVES
(components, variables, styles) — direct evidence the pattern generalizes
cleanly to a non-file domain corpus, the closest analogue to vault features /
documents. *Implication:* `@`-mention resolves vault features / documents to
removable chips exactly as Figma resolves components / variables — the pattern
transfers directly.

### 6. Turn / conversation structure

A turn interleaves in fixed order: user prompt → (collapsed) thinking → tool
calls (each collapsed, status) → final text. In-progress turns show a live
streaming indicator; settled turns collapse transient "running" state into
terminal status only. Not named as a discrete feature anywhere — implicit
plumbing across Claude Code, Codex, Antigravity, itself a sign of convergence.
*Implication:* infrastructure — get ordering + collapse-on-settle right, no need
to innovate.

### 7. Inline action approval / diff review — the load-bearing finding

Every product studied reviews and approves agent changes INLINE, in the SAME
authenticated workspace session the agent runs in — NEVER behind a separate
sign-in-gated "reviewer" surface. Diff review is co-located with chat / editor,
per-file or per-hunk accept / reject, and "preview-then-approve" is the default
(not "edit-then-review").

- Cursor: multi-file edits stage as a single reviewable diff with per-file
  accept / reject before anything writes to disk; the default is now
  "preview, then approve" rather than "edit, then review."
- GitHub Copilot Workspace: editable specifications, explicit plans, and
  PR-ready diffs with human review + approval — same Workspace UI, no separate
  reviewer role.
- OpenAI Codex IDE: review happens in the same sidebar (concise summary +
  changed lines, follow-up from the same view).
- Google Antigravity: leave feedback DIRECTLY ON the Artifact — "similar to
  commenting on a doc" — and the agent incorporates it without stopping its
  execution flow (inline comment-to-steer, no separate surface).
- Devin: the plan is "a checkpoint rather than a gate"; Devin Review adds
  inline PR comments within the same product surface.
- Figma: inline canvas commenting on agent output, same session.
- Claude Code: tool-permission approval is a synchronous in-session prompt.

General HITL framework: tiered auto-approve (safe / reversible) / notify (soft
gate, undoable) / block (hard gate, explicit wait) — in every case the approval
UI interrupts the SAME running session, never redirects to a separately
authenticated surface. **Verdict: zero evidence across eight products (IDE, CLI,
canvas-native) of a login-gated / separately-authenticated reviewer surface as
a review pattern.** The universal norm is an in-workspace, per-change diff /
artifact panel reachable without leaving or re-authenticating the session. A
login-gated review surface is a clear outlier against convergent practice —
confirming the user's assessment that it is a category error to untangle.

### 8. Overall shell

Two dominant shells: (a) a docked sidebar / panel beside the primary editor /
canvas (Cursor, Windsurf, Copilot inline chat, Figma agent in left rail +
canvas); (b) a dedicated "manager" surface for async / multi-agent work,
separate from the synchronous single-editor pane (Antigravity Editor vs.
Manager; GitHub's Agents tab). Idle state collapses to a minimal input
affordance and never modal-blocks the primary work surface. Figma frames the
goal: "no toggle tax, no context switching, and you stay in [the tool] with
your team in the loop." *Implication:* a single docked panel beside the
document / graph view is the right default; a separate agent-manager surface is
justified only once vaultspec supports concurrent multi-agent authoring — do
not build it speculatively.

### Synthesis — the non-negotiable patterns

1. **Approval is inline, in-session, no separate sign-in** — diff / change
   review co-located with chat, per-item accept / reject, no re-authentication
   or surface switch. (Strongest finding; rebuts the login-gated reviewer.)
2. **Tool calls stream collapsed-by-default with per-call status**,
   individually expandable — never a flat always-expanded log.
3. **Reasoning is collapsed, dimmed, cost-labeled**, subordinate to tool calls
   and final output.
4. **`@`-mention resolves domain objects to removable chips** — for vaultspec,
   vault features / documents, mirroring Figma's component / variable
   resolution.
5. **Multiline composer, slash-commands, Enter-to-send with explicit-newline
   escape**, live queueing of follow-up prompts mid-stream.
6. **Model and agent / mode selection are small, adjacent, separate controls**,
   not merged or buried.
7. **Preview-then-approve is the default execution posture**; irreversible /
   high-stakes actions hard-block, everything else auto-proceeds with a
   visible, undoable receipt.
8. **The agent panel docks beside the primary work surface**, collapses to a
   minimal affordance when idle, never modally blocks the editor; a separate
   manager surface only for genuine concurrent multi-agent orchestration.

Sources: OpenAI Codex docs/changelog, Claude Code fullscreen docs + issue
36006, Cursor 3 deep-dive, GitHub Copilot Workspace writeups, Google Antigravity
launch blog, Devin Review blog, Figma agent blog, assistant-ui model-selector
docs, HITL framework writeups. One line — Enter-vs-Mod+Enter submit convention —
is a convergent inference, not confirmed product-by-product; everything else is
sourced.

## Part B — Current-state element inventory (sparseness-judged)

Exhaustive enumeration, grounded rag-first + whole-file reads + grep on exact
routes/symbols. The through-line: **the document half is fully built and already
sparse; the agent-conversation half is live backend with zero UI.**

### A. Manual document creation — BUILT, exemplary

One shared `left-rail:new-document` ActionDescriptor
(`stores/view/leftRailKeybindings.ts:165`) drives `Cmd+Alt+N`, Cmd+K, and three
context menus into `openCreateDocDialog()`. `CreateDocDialog.tsx` (mounted once
in `AppShell`, Figma `1080:4272`) is a 2-stage feature→type flow over
`createDocChrome.ts` + `useCreateDoc` + `useFeatureCoverageView`
(eligibility-gated, disabled-with-reason not hidden; draft-preserving dismiss;
related-links capped 16). Server scaffolds via the ledgered
`create_proposal`/`direct_write` → `vaultspec-core` adapter. **Verdict: clean —
one id, one builder, three surfaces. The template.**

### B. Editing surface — BUILT, sparse

`EditorToolbar.tsx:29` (one declarative `TOOLBAR_ITEMS` table, FocusZone roving)
→ `applyFormat`. Save = `Mod+S`, gated by a bounded `EditorStatus` enum
(`viewStore.ts:83`: idle/dirty/saving/saved/save-failed/conflict), one status
label+tone (`editor.ts:269`). `PropertiesPopover.tsx` holds type/date/feature-
combobox/related-picker/rename in ONE popover (reusing the same
`AutocompleteCombobox` as create — good reuse). **Verdict: clean.**

### C. Diffing — BUILT but DUPLICATED

Two diff renderers for structurally the same job: the in-editor draft-vs-saved
toggle (`MarkdownDocView.tsx:457`, `editor:toggle-diff` = `Mod+Alt+G` post
shortcut-review) client-diffs draft vs base; the agent-proposal `DiffPanel.tsx`
(lazy-mounted from `ReviewStation.tsx:442`) uses its OWN `diffLines`/`diffStat`
(`app/authoring/diffLines.ts`) with the same visual grammar
(gutter, `text-diff-add/remove`, truncation notice). **Verdict: BLOAT — one
unified diff primitive parameterized by source should collapse the two.**

### D. Reviews + approvals — BUILT, but carries the prime confusion element

`ReviewStation.tsx` (mounted in `ControlPanels.tsx:39` as a Dialog titled
"Approvals") over `GET /authoring/v1/review-queue`. Uniform `ActionButton`
grammar for Approve/Reject/Submit/Request-apply/Rollback, driven by served
`eligibility`; conflict/stale/policy indicators present; Show-changes → DiffPanel;
an AppliedUnderPolicyLane for autonomous-mode after-the-fact review.
**BLOAT/CONFUSION — the sign-in gate:** `ReviewStation.tsx:46` `ReviewerIdentity`
uses real auth vocabulary ("Sign in"/"Sign out"/"Signing in…") to mint a
provenance token for ONE hardcoded actor `human:local-operator`
(`stores/server/authoring/index.ts:1073`) — no credentials, no user switching,
in-memory, cleared on reload. Auto-bootstraps ONLY from editing
(`MarkdownDocView.tsx:172`), so a reviewer who opens Approvals without ever
editing hits a real "Sign in" wall before any decision. **A category error for an
agentic review surface — should be silent/ambient, per Part A §7 (zero of 8
products gate review behind sign-in).**
**Gaps:** operation-mode switch (`POST /authoring/v1/mode`) has NO frontend
client (users see policy-applied rows but can't see/change the mode); review-claim
routes (`/v1/review-claims/*`) are dead — unwired ("someone else is reviewing"
concept absent).

### E. Agent progress streaming — MISSING (silent data loss)

No component subscribes to run/session/turn state. The backend ALREADY emits
`SessionCreated`/`RunStarted` (`authoring/events.rs:69`) on the SAME SSE stream
the frontend subscribes to for proposal events — the adapter has no case for
these kinds, **silently dropped.** The a2a ADR D3 designs a relayed SSE channel
for this; unbuilt.

### F. Tool-calling display — MISSING

Backend serves `GET /v1/agent-tools`, `/prepare`, `/runs/{id}/agent-tools/execute`,
`/agent-tools/{id}/permission-decision` (`http/mod.rs:477`). Zero frontend
methods, zero component. The permission-decision prompt (approve a tool call
before it runs) has no UI home.

### G. Thinking / reasoning display — MISSING

Zero `thinking`/`reasoning` hits in `frontend/src`. The LangGraph adapter maps
only thread/run/checkpoint references, not token content. Absent both sides.

### H. Document editor status overviews — BUILT, good precedent

`EditorStatus` enum + label/tone (bounded, single-value — good precedent for how
agent status should render). Ledgered plan-step checkboxes (`PlanStepTree.tsx`,
right rail, orthogonal). Comment resolved/orphaned state
(`CommentThreadPanel.tsx`, Figma `1072:4277`).

### I. Read-only status overviews — BUILT, sparse-by-design

`FrameworkStatusCluster.tsx` (footer chips, Backend-health deliberately pulled to
Cmd+K), `DataActivityIndicator.tsx` (one "data is moving" aggregate), right-rail
`StatusTab.tsx` (git/PR — confirms a rail "status tab" pattern the architect can
extend for agent status), tiers/degradation surfacing. **Good precedents.**

### J/K. Command cancellation & agent stop — MISSING

No generic cancel affordance; mutations complete or error. Backend has
`POST /authoring/v1/runs/{id}/cancel` (covers both cancel and stop) — unwired,
since no run is ever visible (§E).

### L. Steer + queued prompt inputs — MISSING both sides

Closest backend primitive: `POST /v1/interrupts/{id}/resume` (resume-with-input)
— unwired. Queuing a prompt mid-run has NO backend concept (linear
`POST /sessions/{id}/turns`) — needs backend design too, not just UI.

### M. Per-paragraph comment → agent feeding — the KEYSTONE gap

The section-anchored comment plane is BUILT end-to-end
(`stores/server/authoringComments.ts` + `CommentThreadPanel.tsx`, backend
`list/create/update/delete_comment` at `http/mod.rs:548`, anchors resolve via
`SectionSelector`). But it is pure human discussion — no field/button/state links
a comment to an agent task. The bridge is already designed and BLOCKED:
`.vault/adr/2026-07-14-agentic-feedback-loop-adr.md` (**status: proposed**, not
accepted) states the continuation contract accepts only a prompt+summary so an
agent can't consume bounded feedback, and "no document composer exists in the
frontend." Its D2 (comments attach to the next agent turn via the composer's
attached-context, e.g. "4 comments") depends entirely on the unbuilt composer.

### N. Composer / left-rail toggle / Cmd+K / shortcuts / context menus

Prompt composer MISSING. Left-rail prompt toggle MISSING (`LeftRail.tsx:35` has
exactly 3 slots: worktree/filter/browser, no 4th). Cmd+K create + create/edit
shortcuts (`Mod+Alt+N`, `Mod+S`, `Mod+Alt+G`) + context-menu create all EXIST —
but NONE exist for any agent action.

### O. Backend wire contracts

Full inventory `authoring/http/mod.rs:470`. **Document lifecycle
(create/comment/propose/submit/approve/apply/rollback) is 100% wired; the
agent-conversation half (sessions, turns, agent-tools, runs cancel/resume,
interrupts, operation-mode, leases) is 100% UNWIRED** despite being live, tested
backend. Grep confirms zero `session`/`turn`/`/runs/`/`agent-tool`/`interrupt` in
`stores/server/authoring/index.ts`.

### P. A2A edge

ADR accepted (`2026-07-14-a2a-orchestration-edge-adr.md`), contract only — zero
implementation either side. No `/ops/a2a/*` routes in `engine/`; no A2A client in
`frontend/src/stores`. `authoring/langgraph.rs` is a pre-existing
`#![allow(dead_code)]` reference-mapping adapter, not yet load-bearing. The D3
relayed SSE channel (would carry §E/F/G) doesn't exist.

### Q. Figma coverage

Frames exist ONLY for the document half: `[Surface] Authoring` (`1072:4204`),
`CommentThreadPanel` (`1072:4277`), `CreateDocDialog` (`1080:4272` + subs),
StateBlock "New document" CTA (`1012:4060`). **Zero frames** for: prompt composer,
session/run list, tool-call display, thinking stream, cancel/stop/steer/queue,
operation-mode switch, left-rail prompt toggle, comment→agent attachment. The
2026-07-14 agentic-document-workspace research itself flags that some proposed
Figma control precedes the backend justifying it — the existing exploration is
acknowledged as ahead of contract.

### Top-line for the architect

1. **Keystone missing piece: the prompt composer.** Classes E/F/G/J/K/L/M and
   the proposed agentic-feedback-loop ADR all depend on it.
2. **Prime bloat/confusion: the ReviewStation sign-in gate** (§D) — real auth
   vocabulary for a single-implicit-user token mint, inconsistently
   bootstrapped, gating the one surface where friction hurts most.
3. **Prime duplication: two diff renderers** (§C).
4. **Silent data loss: the SSE already carries `SessionCreated`/`RunStarted`**
   with no frontend case (§E) — backend is further ahead than any UI admits.
5. **§A–D document creation/editing/diffing/human-review already meet the
   "sparse, uniform, one seam per verb" bar** — the template new agentic
   surfaces are built to match, not replaced.
