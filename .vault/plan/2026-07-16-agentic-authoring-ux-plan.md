---
tags:
  - '#plan'
  - '#agentic-authoring-ux'
date: '2026-07-16'
modified: '2026-07-17'
tier: L3
related:
  - '[[2026-07-16-agentic-authoring-ux-adr]]'
---

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the
       related: field above.
     - The related: field carries the AUTHORISING documents
       (ADR, research, reference, prior plan) for every Step in
       this plan. Steps inherit this chain; per-row reference
       footers do not exist.
     - NEVER use [[wiki-links]] or markdown links in the
       document body. -->

<!-- RETIRED: S01 -->

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #plan) and one feature tag.
     Replace agentic-authoring-ux with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     tier is mandatory for new plans. Allowed: L1, L2, L3, L4.
     L1 = Steps only. L2 = Phases above Steps. L3 = Waves above
     Phases above Steps. L4 = Epic above Waves above Phases above
     Steps; PM association required. Pre-existing plans without this
     field default to L2.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'. The related field
     carries the AUTHORIZING documents (ADR, research, reference, prior
     plan) for every Step in this plan; Steps inherit this chain;
     per-row reference footers do not exist.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->


<!-- HIERARCHY AND TIERS:
     Epic > Wave > Phase > Step. Step is the canonical leaf-row
     noun. Execution Record artifact: <Step Record>.
     Tier is declared in frontmatter as tier: L1/L2/L3/L4
     (mandatory for new plans; pre-existing plans without the
     field default to L2 and the writer adds the field on first
     edit). The tier selects containers:
       L1 = Steps only.
       L2 = Phases above Steps.
       L3 = Waves above Phases above Steps.
       L4 = Epic above Waves above Phases above Steps; MUST declare
            a project-management association in the Epic intent
            block prose.
     Selection is by complexity criteria, not container counting.
     Writer never invents containers to qualify a tier. -->

<!-- IDENTIFIERS AND ROW CONTRACT:
     S##, P##, W## are flat, per-document, append-only, immutable.
     Promotion adds containers without renumbering. Gaps are not
     reused.
     Display paths are computed from current grouping:
       Step path:    L1 S##   L2 P##.S##   L3/L4 W##.P##.S##
       Phase heading:        L2 P##       L3/L4 W##.P##
       Wave heading:                      L3/L4 W##
     Row format:
       - [ ] `<display-path>` - imperative-verb action; `path/to/file`.
     Two-state checkboxes only ([ ] open, [x] closed). No per-row
     reference footers; wiki-links and markdown links are forbidden
     in plan body. Authorizing documents go in the plan's `related:`
     frontmatter once.
     ASCII spaced hyphens everywhere; em-dash (U+2014) and en-dash
     (U+2013) are forbidden. Step rows within a Phase are
     contiguous. -->

<!-- NO COMPRESSION:
     N self-similar actions = N rows. Never collapse into "for each
     X, do Y" / "across all callers, do Z" / "in every module,
     replace W". The rule applies at every tier including L1. -->

<!-- VAULTSPEC-CORE VAULT PLAN CLI:
     The `vaultspec-core vault plan` CLI is the canonical surface for
     structural manipulation of this plan document. Writers and
     executors MUST use `vaultspec-core vault plan step add/insert/move/
     remove/check/uncheck/toggle/edit`,
     `vaultspec-core vault plan phase add/move/remove/edit`,
     `vaultspec-core vault plan wave add/move/remove/edit`,
     `vaultspec-core vault plan epic intent`, and
     `vaultspec-core vault plan tier promote/demote` for every
     identifier-affecting change rather than hand-editing the row
     grammar. Hand edits are tolerated by the parser but flagged by
     `vaultspec-core vault plan check`; canonical-identifier preservation is
     guaranteed only when the CLI performs the mutation. Run
     `vaultspec-core vault plan --help` for the full subcommand
     surface. -->

# `agentic-authoring-ux` plan

## Wave `W01` - Detangle and unify

Pure simplification before growth: collapse the two diff renderers into one primitive, delete the sign-in gate, make provenance ambient, and rename/ungate the Review dialog (ADR P1/D5/D7).

<!-- One-line headline summary plan. -->

### Phase `W01.P01` - Diff unification and review detangle

Collapse both diff renderers into one DiffView; delete the ReviewerIdentity sign-in gate and move token bootstrap to an ambient stores seam; rename/ungate the Review dialog.

- [x] `W01.P01.S02` - Create one DiffView primitive parameterized by source (draft-vs-saved or proposal-preview) with a single diffLines/diffStat implementation; `route both call sites through it and delete the duplicate renderer (D7); `frontend/src/app/authoring/DiffView.tsx`.
- [x] `W01.P01.S03` - Delete the ReviewerIdentity sign-in UI and all auth vocabulary; `move the actor-token bootstrap to an ambient lazy mint fired by the first mutating intent (D5); `frontend/src/stores/server/authoring/index.ts`.
- [x] `W01.P01.S04` - Rename and ungate the Review dialog (Approvals to Review); `add the grep-guard asserting no Sign in vocabulary remains in frontend/src (D5); `frontend/src/app/panels/ControlPanels.tsx`.
- [x] `W01.P01.S05` - Run the full gate and live-wire suite, route the W01 diff through code review, and persist the audit; `frontend/`.

## Wave `W02` - The keystone shell

The docked Agent panel, footer chip, and composer keystone over a new stores/server/agent slice; SSE adapter cases for the dropped session/run events; the agent ActionDescriptors (ADR P2/D1/D2/D8/D9).

### Phase `W02.P02` - Panel, composer, and agent wire slice

Mount the docked Agent panel + collapsed footer chip; build the composer (slash, @-mention chips, Model/Team selectors); add the stores/server/agent slice with sessions/turns + SSE adapter cases; enroll the agent ActionDescriptors with vetted chords.

- [x] `W02.P02.S06` - Author the binding Figma frames for the Agent panel, collapsed footer chip, and composer before build (D1/D2); `figma:SlhonORmySdoSMTQgDWw3w`.
- [x] `W02.P02.S07` - Add the bounded stores/server/agent slice: the sole wire client for sessions/turns/runs/interrupts/agent-tools with query keys and bounded caches (D9); `frontend/src/stores/server/agent`.
- [x] `W02.P02.S08` - Add SSE adapter cases for the dropped session.created and run.started lifecycle events (D3); `frontend/src/stores/server/liveAdapters`.
- [x] `W02.P02.S09` - Build the docked Agent panel mounted once in AppShell plus the collapsed footer status chip in the FrameworkStatusCluster grammar (D1); `frontend/src/app/agent/AgentPanel.tsx`.
- [x] `W02.P02.S10` - Build the composer: multiline Enter-to-send with Shift+Enter newline, slash popover from the one command registry, at-mention chips over AutocompleteCombobox resolving vault features/documents, small adjacent Model and Team selectors (D2); `frontend/src/app/agent/Composer.tsx`.
- [x] `W02.P02.S11` - Enroll the agent ActionDescriptors (toggle-panel, stop-run, new-session) across palette/keymap/menus; `vet Mod+Alt+A against the reserved-chord denylist with a citation (D8); `frontend/src/stores/view/agentActions.ts`.
- [x] `W02.P02.S12` - Run the full gate and live-wire suite, route the W02 shell and composer through code review, and persist the audit; `frontend/`.

## Wave `W03` - The live transcript

Tool-call, thinking, and inline permission entries; stop, steer-via-composer, and the one-slot queued prompt; the inline proposal card consuming the unified DiffView (ADR P3/D3/D4).

### Phase `W03.P03` - Transcript, streaming, and inline review

Fixed-order turn transcript; collapsed tool-call/thinking/permission entries; stop/steer/queued-prompt; inline proposal card on the unified DiffView.

- [x] `W03.P03.S13` - Build the fixed-order turn transcript (user prompt then thinking then tool calls then final text) with collapse-on-settle and a bounded retained window (D3); `frontend/src/app/agent/Transcript.tsx`.
- [x] `W03.P03.S14` - Build the collapsed-by-default tool-call entry with per-call served status, the dimmed cost-labeled thinking block, and the inline tool-permission prompt wired to permission-decision (D3); `frontend/src/app/agent/ToolCallEntry.tsx`.
- [x] `W03.P03.S15` - Add the Stop button (wire runs/cancel), steer-via-composer (interrupt resume while parked), and the one-slot queued-prompt chip dispatched on run settle (D4); `frontend/src/app/agent/Composer.tsx`.
- [x] `W03.P03.S16` - Build the inline proposal card (served summary, change count, Show-changes via DiffView, eligibility-driven Approve/Reject/Apply) as the preview-then-approve happy path (D5); `frontend/src/app/agent/ProposalCard.tsx`.
- [x] `W03.P03.S17` - Run the full gate and live-wire suite, route the W03 transcript through code review, and persist the audit; `frontend/`.

## Wave `W04` - The bridge and mode

Comment-to-agent attachment executing the accepted agentic-feedback-loop ADR frontend-side, and the operation-mode control (ADR P4/D5/D6).

### Phase `W04.P04` - Comment bridge and autonomy control

Comment-to-agent attachment (the accepted feedback-loop ADR) via shared chip grammar + Send-to-agent action; the operation-mode control in the Review header.

- [ ] `W04.P04.S18` - Add the Send-to-agent action and the N-comments removable chip in the composer using the shared mention-chip grammar, executing the accepted feedback-loop ADR frontend-side (D6); `frontend/src/app/viewer/CommentThreadPanel.tsx`.
- [ ] `W04.P04.S19` - Add the operation-mode control in the Review header wired to POST mode, rendering served mode tokens as plain labels (D5); `frontend/src/app/authoring/ReviewStation.tsx`.
- [ ] `W04.P04.S20` - Run the full gate and live-wire suite, route the W04 bridge and mode through code review, and persist the audit; `frontend/`.

## Wave `W05` - a2a enrichment

Cross-team gated: Team selector on presets-list, team run wiring, and relayed-SSE-channel consumption once the a2a team ships its side (ADR P5/D9).

### Phase `W05.P05` - a2a team runs and relay

Team selector on presets-list, team run-start/status/cancel wiring, and relayed-SSE-channel consumption; gated on the a2a team's build.

- [ ] `W05.P05.S21` - Wire the Team selector to the a2a presets-list pass-through and team run-start/status/cancel, degraded disabled-with-reason from tiers when a2a is down (D9); `frontend/src/stores/server/agent`.
- [ ] `W05.P05.S22` - Consume the a2a relayed SSE channel for token/tool-call frames once the a2a team ships it, with bounded run-status polling fallback (D3/D9); `frontend/src/stores/server/liveAdapters`.
- [ ] `W05.P05.S23` - Run the full gate and live-wire suite, route the W05 a2a wiring through code review, and persist the audit; `frontend/`.

## Description

<!-- Briefly describe the proposed work. Reference `{adr}`s,
`{research}`, `{reference}`. Supporting documentation must be read prior to
writing the plan document. -->

## Steps

<!-- The plan's tier (declared in frontmatter as `tier: L1`, `L2`, `L3`, or
`L4`) determines the structure under this section:

- `L1`: a flat list of Step rows (no Phase, Wave, or Epic).
- `L2`: one or more `### Phase` blocks each containing Step rows.
- `L3`: one or more `## Wave` blocks each containing Phase blocks.
- `L4`: a `## Epic intent` block, followed by Wave blocks. -->

<!-- Replace this scaffold with the tier-appropriate structure for your plan.
Format examples for each block type are embedded below as commented
templates. -->

<!-- IMPORTANT: This document must be updated between execution runs to
     track progress. -->

<!-- PHASE BLOCK FORMAT (L2, L3, L4):
     ### Phase `P02` - rewrite the writer-agent contract

     One sentence stating what this Phase delivers.

     - [ ] `P02.S01` - imperative-verb action; `path/to/file`.
     - [ ] `P02.S02` - imperative-verb action; `path/to/file`.

     At L3/L4 the Phase heading uses the ancestor-aware path
     (### Phase `W01.P02` - ...). The intent sentence is mandatory. -->

<!-- WAVE BLOCK FORMAT (L3, L4):
     ## Wave `W01` - language-only convention rollout

     One paragraph stating what this Wave delivers, which downstream
     Wave depends on it, and which authorizing documents back it.

     ### Phase `W01.P01` - ...
     ### Phase `W01.P02` - ...

     The Wave intent paragraph is mandatory. -->

<!-- EPIC INTENT BLOCK FORMAT (L4 only):
     ## Epic intent

     One paragraph stating the strategic goal, the external project-
     management association (milestone name, project board identifier,
     roadmap entry), the timeline horizon, and the teams or agents
     involved.

     ## Wave `W01` - ...
     ## Wave `W02` - ...

     The ## Epic intent block is mandatory at L4 and absent at L1, L2,
     L3. The plan title (the level-one # heading at the top of the
     document) is the Epic title; no separate Epic heading is emitted. -->

## Parallelization

<!-- State which Steps, Phases, or Waves can be executed in parallel and
which carry hard ordering. At `L1` and `L2`, parallelism is decided
per-Step or per-Phase. At `L3` and `L4`, Waves are sequenced by
default (one Wave must land before the next can begin); Phases
within a single Wave may be parallelized when they share no hard
interdependency. -->

## Verification

<!-- State the mission success criteria for this plan. Each criterion
should be a verifiable check (test passes, surface conforms,
reviewer signs off) rather than a free-form assertion.

The plan is complete when every Step in the plan is closed
(`- [x]`). At `L4`, the Epic-completion check additionally requires
the declared project-management association to report the Epic
complete.

For tier-specific verification cadence, see the authorizing
documents linked in the `related:` frontmatter. -->
