---
tags:
  - '#research'
  - '#review-surface-flow'
date: '2026-07-19'
modified: '2026-07-21'
related: []
---

# `review-surface-flow` research: `review-surface conformance against industry agentic products and Figma`

Investigated whether the product's two-surface review model — the inline per-turn
proposal card in the Agent transcript plus the standalone "Approvals" Review
Station — conforms to how the leading agentic-development products shape
agent-change review, and audited the implemented UX against its binding Figma
frames. Prompted by the product owner's expectation that "every agent action
review must be part of the same UI/UX where we prompt and see the agent
transcripts." Grounds the same-feature ADR.

## Findings

### Architecture ground truth (verified in source)

- Exactly ONE proposal-card implementation exists: `ProposalCard` in
  `frontend/src/app/authoring/ReviewStation.tsx`, driven by the shared
  `useReviewActions` hook. Two mounts: (a) inline per-turn in the Agent
  transcript, bound by the served proposal `run_id`
  (`correlateProposalByRun` in `frontend/src/app/agent/ProposalCard.tsx` — an
  exact bind, honestly-empty slot when no proposal carries the run id); (b) the
  standalone queue `ReviewStationSection`, mounted inside a MODAL `Dialog` as
  the "Approvals" control panel in `frontend/src/app/panels/ControlPanels.tsx`.
- The three-verdict review (approve / reject / request_changes with a required
  comment, wire verdict `edit`) lives on the shared card, so it renders
  identically in both mounts. Request-changes opens a modal
  `RequestChangesDialog` from within the card.
- `AutonomyControl` (manual "Review each change" vs autonomous "Apply
  automatically") renders ONLY inside `ReviewStationSection`, and only when a
  proposal's policy serves a mode — no scope-level operation-mode read exists on
  the wire; the mode is observable solely through a proposal's policy block
  (known gap, cross-team ask already filed).

### Industry benchmark

| Product | Where review happens | Affordance relative to the conversation |
| --- | --- | --- |
| Claude Code | Inline, fully | Per-edit diff + inline permission prompt; reject-with-feedback IS the next message in the same input. No separate review pane. |
| Codex CLI / cloud | Inline (CLI); task page with Diff tab beside the log (cloud) | Approve/deny at the prompt; cloud diff is a tab of the same task surface, terminal action "create PR". |
| Cursor | Hybrid, conversation-primary | Per-file diff blocks in chat with Accept/Reject + aggregate review bar; follow-ups typed into the same composer; cloud agents get a cross-run task page. |
| Windsurf (Cascade) | Inline in the Cascade panel | Open-diff / accept / reject per file + accept-all in the panel flow. |
| Zed AI | Hybrid | Agent panel + "Review changes" multibuffer (per-hunk accept/reject) opened FROM the panel — a projection of the conversation's pending edits. |
| GitHub Copilot coding agent | Separate surface — the PR | GitHub-native review: Approve / Request changes (required comment) / Comment. The one true separate station; justified because the artifact IS a PR. Agent mode in VS Code is inline. Copilot Workspace (standalone review app) was wound down. |
| Google Antigravity | Hybrid dual-surface | Editor view inline; Agent Manager is cross-agent mission control with artifact comments feeding back to agents — justified by concurrent multi-agent supervision. |

Pattern: inline / hybrid-conversation-primary is unanimous for the happy path.
Where a second surface exists it is a cross-run inbox and NEVER a modal —
always a page, tab, or panel that can stay open beside the work.

### Conformance verdict: PARTIALLY-CONFORMANT

The inline per-turn card with exact run-id binding IS the industry pattern, and
the single-shared-card architecture is stronger than most competitors (chat-diff
vs editor-diff divergence is impossible by construction). The standalone queue
is NOT inherently a fragmenter: it is the only surface covering (1) proposals
with no served `run_id` (non-agent changesets never correlate), (2) proposals
whose turn scrolled past the bounded transcript window or whose session
expired, (3) the applied-under-policy after-the-fact lane. Collapsing it would
orphan all three classes.

Non-conformant residue, by severity:

1. The station is a MODAL dialog. Every industry cross-run surface is
   non-modal. Opening "Approvals" blocks the document being edited AND the
   transcript simultaneously; the agentic-authoring-ux ADR itself rejected its
   option O1 with exactly this argument yet left the station modal.
2. `AutonomyControl` is stranded. Operation mode is a trust decision every
   competitor places adjacent to the composer (Codex approval mode, Cursor
   auto-run, Claude Code permission mode); here it hides behind footer chip →
   modal, and cannot render before a proposal exists (wire gap).
3. Vocabulary split: the flow says "agent", the chip says "Approvals"; no
   signposted route from a transcript card to the rest of the pending queue.

### Request-changes affordance critique

Industry captures "do it differently" composer-shaped, not modal-shaped. In
this product the semantics are stronger still: `requestChanges` returns the
proposal to draft with the comment and the a2a phase gate resumes the agent
into a revision cycle — the comment literally is a message to the agent.
Wrapping it in a modal floating over the composer built for messaging the agent
is a grammar clash. The correct shape is an in-card inline expanding textarea
(one implementation, correct in BOTH mounts; a composer-routed capture would
work only in the transcript mount and fork behavior).

### Figma arbitration (frames vs implementation)

Frames pulled and compared: transcript frame `1223:4518`, tool-permission
prompt `1225:4519`, autonomy control `1226:4520`, Approvals panel `1089:4437`.

- Transcript frame vs code, code-side deficits (Figma wins): user prompt should
  be the accent-tinted bubble (code renders neutral `bg-paper-sunken`); the
  proposal card should carry the served diffstat (frame shows `+8 −3`; code
  shows only an operation-count word); "Show changes" should be a chevron
  link-disclosure separated from the verb row (code appends it as a ghost
  button, reading as a fourth verdict); action buttons should be right-aligned
  with the primary in terminal position (code renders a left-aligned wrap row
  ordered by the served eligibility list).
- Code-side honesty that stands (code wins, ADR-recorded): the agent final-text
  position stays empty (no wire serves it — a2a relay gap); the frame depicts
  the target state.
- Figma-side debts: no frame anywhere shows the request-changes verb, its
  comment capture, the applied-under-policy lane, or acknowledge; the Approvals
  frame `1089:4437` predates the agentic-authoring-ux redesign entirely (shows
  a "Claimed" state that ADR explicitly cut, lacks autonomy/diff/three-verdict)
  — the frame, not the code, is stale and must be re-authored.

### Live implementation evidence

A headless live-drive capture of the running app (shell, Agent panel,
Approvals dialog, populated proposal card, diff, request-changes modal) is in
flight against the dev stack; its screenshots will be appended here when it
completes. Until then the Figma arbitration rests on the frame renders plus
the source reading — every per-item ruling above marks which evidence carries
it. Structural findings (mount topology, modal host, stranded autonomy
control) are source-verified and do not depend on the pending captures.

## Recommendation

Keep the inline card as the primary and sole happy path. De-modalize the
station into a non-modal cross-run "Pending changes" inbox reachable from the
flow. Relocate the autonomy control composer-adjacent into the Agent panel
(blocked in part by the scope-level mode-read wire gap). Add a "N other pending
changes" bridge affordance in the Agent panel. Replace the request-changes
modal with an in-card inline textarea. Re-author the stale Approvals Figma
frame and add frames for the missing primitives.
