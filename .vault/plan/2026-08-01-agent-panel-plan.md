---
tags:
  - '#plan'
  - '#agent-panel'
date: '2026-08-01'
tier: L3
related:
  - '[[2026-08-01-agent-panel-shell-integration-adr]]'
  - '[[2026-08-01-a2a-agent-flow-adr]]'
  - '[[2026-07-31-agent-panel-ux-research]]'
---
# `agent-panel` plan

### Phase `P01` - Archetype A: solo document editor (a2a)

Add the single-agent document-editing lane: new persona + preset cloned from solo-coder's authoring-bridge shape with filesystem write off (agent-flow D2/D7). a2a repo, parallel-safe with every other phase.

- [ ] `P01.S01` - Add the vaultspec-doc-editor persona TOML (document-editing mandate, rag read context, authoring-bridge tools only, filesystem_write off); a2a agent config directory.
- [ ] `P01.S02` - Add the solo doc-editor team preset (pipeline topology, one worker, authoring_bridge=true, served model profiles limited to live-proven providers); a2a `team_config.py` + preset configs.
- [ ] `P01.S03` - Test: preset compiles, run proposes exactly one whole-document change through the authoring client, request_changes loops a revision; a2a graph tests.

### Phase `P02` - Archetype B: the Plan third phase (a2a)

Extend research_adr with Plan → Gate 3 after ADR acceptance, reusing the doc-reviewer loop and phase-gate pattern; wire or delete the orphaned persona TOMLs (agent-flow D4).

- [ ] `P02.S04` - Extend the research_adr compiler with the Plan phase (plan-author role, doc-reviewer inner loop, phase-gate interrupt at Gate 3) and extend supported_capabilities with plan_document; a2a `compiler.py` + `team_config.py`.
- [ ] `P02.S05` - Adapt the orphaned vaultspec-planner persona to the vault Plan-document mandate; wire or delete vaultspec-reviewer and vaultspec-analyst in the same change; a2a agent config directory.
- [ ] `P02.S06` - Test: full three-phase run against a mock/deterministic profile parks at Gate 3 with a plan proposal; resume on approve completes, request_changes revises; a2a `graph/tests/nodes/test_phase_gate.py` siblings.

### Phase `P03` - Clarification interrupt (a2a side)

The mid-run structured question: new interrupt node + authoritative disclosure + typed resume, sibling of the proven permissions-respond shape (agent-flow D5).

- [ ] `P03.S07` - Add the clarification graph node raising interrupt() with the bounded payload (≤4 questions, choice|text, required, capped strings), callable from Ground/Diverge; a2a graph nodes.
- [ ] `P03.S08` - Disclose the pending clarification (request id + payload) on the run-status response and emit the clarification-pending relay frame; a2a `routes/gateway.py` + `schemas/gateway.py`.
- [ ] `P03.S09` - Add POST clarification respond on the gateway mapping answers to Command(resume) of the parked node, mirroring the permissions respond route; a2a `routes/gateway.py`.
- [ ] `P03.S10` - Test: park-disclose-respond-resume round trip over the real graph plus reload-recovery from status disclosure alone; a2a gateway + graph tests.

### Phase `P04` - Clarification contract events (engine)

The three reviewed contract events crossing the frozen edge: verb whitelist, relay frame acceptance, boundary validation (agent-flow D5; edge ADR amendment discipline).

- [ ] `P04.S11` - Add clarification-respond to the /ops/a2a verb whitelist with boundary-validated bounded args (run id, request id, answers keyed by question id); engine `routes/ops/a2a.rs`.
- [ ] `P04.S12` - Accept and relay the clarification-pending frame kind within existing frame caps; conformance test that the relay stays non-authoritative; engine `routes/ops/a2a_stream.rs`.
- [ ] `P04.S13` - Record the whitelist change as a reviewed contract event mutually referenced in both repos per the edge ADR consequence; `.vault/adr/2026-07-14-a2a-orchestration-edge-adr.md` amendment.

### Phase `P05` - Center-slot rehome (frontend shell)

The {graph | agent} toggle: tri-state center slot, reserved __agent__ panel, 4th grid track deleted, every entry point re-routed, vocabulary retired (shell-integration D1).

- [ ] `P05.S14` - Generalize graphVisible to centerSlot graph|agent|none with migration of persisted layout state; `frontend/src/stores/view/shellLayout.ts`.
- [ ] `P05.S15` - Add the reserved __agent__ panel reconciliation beside __graph__ and host the AgentPanel body in it; `frontend/src/app/stage/DockWorkspace.tsx`.
- [ ] `P05.S16` - Replace the dock-header graph toggle with the segmented graph|agent switch plus hide; `frontend/src/app/stage/DockWorkspace.tsx`.
- [ ] `P05.S17` - Delete the 4th grid track, agentPanelWidth store field, resize seam, and agentPanelClassName; re-route AgentChip, Mod+Alt+A, palette, background menu, comment bridge, and the Review chip to the slot; `frontend/src/app/AppShell.tsx` + `frontend/src/stores/view/agentPanel.ts` + `frontend/src/stores/view/chromeActions.ts`.
- [ ] `P05.S18` - Retire panel:approvals and Review-chip vocabulary into common:agent.* across the four catalog touch points; `frontend/src/localization/catalogAgentKeys.ts` + locales.
- [ ] `P05.S19` - Reconciliation tests mirroring the graph panel's: slot flips never re-parent the canvas, restore races pinned, chip fallback renders when slot shows graph during a live run; `frontend/src/app/stage/DockWorkspace.test.tsx` siblings.

### Phase `P06` - Begin idiom and composer (frontend)

The empty-state composer with scope-named headline, evidence autocomplete, served-profile picker, autonomy banner, stop swap (shell-integration D2/D3).

- [ ] `P06.S20` - Build the begin-idiom empty state: centered composer, scope-personalized headline, recents-yielding starter affordances; bottom-docked composer when a transcript exists; `frontend/src/app/agent/AgentPanel.tsx`.
- [ ] `P06.S21` - Add @-evidence rel-path autocomplete riding the files-code and files-vault provider seam, feeding the existing mention-chip store; `frontend/src/app/agent/Composer.tsx` + `frontend/src/stores/view/agentComposer.ts`.
- [ ] `P06.S22` - Render the model picker from the served profile list only and codify the two-row left/right composer law; `frontend/src/app/agent/Composer.tsx`.
- [ ] `P06.S23` - Add the send-to-stop swap during streaming runs and the standing apply-automatically warning banner above the composer; `frontend/src/app/agent/Composer.tsx`.
- [ ] `P06.S24` - Render and unit tests for begin/continue posture, autocomplete provider scoping, and banner presence rules; `frontend/src/app/agent/Composer.test.tsx` siblings.

### Phase `P07` - Transcript C-rules conformance (frontend)

The conversation grammar: bubbles, one-disclosure work stretches, stat cards, docked run header, recap cards (shell-integration D4).

- [ ] `P07.S25` - User turns as right-aligned accent bubbles, assistant turns full-width open markdown; `frontend/src/app/agent/Transcript.tsx`.
- [ ] `P07.S26` - Group tool calls and thinking under one collapsed elapsed-labeled disclosure per work stretch expanding to the flat icon+label timeline, preserving the inline permission prompt; `frontend/src/app/agent/ToolCallEntry.tsx` + `Transcript.tsx`.
- [ ] `P07.S27` - Add the served aggregate and per-file diffstat to the proposal card with terminal-right actions; `frontend/src/app/authoring/ReviewStation.tsx`.
- [ ] `P07.S28` - Rehome run metadata (phase, roster with per-role model, sources, elapsed) into the collapsible docked run header region; `frontend/src/app/agent/TeamRunProgressContext.tsx` + `AgentPanel.tsx`.
- [ ] `P07.S29` - Render tests over authored states for each C-rule surface; `frontend/src/app/agent/` test siblings.

### Phase `P08` - Questionnaire surface (frontend)

ClarificationCard bound to the D5 payload: in-transcript answer surface, authoritative recovery, recap collapse (shell-integration D5).

- [ ] `P08.S30` - Build ClarificationCard (choice buttons, bounded text inputs, required gating) rendered at the park point with composer disabled-with-hint; `frontend/src/app/agent/ClarificationCard.tsx`.
- [ ] `P08.S31` - Wire clarification-respond through the a2a client and collapse the card into the C8 recap on success; `frontend/src/stores/server/agent/a2aTeam.ts`.
- [ ] `P08.S32` - Reload-recovery: re-render the pending questionnaire from run-status disclosure alone with the relay frame acting only as a re-read nudge; `frontend/src/stores/server/liveAdapters/a2aRelay.ts` + tests.

### Phase `P09` - Capability honesty gates (a2a)

Web research becomes real; providers earn their profiles; the two stitched end-to-end loops (agent-flow D6/D8).

- [ ] `P09.S33` - Add the web-search/fetch MCP tool to the researcher and analyst harness with cited-evidence entry into the context package; a2a harness `mcp_servers` config.
- [ ] `P09.S34` - Live completed-turn tests for claude and kimi (spend-gated) admitting their profiles; gemini/openai/zhipu remain unserved until theirs exist; a2a provider live tests.
- [ ] `P09.S35` - Stitch the full cross-process verdict loop test (engine verdict → subscriber → worker HTTP → graph resume) and its clarification-loop sibling; a2a service-marked tests.

### Phase `P10` - Assembled verification and closeout

Live-drive both archetypes end-to-end in the assembled app, run every gate, record the follow-on debt.

- [ ] `P10.S36` - Live-drive Archetype A: open document, @-attach evidence, solo run, inline three-verdict review, applied change visible in the split; persist screenshots; `frontend/src/testing/` live-drive script.
- [ ] `P10.S37` - Live-drive Archetype B: team run through research, clarification questionnaire answer, ADR proposal acceptance with one request_changes loop, plan proposal; persist screenshots; `frontend/src/testing/` live-drive script.
- [ ] `P10.S38` - Full lint and live-wire gates both repos; record Figma frame debt (stale Approvals frame, missing diffstat, questionnaire and recap frames) and the compact read-only run-status affordance as named follow-ons; `frontend/package.json` gates.

## Description

## Steps

## Parallelization

P01, P02, P03 are a2a-side and mutually independent; P04 gates only P08 (frontend clarification) and follows P03's shapes; P05–P07 are frontend-parallel after P05.S14/S15 land; P09 rides independently; P10 is terminal.

## Verification
