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
