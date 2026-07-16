---
tags:
  - '#audit'
  - '#agentic-authoring-ux'
date: '2026-07-16'
modified: '2026-07-16'
related:
  - "[[2026-07-16-agentic-authoring-ux-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #audit) and one feature tag.
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

# `agentic-authoring-ux` audit: `wave W01 detangle and unify review` | APPROVED

## Scope

Independent code review of Wave W01 (the detangle/unify phase) of the
agentic-authoring-ux epic against the accepted ADR's D5 (kill the sign-in gate,
ambient provenance, ungate/rename Review) and D7 (one diff primitive). Reviewed:
the new `DiffView` primitive and both its call sites; the deleted
`ReviewerIdentity` gate and the ambient `ensureActorToken` mint; the Review
dialog rename/ungate; the no-signin guard; and the localization plane for the
deletions/renames. Reviewer-verified independently: tsc, eslint, and targeted
vitest across the diff/identity/guard/vocabulary suites (all green, no wire
mocks). This is a rolling audit for the whole epic; W01 is the first entry.

## Findings

### diff-primitive-unified | none (confirmed) | D7 correct — one line-diff implementation, both sources proven one component

Exactly one `diffLines`/`diffStat` implementation survives (`diffLines.ts`); the
embedded `DiffLinesView` duplicate is gone. `DiffView.tsx` is genuinely
source-agnostic — the in-editor site (`MarkdownDocView.tsx`, `source="draft-vs-
saved"`, a 4-line import swap leaving the `Mod+Alt+G` toggle/debounce/highlighting
untouched) and the proposal `DiffPanel` (`source="proposal-preview"`) both mount
it unchanged. `DiffView.render.test.tsx` renders both sources back-to-back and
asserts `data-diff-source` flips while the grammar stays identical — a real
single-component proof. The deleted `DiffPanel.render.test.tsx` coverage
(add/remove/context, tally, honest truncation, empty state, highlighting)
reappears verbatim in `DiffView.render.test.tsx`. No coverage lost.

### sign-in-gate-removed | none (confirmed) | D5 correct — no token-throw survives on any review path

Zero `ReviewerIdentity`/`hasToken` gating remains on any action; every
`ActionButton` disables purely on served `!eligibility.allowed`. `ensureActorToken`
mints once, caches, and dedupes concurrent callers via a shared in-flight promise;
all four review mutations route through it, so Approve/Reject/Submit/Apply/Rollback
work with zero prior editing (the original bug). The retained throwing
`requireActorToken` is used ONLY by `useCreateProposal`, which has no production
call site yet (the composer that will call it is W02) — not a hidden gate on any
live review path. The `noSigninVocabulary` guard has teeth (strips comments, scans
production incl. catalogs, phrase-match excluding camelCase) and every sign-in
string was deleted in lockstep across all localization planes. The
Approvals→Review rename is consistent across en/fr/ar.

### orphaned-approvals-keys | low | dead `common:actions.showApprovals`/`hideApprovals` pair, pre-existing

`locales/en/common.ts:59,79` carry an unwired `actions.showApprovals`/
`hideApprovals` pair with zero production call sites (the live consumer is the
separate `controlPanels.actions.*` namespace this wave renamed). It predates W01
(this branch touched only the `controlPanels.*` namespace) and is not a regression,
but sits adjacent to the rename. **Follow-up cleanup task, non-blocking.**

### foreign-suite-failures | none (W01) | three tree failures confirmed as the parallel localization lane's, not W01

`catalogInterpolation.test.ts` (unexpectedSection `{{section}}` token),
`MarkdownDocView.render.test.tsx` (label-casing "Document body editor"), and
`messagePolicy.test.ts` (`finalWave.planSteps.named`) all fail on files W01 never
touched (confirmed by diff). Pre-existing parallel-lane localization inconsistency
in the shared tree, tracked to that lane, not this wave.

## Recommendations

- W01 APPROVED, no required revisions — safe to proceed to W02.
- Follow-up (LOW): delete the orphaned `showApprovals`/`hideApprovals` key pair
  and its policy/allowlist entries when a wave next touches the generic actions
  catalog (avoid churning it standalone mid-flight for the localization lane).
- The three foreign suite failures belong to the localization-migration lane;
  do not attribute them to this epic at closeout.

## Wave W02 — the keystone shell (S07–S11) | APPROVED (2 HIGH revised, then re-reviewed)

Reviewed the whole wave: the bounded `stores/server/agent/` wire slice, the SSE
lifecycle fan-out, the docked `AgentPanel`, the `Composer` keystone, and the
agent action surface. First pass WITHHELD on two HIGH defects, both fixed and
re-reviewed to APPROVED.

### panel-grid-misplacement | high (resolved) | the panel wrapped to a new grid row instead of reflowing beside the stage

`shellLayout.ts` fixed the grid to three explicit tracks and `AppShell` mounted
the panel as a fourth UNPOSITIONED child; CSS Grid `grid-auto-flow: row` wrapped
it to a new row under the left rail (reviewer proved this in real Chromium), not
beside the stage as ADR D1 requires. RESOLVED: `appShellGridColumns` now appends
an explicit conditional 4th track when the panel is open, and the panel is pinned
to `col-start-4` via `agentPanelClassName` — explicit placement, never
auto-flow. The width moved onto the shared "agent" resize axis
(persisted through `viewStore`, keyboard-steppable), which also closed the S09
non-persistent-width follow-up. Width-clamp coverage relocated to the unified
`boundedShellPanelSize` seam (non-finite → min, derived from the real seam).

### agent-labels-fail-message-policy | high (resolved) | three action labels failed the localization gate; full gate never run clean

`agent.actions.{openPanel,closePanel,newSession}` tripped title-case /
non-imperative-action; `vitest run src/localization` was RED — the full gate had
not actually been run. RESOLVED: reworded verb-first ("Open agent panel" /
"Close agent panel" / "Start new agent session").

### stop-run-label-and-imperative-gap | none (fixed at close) | "End conversation" is the honest label; "End" admitted as an imperative verb

A separate gate failure surfaced at close: `agent.actions.stopRun` =
"End conversation" failed `non-imperative-action`. This is the EPIC's key (a
coder had misattributed it to the localization lane). "End conversation" is the
DELIBERATE, honest label — it reflects the discovered engine truth that Stop
cancels the whole session (ADR D4 amendment), not merely a run. Fixed correctly
by admitting "End" into `IMPERATIVE_ACTION_VERBS` (a legitimate vocabulary gap,
exactly as "Send" was added), not by rewording away a good label.

### composer-state-machine | none (confirmed) | the crux is correct against the engine truths

`agentSubmitDestination` correctly resolves bootstrap / turn / steer / queue from
(sessionId, served session.status, active_run, staged interrupt): bootstrap on a
non-active session (Stop-ends-session → next submit opens fresh), steer only when
the interrupt matches the live run, one-slot queue dispatched exactly once on
settle with restore-on-failure. Honest wire-gap handling: Model/Team
disabled-with-reason (unserved), client-staged interrupt self-cleans. SSE
fan-out consumes `session.created`/`run.started` via a cycle-free subscriber
seam. Action surface: one descriptor per verb; `Mod+Alt+A` vetted free and
guard-covered; chip folded into the FocusZone rove.

### module-size-resources | none (fixed at close) | the shared test-resources monolith, resolved not written off

`localization/testing/resources.ts` breached 1500 (agent keys + lane WIP).
Resolved rather than attributed away: the epic's agent fr/ar overlays were
extracted to `agentResources.ts` (established `pickerResources.ts` pattern,
merged catalog unchanged), and a prettier pass brought the file to ~1389 lines —
module-size clean, epic footprint in that file exactly 2 lines.

### stop-label-duplication | low | `stopRun` and a sibling `stop` both render "End conversation"

`en/common.ts` carries both `agent.actions.stopRun` and a sibling `stop` =
"End conversation". Small duplication; a follow-up dedup, non-blocking.

## Recommendations

- W02 APPROVED after revision; full gate `just dev lint frontend` exit 0, no
  regression to the W01/first-pass-approved scope.
- Follow-up (LOW): dedup the `stopRun`/`stop` "End conversation" pair.
- Carry the three W02 cross-team ASKS forward (ADR D4 amendment): run-level
  cancel that preserves the session, served pending-interrupt state + decision
  schema, and served model options.

## Wave W03 — the live transcript (S13/S14/S16) | APPROVED (1 HIGH revised, then re-reviewed)

Reviewed the streaming transcript, the tool-call/thinking/permission entries, and
the inline proposal card. First pass WITHHELD on one HIGH (a wrong-bind risk),
fixed and re-reviewed to APPROVED (46/46 tests, full gate exit 0).

### proposal-correlation-overreach | high (resolved) | a stale earlier session's proposal could render in a new session and be approved

`correlateSessionProposal` matched on `session.actor.id` alone, newest-wins across
the whole review queue. But the product is single-operator — every session shares
the ambient `human:local-operator` — so the actor match barely discriminates: a
fresh Session B could bind and render Session A's still-pending proposal under
Approve/Reject/Apply, letting a human approve an unrelated changeset (session
history makes multi-session the mainline, not an edge case). RESOLVED with a
zero-backend floor: `proposal.created_at_ms >= session.created_at_ms` before
newest-wins, so a proposal predating the session is excluded; a test pins the
exclusion. Residual (two sessions in the same millisecond) honestly documented —
only a served `session_id` on `ProposalProjection` closes it (filed ASK).

### proposal-hook-mount-per-turn | medium (resolved) | review hooks mounted on every turn, not just the latest

`AgentTurnProposal` rendered inside every turn's `<li>` with the latest-turn gate
inside the child, so `useReviewStationView` + four review mutations mounted for all
up-to-20 turns. RESOLVED: the mount is gated in `Transcript.tsx`
(`{isLatestTurn && …}`) — the review hooks mount once.

### wire-honesty | none (confirmed) | the transcript renders only what is served

Verified against the ADR SERVED/NOT-SERVED split: the live-turn indicator is the
served run-state word (never a fake token stream); the thinking block null-renders
when unserved; the final-text position is a marked honest gap; tool-call rows
render only client-dispatched calls from a bounded annex. The permission prompt is
proven end-to-end on the live engine (requester≠decider holds); its fault path
keeps the prompt open, never silently drops it. The proposal card reuses the
ReviewStation card verbatim — still one proposal-card implementation. The render
cap derives from `snapshot.caps.turn_cap` so the window + windowFull can't drift.

## Recommendations

- W03 APPROVED after revision; full gate `just dev lint frontend` exit 0.
- Carry the two W03 cross-team ASKS forward (ADR amendments): a run-settle /
  completion lifecycle event (no run ever transitions to `completed` today, so
  "Done" cannot render from the wire), and `session_id` (+ ideally run/turn ids)
  on `ProposalProjection` for an exact proposal↔run bind.

## Wave W04 — the comment bridge + autonomy control (S18/S19) | APPROVED (1 HIGH revised, then re-reviewed)

Reviewed the comment→agent bridge and the operation-mode / autonomy control.
First pass WITHHELD on one HIGH (a shared-engine test hazard) + one MEDIUM;
fixed and re-reviewed to APPROVED (35/35 tests, full gate exit 0).

### live-test-mode-reset-not-crash-safe | high (resolved) | a thrown assertion strands the shared engine in autonomous, cascading into later live tests

The autonomy live test reset the worktree operation mode to `manual` as a plain
trailing statement, not exception-safe. Operation mode is worktree-GLOBAL and the
live suite runs sequentially (`fileParallelism: false`), so a thrown `waitFor`
would leave the scratch engine in `autonomous` — and later live tests
(`ProposalCard.live`, `authoring.happyPath.live`) that depend on manual-gate
semantics would silently auto-apply instead of queueing, a cascading failure that
masks its own cause. RESOLVED: the reset moved to an unconditional async
`afterEach`; proven by running the live suite sequentially with the manual-gate
tests staying green.

### mode-switch-swallows-denial | medium (resolved) | a mode switch silently no-ops on denial/error with no feedback

`setOperationMode` was fire-and-forget — it ignored both the `denied`
`AuthoringCommandOutcome` (a value, not a throw) and the transport error, unlike
the sibling `ProposalCard` decision buttons in the same file. RESOLVED: the
control now runs the shared `outcomeFeedback` seam and renders inline feedback
(denial → a fixed localized descriptor, never the raw reason; error → the typed
failure descriptor); a successful switch shows no feedback (the active segment is
the cue).

### comment-bridge-and-autonomy | none (confirmed) | wire-honest, bounded, served-shape-honest, principal-gated

S18: the comment batch is bounded (cap 32) + upsert-deduped by id (re-stage
refreshes a stale body), serialized deterministically into the ONE `prompt` field
the turn contract accepts (no structured feedback field — honestly flagged, the
`feedback_batch_id` continuation is a2a-gated), rendered as the shared "N comments"
chip (one attachment treatment, not parallel). S19: the autonomy control derives
its mode ONLY from a served `policy.effective_mode` — renders nothing when the
queue is empty (no fabricated default), `assisted` lights neither segment;
principal-gated (human/system only, verified live); the mode switch round-trips
against the real engine.

### comment-send-to-agent-bespoke | low (deferred) | a bespoke handler, not a shared ActionDescriptor

`comment:send-to-agent` is a bespoke `onClick` rather than the ADR D8 shared
ActionDescriptor — but it matches the existing comment-row precedent
(resolve/edit/delete are all bespoke; there is no comment context-menu surface).
Deferred D8 follow-up, non-blocking.

## Recommendations

- W04 APPROVED after revision; full gate `just dev lint frontend` exit 0.
- W01–W04 (all buildable waves) are complete. W05 (a2a enrichment) is cross-team
  gated on the a2a backend (contract accepted, zero implementation) — the epic
  reaches its buildable completion here; every honest wire gap is a filed ask.
- Carry the two W04 cross-team ASKS forward: a structured feedback field on the
  turn contract (comments as data, not prose), and a scope-level operation-mode
  read (so the autonomy control works pre-proposal).
- Deferred follow-ups: the `stopRun`/`stop` "End conversation" dedup (W02) and
  the `comment:send-to-agent` ActionDescriptor (W04).
