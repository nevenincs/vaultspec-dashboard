---
generated: true
tags:
  - '#index'
  - '#agentic-authoring-ux'
date: '2026-07-16'
modified: '2026-07-16'
related:
  - '[[2026-07-16-agentic-authoring-ux-W01-P01-S02]]'
  - '[[2026-07-16-agentic-authoring-ux-W01-P01-S03]]'
  - '[[2026-07-16-agentic-authoring-ux-W01-P01-S04]]'
  - '[[2026-07-16-agentic-authoring-ux-W01-P01-S05]]'
  - '[[2026-07-16-agentic-authoring-ux-W02-P02-S06]]'
  - '[[2026-07-16-agentic-authoring-ux-W02-P02-S07]]'
  - '[[2026-07-16-agentic-authoring-ux-W02-P02-S08]]'
  - '[[2026-07-16-agentic-authoring-ux-W02-P02-S09]]'
  - '[[2026-07-16-agentic-authoring-ux-W02-P02-S10]]'
  - '[[2026-07-16-agentic-authoring-ux-W02-P02-S11]]'
  - '[[2026-07-16-agentic-authoring-ux-W02-P02-S12]]'
  - '[[2026-07-16-agentic-authoring-ux-W03-P03-S13]]'
  - '[[2026-07-16-agentic-authoring-ux-W03-P03-S14]]'
  - '[[2026-07-16-agentic-authoring-ux-W03-P03-S15]]'
  - '[[2026-07-16-agentic-authoring-ux-W03-P03-S16]]'
  - '[[2026-07-16-agentic-authoring-ux-W03-P03-S17]]'
  - '[[2026-07-16-agentic-authoring-ux-W04-P04-S18]]'
  - '[[2026-07-16-agentic-authoring-ux-W04-P04-S19]]'
  - '[[2026-07-16-agentic-authoring-ux-W04-P04-S20]]'
  - '[[2026-07-16-agentic-authoring-ux-W05-P05-S21]]'
  - '[[2026-07-16-agentic-authoring-ux-W05-P05-S22]]'
  - '[[2026-07-16-agentic-authoring-ux-W05-P05-S23]]'
  - '[[2026-07-16-agentic-authoring-ux-adr]]'
  - '[[2026-07-16-agentic-authoring-ux-audit]]'
  - '[[2026-07-16-agentic-authoring-ux-plan]]'
  - '[[2026-07-16-agentic-authoring-ux-research]]'
---

# `agentic-authoring-ux` feature index

Auto-generated index of all documents tagged with `#agentic-authoring-ux`.

## Documents

### adr

- `2026-07-16-agentic-authoring-ux-adr` - `agentic-authoring-ux` adr: `one docked agent panel unifying authoring, agent, and review` | (**status:** `accepted`)

### audit

- `2026-07-16-agentic-authoring-ux-audit` - `agentic-authoring-ux` audit: `wave W01 detangle and unify review` | APPROVED

### exec

- `2026-07-16-agentic-authoring-ux-W01-P01-S02` - Create one DiffView primitive parameterized by source (draft-vs-saved or proposal-preview) with a single diffLines/diffStat implementation
- `2026-07-16-agentic-authoring-ux-W01-P01-S03` - Delete the ReviewerIdentity sign-in UI and all auth vocabulary
- `2026-07-16-agentic-authoring-ux-W01-P01-S04` - Rename and ungate the Review dialog (Approvals to Review)
- `2026-07-16-agentic-authoring-ux-W01-P01-S05` - Run the full gate and live-wire suite, route the W01 diff through code review, and persist the audit
- `2026-07-16-agentic-authoring-ux-W02-P02-S06` - Author the binding Figma frames for the Agent panel, collapsed footer chip, and composer before build (D1/D2)
- `2026-07-16-agentic-authoring-ux-W02-P02-S07` - Add the bounded stores/server/agent slice: the sole wire client for sessions/turns/runs/interrupts/agent-tools with query keys and bounded caches (D9)
- `2026-07-16-agentic-authoring-ux-W02-P02-S08` - Add SSE adapter cases for the dropped session.created and run.started lifecycle events (D3)
- `2026-07-16-agentic-authoring-ux-W02-P02-S09` - Build the docked Agent panel mounted once in AppShell plus the collapsed footer status chip in the FrameworkStatusCluster grammar (D1)
- `2026-07-16-agentic-authoring-ux-W02-P02-S10` - Build the composer: multiline Enter-to-send with Shift+Enter newline, slash popover from the one command registry, at-mention chips over AutocompleteCombobox resolving vault features/documents, small adjacent Model and Team selectors (D2)
- `2026-07-16-agentic-authoring-ux-W02-P02-S11` - Enroll the agent ActionDescriptors (toggle-panel, stop-run, new-session) across palette/keymap/menus
- `2026-07-16-agentic-authoring-ux-W02-P02-S12` - Run the full gate and live-wire suite, route the W02 shell and composer through code review, and persist the audit
- `2026-07-16-agentic-authoring-ux-W03-P03-S13` - Build the fixed-order turn transcript (user prompt then thinking then tool calls then final text) with collapse-on-settle and a bounded retained window (D3)
- `2026-07-16-agentic-authoring-ux-W03-P03-S14` - Build the collapsed-by-default tool-call entry with per-call served status, the dimmed cost-labeled thinking block, and the inline tool-permission prompt wired to permission-decision (D3)
- `2026-07-16-agentic-authoring-ux-W03-P03-S15` - Add the Stop button (wire runs/cancel), steer-via-composer (interrupt resume while parked), and the one-slot queued-prompt chip dispatched on run settle (D4)
- `2026-07-16-agentic-authoring-ux-W03-P03-S16` - Build the inline proposal card (served summary, change count, Show-changes via DiffView, eligibility-driven Approve/Reject/Apply) as the preview-then-approve happy path (D5)
- `2026-07-16-agentic-authoring-ux-W03-P03-S17` - Run the full gate and live-wire suite, route the W03 transcript through code review, and persist the audit
- `2026-07-16-agentic-authoring-ux-W04-P04-S18` - Add the Send-to-agent action and the N-comments removable chip in the composer using the shared mention-chip grammar, executing the accepted feedback-loop ADR frontend-side (D6)
- `2026-07-16-agentic-authoring-ux-W04-P04-S19` - Add the operation-mode control in the Review header wired to POST mode, rendering served mode tokens as plain labels (D5)
- `2026-07-16-agentic-authoring-ux-W04-P04-S20` - Run the full gate and live-wire suite, route the W04 bridge and mode through code review, and persist the audit
- `2026-07-16-agentic-authoring-ux-W05-P05-S21` - Wire the Team selector to the a2a presets-list pass-through and team run-start/status/cancel, degraded disabled-with-reason from tiers when a2a is down (D9)
- `2026-07-16-agentic-authoring-ux-W05-P05-S22` - Consume the a2a relayed SSE channel for token/tool-call frames once the a2a team ships it, with bounded run-status polling fallback (D3/D9)
- `2026-07-16-agentic-authoring-ux-W05-P05-S23` - Run the full gate and live-wire suite, route the W05 a2a wiring through code review, and persist the audit

### plan

- `2026-07-16-agentic-authoring-ux-plan` - `agentic-authoring-ux` plan

### research

- `2026-07-16-agentic-authoring-ux-research` - `agentic-authoring-ux` research: `modern agentic-application UX standards`
