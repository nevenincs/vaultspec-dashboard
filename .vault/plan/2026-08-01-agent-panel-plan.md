---
tags:
  - '#plan'
  - '#agent-panel'
date: '2026-08-01'
modified: '2026-08-02'
body_hash: 'sha256:9e4da426efd8e356fbc93dc6f46d124d838b02351c2080fe73fd55362a6798d1'
tier: L2
related:
  - '[[2026-08-01-agent-panel-shell-integration-adr]]'
  - '[[2026-08-01-a2a-agent-flow-adr]]'
  - '[[2026-07-31-agent-panel-ux-research]]'
---

# `agent-panel` plan

## Description

## Steps

### Phase `P01` - Archetype A: solo document editor (a2a)

Add the single-agent document-editing lane: new persona + preset cloned from solo-coder's authoring-bridge shape with filesystem write off (agent-flow D2/D7). a2a repo, parallel-safe with every other phase.

- [x] `P01.S01` - Add the vaultspec-doc-editor persona TOML (document-editing mandate, rag read context, authoring-bridge tools only, filesystem_write off); `src/vaultspec_a2a/team/presets/agents/`.
- [x] `P01.S02` - Add the solo doc-editor team preset (pipeline topology, one worker, authoring_bridge on, served model profiles limited to live-proven providers); `src/vaultspec_a2a/team/presets/teams/`.
- [x] `P01.S03` - Test the preset structurally: it compiles with the correct single worker and the shape pins the D2 divergence and D3 provider constraints - the generic propose and request-changes bridge machinery is already covered by existing dispatch tests and the live doc-editor proof rides P10; `src/vaultspec_a2a/team/tests/`.

### Phase `P02` - Archetype B: the Plan third phase (a2a)

Extend research_adr with Plan → Gate 3 after ADR acceptance, reusing the doc-reviewer loop and phase-gate pattern; wire or delete the orphaned persona TOMLs (agent-flow D4).

- [x] `P02.S04` - Extend the research_adr compiler with the Plan phase (plan-author role, doc-reviewer inner loop, phase-gate interrupt at Gate 3) and extend supported_capabilities with plan_document; `src/vaultspec_a2a/graph/`.
- [x] `P02.S05` - Adapt the orphaned vaultspec-planner persona to the vault Plan-document mandate and wire or delete vaultspec-reviewer and vaultspec-analyst in the same change; `src/vaultspec_a2a/team/presets/agents/`.
- [x] `P02.S06` - Test a full three-phase deterministic run parking at Gate 3 with a plan proposal, where approve completes and request_changes revises; `src/vaultspec_a2a/graph/tests/nodes/`.

### Phase `P03` - Clarification interrupt (a2a side)

The mid-run structured question: new interrupt node + authoritative disclosure + typed resume, sibling of the proven permissions-respond shape (agent-flow D5).

- [x] `P03.S07` - Add the clarification graph node raising interrupt() with the bounded payload (max 4 questions, choice or text kinds, required flags, capped strings), callable from Ground and Diverge; `src/vaultspec_a2a/graph/nodes/`.
- [x] `P03.S08` - Disclose the pending clarification (request id plus payload) on the run-status response and emit the clarification-pending relay frame; `src/vaultspec_a2a/api/`.
- [x] `P03.S09` - Add the POST clarification respond gateway route mapping answers to Command resume of the parked node, mirroring the permissions respond route; `src/vaultspec_a2a/api/routes/gateway.py`.
- [x] `P03.S10` - Test the park, disclose, respond, resume round trip over the real graph plus reload-recovery from status disclosure alone; `src/vaultspec_a2a/api/tests/`.
- [x] `P03.S40` - Consume the already-served presets-list profile summaries (id, display name, default flag, eligibility with reasons, per-role assignments carrying provider ids) in the frontend preset adapter and render the model picker from them, labeling mixed-provider profiles honestly and disabling ineligible ones with their served reasons; `frontend/src/stores/server/agent/a2aTeam.ts`.
- [x] `P03.S41` - Wire the clarification node into the research_adr topology as a pre-diverge ground decision point - the researcher role either emits a structured clarify sentinel (parking the run on the questionnaire) or proceeds to fan-out, with a deterministic-profile test forcing the ask; `src/vaultspec_a2a/graph/`.

### Phase `P04` - Clarification contract events (engine)

The three reviewed contract events crossing the frozen edge: verb whitelist, relay frame acceptance, boundary validation (agent-flow D5; edge ADR amendment discipline).

- [x] `P04.S11` - Add clarification-respond to the ops a2a verb whitelist with boundary-validated bounded args (run id, request id, answers keyed by question id); `engine/crates/vaultspec-api/src/routes/ops/a2a.rs`.
- [x] `P04.S12` - Accept and relay the clarification-pending frame kind within existing frame caps, with a conformance test that the relay stays non-authoritative; `engine/crates/vaultspec-api/src/routes/ops/a2a_stream.rs`.
- [x] `P04.S13` - Record the whitelist change as a reviewed contract event mutually referenced in both repos per the edge ADR consequence; `.vault/adr/2026-07-14-a2a-orchestration-edge-adr.md`.

### Phase `P05` - Center-slot rehome (frontend shell)

The {graph | agent} toggle: tri-state center slot, reserved __agent__ panel, 4th grid track deleted, every entry point re-routed, vocabulary retired (shell-integration D1).

- [x] `P05.S14` - Generalize graphVisible to the tri-state centerSlot (graph, agent, none) with migration of persisted layout state; `frontend/src/stores/view/shellLayout.ts`.
- [x] `P05.S15` - Add the reserved __agent__ panel reconciliation beside __graph__ and host the AgentPanel body in it; `frontend/src/app/stage/DockWorkspace.tsx`.
- [x] `P05.S16` - Replace the dock-header graph toggle with the segmented graph-or-agent switch plus the hide affordance; `frontend/src/app/stage/DockWorkspace.tsx`.
- [x] `P05.S17` - Delete the 4th grid track (agentPanelWidth, resize seam, agentPanelClassName) and re-route every entry point (AgentChip, keybinding, palette, background menu, comment bridge, Review chip) to the slot; `frontend/src/app/AppShell.tsx`.
- [x] `P05.S18` - Retire panel:approvals and Review-chip vocabulary into common:agent.* across the four catalog touch points; `frontend/src/localization/catalogAgentKeys.ts`.
- [x] `P05.S19` - Add reconciliation tests mirroring the graph panel: slot flips never re-parent the canvas, restore races pinned, chip fallback renders when the slot shows graph during a live run; `frontend/src/app/stage/`.

### Phase `P06` - Begin idiom and composer (frontend)

The empty-state composer with scope-named headline, evidence autocomplete, served-profile picker, autonomy banner, stop swap (shell-integration D2/D3).

- [x] `P06.S20` - Build the begin-idiom empty state (centered composer, scope-personalized headline, recents-yielding starter affordances) with the composer bottom-docked when a transcript exists; `frontend/src/app/agent/AgentPanel.tsx`.
- [x] `P06.S21` - Add @-evidence rel-path autocomplete riding the files-code and files-vault provider seam, feeding the existing mention-chip store; `frontend/src/app/agent/Composer.tsx`.
- [x] `P06.S22` - Codify the two-row left-right composer law and render the model pill from the served preset default profile, disabled with a reason when none is served (full served-profile-list consumption rides S40); `frontend/src/app/agent/Composer.tsx`.
- [x] `P06.S23` - Add the send-to-stop swap during streaming runs and the standing apply-automatically warning banner above the composer; `frontend/src/app/agent/Composer.tsx`.
- [x] `P06.S24` - Add render and unit tests for begin and continue posture, autocomplete provider scoping, and banner presence rules; `frontend/src/app/agent/`.

### Phase `P07` - Transcript C-rules conformance (frontend)

The conversation grammar: bubbles, one-disclosure work stretches, stat cards, docked run header, recap cards (shell-integration D4).

- [x] `P07.S25` - Render user turns as right-aligned accent bubbles and assistant turns as full-width open markdown; `frontend/src/app/agent/Transcript.tsx`.
- [x] `P07.S26` - Group tool calls and thinking under one collapsed elapsed-labeled disclosure per work stretch expanding to the flat icon-label timeline, preserving the inline permission prompt; `frontend/src/app/agent/ToolCallEntry.tsx`.
- [x] `P07.S27` - Add an aggregate and per-file diffstat to the proposal card, client-computed from the served proposal-detail bodies (the wire deliberately serves no diff), with terminal-right actions; `frontend/src/app/authoring/ReviewStation.tsx`.
- [x] `P07.S28` - Rehome run metadata (phase, roster with per-role model, sources, elapsed) into the collapsible docked run header region; `frontend/src/app/agent/TeamRunProgressContext.tsx`.
- [x] `P07.S29` - Add render tests over authored states for each C-rule surface; `frontend/src/app/agent/`.
- [x] `P07.S42` - Consume the already-served run-status roles, frozen profile id, and per-role assignments in the team-run adapter and complete the run-header roster with per-role model (sources stay honestly absent - genuinely unserved); `frontend/src/stores/server/agent/a2aTeam.ts`.

### Phase `P08` - Questionnaire surface (frontend)

ClarificationCard bound to the D5 payload: in-transcript answer surface, authoritative recovery, recap collapse (shell-integration D5).

- [x] `P08.S30` - Build ClarificationCard (choice buttons, bounded text inputs, required gating) rendered at the park point with the composer disabled with a hint; `frontend/src/app/agent/ClarificationCard.tsx`.
- [x] `P08.S31` - Wire clarification-respond through the a2a client and collapse the card into the C8 recap on success; `frontend/src/stores/server/agent/a2aTeam.ts`.
- [x] `P08.S32` - Re-render the pending questionnaire on reload from run-status disclosure alone with the relay frame acting only as a re-read nudge; `frontend/src/stores/server/liveAdapters/a2aRelay.ts`.

### Phase `P09` - Capability honesty gates (a2a)

Web research becomes real; providers earn their profiles; the two stitched end-to-end loops (agent-flow D6/D8).

- [x] `P09.S33` - Add the web-search and fetch MCP tool to the researcher and analyst harness with cited-evidence entry into the context package; `src/vaultspec_a2a/context/`.
- [x] `P09.S34` - Add live completed-turn tests for claude and kimi (spend-gated) admitting their profiles, with gemini, openai, and zhipu remaining unserved until theirs exist; `src/vaultspec_a2a/providers/tests/`.
- [x] `P09.S35` - Stitch the full cross-process verdict loop test (engine verdict, subscriber, worker HTTP, graph resume) and its clarification-loop sibling; `src/vaultspec_a2a/service_tests/`.

### Phase `P10` - Assembled verification and closeout

Live-drive both archetypes end-to-end in the assembled app, run every gate, record the follow-on debt.

- [ ] `P10.S36` - Live-drive Archetype A: open document, attach @-evidence, solo run, inline three-verdict review, applied change visible in the split, with screenshots persisted; `frontend/src/testing/`.
- [ ] `P10.S37` - Live-drive Archetype B: team run through research, clarification questionnaire answer, ADR proposal acceptance with one request_changes loop, plan proposal, with screenshots persisted; `frontend/src/testing/`.
- [x] `P10.S39` - Repair the dev-tooling scanner roots (localization, px, tokens, figma-names, module-size) and the justfile invocation path so every frontend gate command actually runs, grandfathering pre-existing module-size violators explicitly; `frontend/dev/tooling/`.
- [ ] `P10.S38` - Run full lint and live-wire gates in both repos and record Figma frame debt plus the compact read-only run-status affordance as named follow-ons; `frontend/package.json`.
- [ ] `P10.S43` - Amend the agent-flow ADR D3 with the serving-versus-eligibility reconciliation and the provider set actually witnessed completing turns in the live-drives; `.vault/adr/2026-08-01-a2a-agent-flow-adr.md`.
- [x] `P10.S44` - Amend the shell-integration ADR composer decision with the owner's feature-first mandate: document-authoring runs bind a first-class feature context chip on the composer, defaulted from the open document, required before run-start for tag-requiring presets; `.vault/adr/2026-08-01-agent-panel-shell-integration-adr.md`.
- [x] `P10.S45` - Collapse the autonomy control into a composer pill consistent with the row-of-pills grammar and the reference-verified C6 anatomy, fixing the row-2 overlap at split width; `frontend/src/app/agent/Composer.tsx`.
- [x] `P10.S50` - House main's unhoused degraded-intent in the begin idiom: the begin state must not invite a prompt when the data plane is degraded and starting would fail, using the parked common:agent.transcript.unavailable vocabulary; `frontend/src/app/agent/AgentBeginView.tsx`.

### Phase `P11` - Owner mandate: user-chosen providers

Cross-repository ripple from the owner's cornerstone ruling: presets carry role shape and personality only - never a provider; the user picks provider and model at team start; all providers must function through the harness. Supersedes the provider-baked preset lanes of the shipped v1.

- [x] `P11.S46` - Amend the agent-flow ADR: teams are provider-free (shape and personality only), the user chooses provider and model at team start, the free-form selection contract event is un-deferred and specified, test-variant presets stay pinned to the deterministic provider as harness infrastructure; `.vault/adr/2026-08-01-a2a-agent-flow-adr.md`.
- [ ] `P11.S47` - Implement and verify the provider-owned catalog, truthful health, required served run selection, frozen assignment, provider-free product presets, and legacy-run restart contract; `Y:/code/vaultspec-a2a-worktrees/main/.vault/plan/2026-08-02-provider-model-catalog-plan.md`.
- [ ] `P11.S48` - Carry opaque provider catalog and selection references through the engine boundary, validate only bounded structure and caps, and forbid hard-coded provider or model enums; `engine/crates/vaultspec-api/src/routes/ops/a2a.rs`.
- [ ] `P11.S49` - Replace the profile pill with the required served whole-team provider, model, and native-control chooser and preserve honest health and unselectable reasons; `frontend/src/app/agent/ComposerModelPicker.tsx, frontend/src/app/agent/Composer.tsx`.
- [ ] `P11.S51` - Adapt provider catalog, structured health, explicit selection, bounded overrides, fallbacks, and frozen assignment wire state without inventing identifiers or tiers; `frontend/src/stores/server/agent/a2aTeam.ts`.
- [ ] `P11.S52` - Add bounded per-role overrides and explicit served fallbacks and render the exact frozen assignment after run start; `frontend/src/app/agent/`.
- [ ] `P11.S53` - Prove one real provider catalog and selected model-control pair across frontend, engine, A2A prompt setup, run status, and restart and reconcile findings; `frontend/src/stores/server/agent/, engine/crates/vaultspec-api/, Y:/code/vaultspec-a2a-worktrees/main/src/vaultspec_a2a/service_tests/`.

## Parallelization

P01, P02, P03 are a2a-side and mutually independent; P04 gates only P08 (frontend clarification) and follows P03's shapes; P05 - P07 are frontend-parallel after P05.S14/S15 land; P09 rides independently; P10 is terminal.

## Verification
