---
tags:
  - '#adr'
  - '#a2a-agent-flow'
date: '2026-08-01'
related:
  - '[[2026-07-31-agent-panel-ux-research]]'
  - '[[2026-07-14-a2a-orchestration-edge-adr]]'
  - '[[2026-07-19-review-surface-flow-adr]]'
  - '[[2026-07-02-agentic-operation-modes-adr]]'
  - '[[2026-07-31-a2a-integration-verification-adr]]'
  - '[[2026-08-01-agent-panel-shell-integration-adr]]'
---

# `a2a-agent-flow` adr: `the agent and team topology a2a must serve so the AgentPanel can route real user queries` | (**status:** `accepted`)

## Problem Statement

The AgentPanel forwards a user's natural-language query to a team or a
single agent, with the user choosing model, provider, and team at the
composer. The frozen cross-repo edge ([[2026-07-14-a2a-orchestration-edge-adr]]
D1–D8) fixes HOW the dashboard reaches a2a; nothing yet fixes WHAT a2a
serves when the query arrives. A source-verified inventory (2026-08-01,
read-only, both repos) establishes an honest baseline: a2a is NOT a stub at
the orchestration layer — the gateway (staged run-start with admission,
idempotency, model-profile freeze, actor binding; status; per-run SSE;
cancel; presets; deep service readiness), all four graph topologies
(`star`, `pipeline`, `pipeline_loop`, `research_adr`), real LangGraph
`interrupt()` gates (tool permission, plan approval, document verdict), a
live verdict subscriber of the engine's `/authoring/v1/events` outbox with
resume-by-`Command`, DB-backed queue + checkpointing proven across
crash-reboot, and a real authoring-API write seam are all implemented and
tested. What IS stub or absent is precisely what the two user-query
archetypes need: no solo document-editing preset, no Plan-authoring phase
(capabilities hardcoded to research + ADR only), no web-search tool behind
the researcher persona's "online research" prose, no way to ask the user a
structured question mid-run, and per-run model choice limited to a preset's
pre-declared profile ids. Three persona TOMLs (`vaultspec-planner`,
`vaultspec-reviewer`, `vaultspec-analyst`) exist wired into zero presets.
This record decides the topology, routing, and the minimal new contract
events; the fine details of LangGraph team setup are subject to this
review, per the owner's mandate.

## Considerations

- The two archetypes the panel must serve, verbatim from the owner:
  (A) "refine the research, consider latest fact" — single-document
  natural-language modification; one agent, user-selected model/provider,
  no team. (B) "create a plan to implement a new feature to add a
  right-side monitor panel" — online research and grounding, structured
  questions to the user mid-run, autonomous ADR authoring, user acceptance
  with revision loops, then a plan document.
- Everything archetype B needs EXCEPT questions, web search, and the plan
  phase is already proven in `research_adr`: N-way researcher fan-out
  (`Send`), synthesist, adr-author, doc-reviewer inner quality loop, two
  phase gates whose `request_changes` verdict genuinely loops the writer
  into revision (`graph/tests/nodes/test_phase_gate.py` proves
  resume-by-`Command` against the real graph).
- The wire already carries model selection: `TeamRunStartPayload.profile_id`
  flows dashboard → engine → a2a today, and a2a resolves, freezes, and
  discloses the per-role assignment (`model_profiles.py` precedence:
  profile > worker override > agent TOML > team defaults). `RunStartRequest`
  is `extra="forbid"` — free-form provider/model fields do not exist.
- Provider reality, precisely: only **Codex** and **Z.ai** (the latter
  credential-gated on `ZAI_AUTH_TOKEN`) have live tests that complete a
  real turn. Claude and Kimi prove only a live pre-auth ACP *handshake*
  (their live tests deliberately reap the subprocess before any prompt —
  "no agent work and no spend"); Gemini/OpenAI/Zhipu construct but have
  zero live coverage of any kind. A composer that offers a provider must
  not offer one the backend has never completed a turn with.
- The only human-in-the-loop shapes in a2a are fixed-option approvals
  (tool permission, plan approval, document verdict). A generic
  clarification-question primitive is absent repo-wide. The engine's own
  `InterruptKind` pattern (`authoring/interrupts.rs`, ToolPermission-only)
  is precedent but lives in the engine's native run-identity space, not
  a2a's `/v1/runs` thread space.
- Edge D7(b) ("replace agent file-write tools with authoring-API clients")
  is PARTIALLY realized: `.vault/**` writes are denied at the ACP
  filesystem seam (`_targets_vault`), but `vaultspec-coder` /
  `vaultspec-planner` retain `filesystem_write=true` for ordinary paths —
  the ban is vault-scoped, not universal. This is surfaced as a scope
  question, not silently accepted.
- New preset ids surface automatically through the existing `presets-list`
  verb — presets are NOT contract events. New verbs, new run-start fields,
  and new relay frame kinds ARE (edge consequence: "any change to the edge
  is a reviewed contract event — never a refactor").

## Considered options

- **Route by intent classification (a2a or engine guesses solo vs team
  from the prompt).** Rejected: adds an unaccountable inference layer in
  front of a frozen edge; misclassification silently spends a team run on
  a one-line edit or starves a feature request of research. The user's
  explicit selection is already the composer grammar
  ([[2026-07-31-agent-panel-ux-research]] G5/G6).
- **Route by explicit preset selection at the composer (CHOSEN).** The
  team/agent selector IS the router: presets are served (`presets-list`),
  the user picks solo or pipeline, defaulting sensibly by context
  (document open → solo editor; no target document → team).
- **Questionnaire over the existing `POST /v1/runs/{id}/messages`
  follow-up route.** Rejected: that route starts a fresh turn, not a typed
  interrupt-resume; answers would re-enter as prose, losing the structured
  resume the checkpointed `interrupt()` provides, and the pending question
  would be invisible to `run-status` recovery.
- **Questionnaire as a new interrupt node + minimal new contract events
  (CHOSEN).** Mirrors the proven `phase_gate.py` pattern; one new resume
  verb plus disclosure on the existing status/relay surfaces.
- **Free-form per-run model/provider override at the composer.** Deferred:
  requires a new highest-precedence layer in the resolution chain plus new
  `run-start` fields (a contract event) and invites offering providers
  with zero live coverage. Named profiles per preset cover both archetypes
  today with zero wire change.
- **Author plans via a new separate pipeline preset.** Rejected in favor of
  extending `research_adr` with a third phase: the plan must be grounded in
  the research and ADR the same run produced, the doc-reviewer inner loop
  and phase-gate machinery are reused verbatim, and the run's provenance
  chain (research → ADR → plan under one thread) stays intact.

## Constraints

- The frozen edge holds: frontend reaches a2a only via `/ops/a2a/*`;
  documents come into existence only through the ledgered authoring path;
  actor tokens are engine-minted per role at run start; the relay stays
  non-authoritative (D3) — every new frame kind inherits that discipline.
- LangGraph `interrupt()`/`Command(resume=...)` with the checkpointer is
  the only pause/resume mechanism; the clarification node must not invent
  a side channel.
- The engine validates all pass-through args at the boundary (bounded
  enums, capped strings); every new field and verb below inherits that.
- Preset capability declarations (`supported_capabilities()`) are the
  served truth the dashboard renders; extending a topology extends that
  declaration in the same change.

## Implementation

**D1 — Routing is explicit preset selection; the composer is the router.**
The panel's team/agent selector lists served presets (`presets-list`,
unchanged). Solo vs team is never inferred from prompt text. Default
selection is contextual: a document open in the dock defaults the selector
to the solo editor preset with that document as target; an empty dock
defaults to the team pipeline. The selection, the frozen profile, and the
target feature tag ride the existing `run-start` args.

**D2 — Archetype A ships as a new solo preset, `vaultspec-doc-editor`.**
Shape cloned from `vaultspec-solo-coder` (pipeline topology, one worker,
`authoring_bridge=true` — engine MCP propose/read tools), with one
deliberate divergence from the clone source: solo-coder's worker carries
`filesystem_write=true` today, and the doc-editor worker does NOT (per
D7); persona is a new document-editing mandate (read the target document
and its corpus context via rag, apply the user's natural-language
instruction as ONE whole-document proposal, honor `request_changes`
revisions). The human reviews through the existing three-verdict lane —
no new review surface, no new wire.

**D3 — Model/provider selection is named-profile selection, v1.** Each
panel-exposed preset declares a bounded set of named model profiles (as
`vaultspec-adr-research` already does for its codex/zai/kimi lanes); the
composer's model picker renders exactly the served profile list and sends
the chosen `profile_id` on the existing `run-start` field. Only providers
with a live COMPLETED-TURN test may appear in a served profile — today
that is codex and zai (zai credential-gated); claude and kimi join the
moment D8(a)'s spend-gated full-turn tests pass (their live handshake
proof is deliberately NOT accepted as sufficient — the strict rule is
kept over convenience), and gemini/openai/zhipu likewise. Free-form
per-run override is a NAMED FUTURE contract event (new precedence layer +
new `run-start` field), deliberately not bundled here.

**D4 — Archetype B extends `research_adr` with a third phase: Plan.**
After Gate 2 (ADR accepted), the run proceeds Ground → Diverge →
Synthesize → Gate 1 → Decide → Gate 2 → **Plan → Gate 3**: a
plan-author role (persona adapted from the orphaned `vaultspec-planner`
TOML, re-mandated for vault Plan documents against the in-run research and
ADR) drafts the plan document through the same doc-reviewer inner loop,
submits through the same authoring path, and parks on the same phase-gate
`interrupt()` for the three-verdict decision. `supported_capabilities()`
extends to `{research_document, architecture_decision, plan_document}`;
the harness's existing plan template scaffolding
(`DEFAULT_REQUIRED_TEMPLATES`) is finally exercised. The orphaned
`vaultspec-reviewer`/`vaultspec-analyst` TOMLs are either wired or
deleted in the same change — no dead configs (`no-deprecation-bridges`).

**D5 — Mid-run clarification is a new interrupt node plus the minimal new
contract surface.** a2a-side: a `clarification` graph node callable from
the Ground/Diverge stages raises `interrupt()` with a bounded payload —
`{type: "clarification_request", questions: [{id, prompt, kind:
"choice"|"text", options?, required}]}` (caps: ≤4 questions per request,
≤4 options per choice, capped strings) — the same proven pattern as
`phase_gate.py:211`. Cross-repo contract events, named and bounded:

- (a) `run-status` response discloses a pending clarification (question
  payload + request id) so recovery after reload re-renders the
  questionnaire from authoritative state;
- (b) one new relay frame kind, `clarification-pending`, non-authoritative
  per D3 discipline (a nudge to re-read `run-status`, never the source of
  the questions);
- (c) one new pass-through verb, `clarification-respond` (run id, request
  id, answers keyed by question id; boundary-validated), which a2a maps to
  the typed `Command(resume=...)` of the parked node — the exact shape the
  existing `POST /v1/runs/{id}/permissions/{request_id}/respond` route
  already implements for tool-permission interrupts (a gateway-dispatched
  resume independent of the verdict-subscriber path), so the a2a side is a
  sibling of proven code, not a new mechanism. The follow-up `messages`
  route is explicitly NOT the answer path.

These three are the ONLY additions to the frozen edge this ADR makes.

**D6 — The researcher gets a real web tool.** A web-search/fetch MCP
server joins the researcher/analyst harness through the existing
`mcp_servers` declaration mechanism (no wire change). Results enter the
run as cited evidence in the context package, never as silent prose;
tool choice and rate bounds are a2a-side implementation detail, but the
capability claim in the personas stops being unbacked. Until this lands,
served preset descriptions must not claim online research.

**D7 — File-write scope ruling.** For every panel-exposed preset in this
ADR (doc-editor, research_adr+plan), `filesystem_write` is OFF —
documents move only through the authoring bridge, uniformly, making edge
D7(b) universal for the document pipeline. The vault-scoped-only ban
(non-`.vault` writes allowed) remains ONLY for coder-lane presets, which
are NOT exposed in the panel's v1 preset list; widening the coder lane
into the panel is a future decision that must argue its own case.

**D8 — Hardening gates ride the plan, not the critical path.** (a) Live
completed-turn tests before a provider's profiles are served (D3's
admission rule): claude and kimi first (spend-gated; their live handshake
coverage already exists), then gemini/openai/zhipu (no live coverage of
any kind today); (b) one stitched end-to-end test of the full
cross-process verdict loop (engine verdict → subscriber → worker HTTP →
actual graph resume) — today proven only as two independently-live
halves; (c) the same stitched shape for the new clarification loop.
These gate PROFILE and PRESET exposure, not the panel shipping.

## Rationale

The inventory shows the expensive machinery — topologies, gates, verdict
subscription, checkpointed resume, the write seam — already real and
tested; every decision above spends effort only where capability is
genuinely absent. Routing by explicit selection keeps the frozen edge free
of inference and matches the composer grammar the UX research derived from
four shipping products. The clarification primitive is the one place a new
wire surface is unavoidable (a paused question must survive reload, which
only authoritative `run-status` disclosure provides), so it is cut to the
minimum: one verb, one frame kind, one response-field extension, all
bounded, all named here as reviewed contract events. Extending
`research_adr` rather than minting a sibling preset keeps one run's
research, ADR, and plan in one provenance chain — which is the entire
point of the pipeline.

## Consequences

- The AgentPanel can serve both archetypes with four a2a-side additions
  (doc-editor preset, Plan phase, clarification node, web tool) and three
  bounded contract events (status disclosure, relay frame,
  `clarification-respond` verb). Everything else is reuse.
- The composer's model picker is honest by construction: it renders served
  profiles only, and profiles admit only live-proven providers.
- The clarification surface gives the dashboard its first structured
  question-rendering obligation — the questionnaire UI decided in
  [[2026-08-01-agent-panel-shell-integration-adr]] binds to exactly the
  D5 payload shape.
- Two repos change in lockstep for D5; per the edge ADR, the verb
  whitelist change is documented once and mutually referenced, and lands
  engine-side gated until a2a serves the interrupt.
- The orphaned persona TOMLs stop being silent debt: wired or deleted.
- Risk: the Plan phase lengthens the pipeline run; the phase-gate pattern
  bounds it (a parked run costs nothing), but preset descriptions must set
  duration expectations honestly.
- Risk: `interrupt()`-heavy runs put more weight on checkpointer
  correctness across restarts; the reconciliation tests already pin this,
  and D8(c) adds the clarification-specific stitch.

## Codification candidates

- **Rule slug:** `served-presets-are-the-router`.
  **Rule:** Solo-vs-team routing is the user's explicit preset selection
  at the composer; no layer infers topology from prompt text, and the
  composer offers only served presets and served model profiles.
- **Rule slug:** `no-unproven-providers-in-served-profiles`.
  **Rule:** A model profile may name a provider only after a live-service
  test has completed a real turn with it; construction-only coverage does
  not qualify.
- **Rule slug:** `clarifications-are-typed-interrupts`.
  **Rule:** A question to the user pauses the run via checkpointed
  `interrupt()` with a bounded typed payload, is disclosed authoritatively
  on `run-status`, and resumes only through the typed respond verb — never
  through follow-up message turns.
