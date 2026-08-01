---
generated: true
tags:
  - '#index'
  - '#agent-panel'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:aa304ec805c45e7664334e4e62b5dc2494a303c40feb14049f7edcbe87f9ce67'
related:
  - '[[2026-07-31-agent-panel-ux-research]]'
  - '[[2026-08-01-a2a-agent-flow-adr]]'
  - '[[2026-08-01-agent-panel-P01-S01]]'
  - '[[2026-08-01-agent-panel-P01-S02]]'
  - '[[2026-08-01-agent-panel-P01-S03]]'
  - '[[2026-08-01-agent-panel-P02-S04]]'
  - '[[2026-08-01-agent-panel-P02-S05]]'
  - '[[2026-08-01-agent-panel-P02-S06]]'
  - '[[2026-08-01-agent-panel-P03-S07]]'
  - '[[2026-08-01-agent-panel-P03-S08]]'
  - '[[2026-08-01-agent-panel-P03-S09]]'
  - '[[2026-08-01-agent-panel-P03-S10]]'
  - '[[2026-08-01-agent-panel-P03-S40]]'
  - '[[2026-08-01-agent-panel-P03-S41]]'
  - '[[2026-08-01-agent-panel-P04-S11]]'
  - '[[2026-08-01-agent-panel-P04-S12]]'
  - '[[2026-08-01-agent-panel-P04-S13]]'
  - '[[2026-08-01-agent-panel-P05-S14]]'
  - '[[2026-08-01-agent-panel-P05-S15]]'
  - '[[2026-08-01-agent-panel-P05-S16]]'
  - '[[2026-08-01-agent-panel-P05-S17]]'
  - '[[2026-08-01-agent-panel-P05-S18]]'
  - '[[2026-08-01-agent-panel-P05-S19]]'
  - '[[2026-08-01-agent-panel-P06-S20]]'
  - '[[2026-08-01-agent-panel-P06-S21]]'
  - '[[2026-08-01-agent-panel-P06-S22]]'
  - '[[2026-08-01-agent-panel-P06-S23]]'
  - '[[2026-08-01-agent-panel-P06-S24]]'
  - '[[2026-08-01-agent-panel-P07-S25]]'
  - '[[2026-08-01-agent-panel-P07-S26]]'
  - '[[2026-08-01-agent-panel-P07-S27]]'
  - '[[2026-08-01-agent-panel-P07-S28]]'
  - '[[2026-08-01-agent-panel-P07-S29]]'
  - '[[2026-08-01-agent-panel-P07-S42]]'
  - '[[2026-08-01-agent-panel-P08-S30]]'
  - '[[2026-08-01-agent-panel-P08-S31]]'
  - '[[2026-08-01-agent-panel-P08-S32]]'
  - '[[2026-08-01-agent-panel-P09-S33]]'
  - '[[2026-08-01-agent-panel-P09-S34]]'
  - '[[2026-08-01-agent-panel-P09-S35]]'
  - '[[2026-08-01-agent-panel-P10-S39]]'
  - '[[2026-08-01-agent-panel-dead-capability-audit]]'
  - '[[2026-08-01-agent-panel-plan]]'
  - '[[2026-08-01-agent-panel-shell-integration-adr]]'
---

# `agent-panel` feature index

Auto-generated index of all documents tagged with `#agent-panel`.

## Documents

### adr

- `2026-08-01-a2a-agent-flow-adr` - `a2a-agent-flow` adr: `the agent and team topology a2a must serve so the AgentPanel can route real user queries` | (**status:** `accepted`)
- `2026-08-01-agent-panel-shell-integration-adr` - `agent-panel-shell-integration` adr: `the agent panel becomes the graph's center-slot alternate — one toggle, one canonical home, the convergent composer and conversation grammar` | (**status:** `accepted`)

### audit

- `2026-08-01-agent-panel-dead-capability-audit` - `agent-panel` audit: `dead capability`

### exec

- `2026-08-01-agent-panel-P01-S01` - Add the vaultspec-doc-editor persona TOML (document-editing mandate, rag read context, authoring-bridge tools only, filesystem_write off)
- `2026-08-01-agent-panel-P01-S02` - Add the solo doc-editor team preset (pipeline topology, one worker, authoring_bridge on, served model profiles limited to live-proven providers)
- `2026-08-01-agent-panel-P01-S03` - Test the preset structurally: it compiles with the correct single worker and the shape pins the D2 divergence and D3 provider constraints - the generic propose and request-changes bridge machinery is already covered by existing dispatch tests and the live doc-editor proof rides P10
- `2026-08-01-agent-panel-P02-S04` - Extend the research_adr compiler with the Plan phase (plan-author role, doc-reviewer inner loop, phase-gate interrupt at Gate 3) and extend supported_capabilities with plan_document
- `2026-08-01-agent-panel-P02-S05` - Adapt the orphaned vaultspec-planner persona to the vault Plan-document mandate and wire or delete vaultspec-reviewer and vaultspec-analyst in the same change
- `2026-08-01-agent-panel-P02-S06` - Test a full three-phase deterministic run parking at Gate 3 with a plan proposal, where approve completes and request_changes revises
- `2026-08-01-agent-panel-P03-S07` - Add the clarification graph node raising interrupt() with the bounded payload (max 4 questions, choice or text kinds, required flags, capped strings), callable from Ground and Diverge
- `2026-08-01-agent-panel-P03-S08` - Disclose the pending clarification (request id plus payload) on the run-status response and emit the clarification-pending relay frame
- `2026-08-01-agent-panel-P03-S09` - Add the POST clarification respond gateway route mapping answers to Command resume of the parked node, mirroring the permissions respond route
- `2026-08-01-agent-panel-P03-S10` - Test the park, disclose, respond, resume round trip over the real graph plus reload-recovery from status disclosure alone
- `2026-08-01-agent-panel-P03-S40` - Consume the already-served presets-list profile summaries (id, display name, default flag, eligibility with reasons, per-role assignments carrying provider ids) in the frontend preset adapter and render the model picker from them, labeling mixed-provider profiles honestly and disabling ineligible ones with their served reasons
- `2026-08-01-agent-panel-P03-S41` - Wire the clarification node into the research_adr topology as a pre-diverge ground decision point - the researcher role either emits a structured clarify sentinel (parking the run on the questionnaire) or proceeds to fan-out, with a deterministic-profile test forcing the ask
- `2026-08-01-agent-panel-P04-S11` - Add clarification-respond to the ops a2a verb whitelist with boundary-validated bounded args (run id, request id, answers keyed by question id)
- `2026-08-01-agent-panel-P04-S12` - Accept and relay the clarification-pending frame kind within existing frame caps, with a conformance test that the relay stays non-authoritative
- `2026-08-01-agent-panel-P04-S13` - Record the whitelist change as a reviewed contract event mutually referenced in both repos per the edge ADR consequence
- `2026-08-01-agent-panel-P05-S14` - Generalize graphVisible to the tri-state centerSlot (graph, agent, none) with migration of persisted layout state
- `2026-08-01-agent-panel-P05-S15` - Add the reserved __agent__ panel reconciliation beside __graph__ and host the AgentPanel body in it
- `2026-08-01-agent-panel-P05-S16` - Replace the dock-header graph toggle with the segmented graph-or-agent switch plus the hide affordance
- `2026-08-01-agent-panel-P05-S17` - Delete the 4th grid track (agentPanelWidth, resize seam, agentPanelClassName) and re-route every entry point (AgentChip, keybinding, palette, background menu, comment bridge, Review chip) to the slot
- `2026-08-01-agent-panel-P05-S18` - Retire panel:approvals and Review-chip vocabulary into common:agent.* across the four catalog touch points
- `2026-08-01-agent-panel-P05-S19` - Add reconciliation tests mirroring the graph panel: slot flips never re-parent the canvas, restore races pinned, chip fallback renders when the slot shows graph during a live run
- `2026-08-01-agent-panel-P06-S20` - Build the begin-idiom empty state (centered composer, scope-personalized headline, recents-yielding starter affordances) with the composer bottom-docked when a transcript exists
- `2026-08-01-agent-panel-P06-S21` - Add @-evidence rel-path autocomplete riding the files-code and files-vault provider seam, feeding the existing mention-chip store
- `2026-08-01-agent-panel-P06-S22` - Codify the two-row left-right composer law and render the model pill from the served preset default profile, disabled with a reason when none is served (full served-profile-list consumption rides S40)
- `2026-08-01-agent-panel-P06-S23` - Add the send-to-stop swap during streaming runs and the standing apply-automatically warning banner above the composer
- `2026-08-01-agent-panel-P06-S24` - Add render and unit tests for begin and continue posture, autocomplete provider scoping, and banner presence rules
- `2026-08-01-agent-panel-P07-S25` - Render user turns as right-aligned accent bubbles and assistant turns as full-width open markdown
- `2026-08-01-agent-panel-P07-S26` - Group tool calls and thinking under one collapsed elapsed-labeled disclosure per work stretch expanding to the flat icon-label timeline, preserving the inline permission prompt
- `2026-08-01-agent-panel-P07-S27` - Add an aggregate and per-file diffstat to the proposal card, client-computed from the served proposal-detail bodies (the wire deliberately serves no diff), with terminal-right actions
- `2026-08-01-agent-panel-P07-S28` - Rehome run metadata (phase, roster with per-role model, sources, elapsed) into the collapsible docked run header region
- `2026-08-01-agent-panel-P07-S29` - Add render tests over authored states for each C-rule surface
- `2026-08-01-agent-panel-P07-S42` - Consume the already-served run-status roles, frozen profile id, and per-role assignments in the team-run adapter and complete the run-header roster with per-role model (sources stay honestly absent - genuinely unserved)
- `2026-08-01-agent-panel-P08-S30` - Build ClarificationCard (choice buttons, bounded text inputs, required gating) rendered at the park point with the composer disabled with a hint
- `2026-08-01-agent-panel-P08-S31` - Wire clarification-respond through the a2a client and collapse the card into the C8 recap on success
- `2026-08-01-agent-panel-P08-S32` - Re-render the pending questionnaire on reload from run-status disclosure alone with the relay frame acting only as a re-read nudge
- `2026-08-01-agent-panel-P09-S33` - Add the web-search and fetch MCP tool to the researcher and analyst harness with cited-evidence entry into the context package
- `2026-08-01-agent-panel-P09-S34` - Add live completed-turn tests for claude and kimi (spend-gated) admitting their profiles, with gemini, openai, and zhipu remaining unserved until theirs exist
- `2026-08-01-agent-panel-P09-S35` - Stitch the full cross-process verdict loop test (engine verdict, subscriber, worker HTTP, graph resume) and its clarification-loop sibling
- `2026-08-01-agent-panel-P10-S39` - Repair the dev-tooling scanner roots (localization, px, tokens, figma-names, module-size) and the justfile invocation path so every frontend gate command actually runs, grandfathering pre-existing module-size violators explicitly

### plan

- `2026-08-01-agent-panel-plan` - `agent-panel` plan

### research

- `2026-07-31-agent-panel-ux-research` - `agent-panel` research: `opening-surface convergence of agentic products and the UX grammar binding a canonical AgentPanel`
