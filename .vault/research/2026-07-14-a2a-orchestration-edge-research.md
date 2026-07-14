---
tags:
  - '#research'
  - '#a2a-orchestration-edge'
date: '2026-07-14'
modified: '2026-07-14'
related:
  - '[[2026-06-29-agentic-authoring-boundary-adr]]'
  - '[[2026-06-29-agentic-langgraph-integration-adr]]'
  - '[[2026-06-29-agentic-authoring-state-store-adr]]'
  - '[[2026-06-29-agentic-security-provenance-adr]]'
  - '[[2026-06-29-agentic-streaming-events-outbox-adr]]'
  - '[[2026-06-29-agentic-multiagent-composition-adr]]'
  - '[[2026-07-02-agentic-operation-modes-adr]]'
  - '[[2026-06-26-rag-service-management-adr]]'
  - '[[2026-06-14-dashboard-rag-manager-adr]]'
  - '[[2026-06-12-vaultspec-engine-adr]]'
---

# `a2a-orchestration-edge` research: `the stable dashboard surface the legacy A2A orchestrator builds against`

The dashboard has shipped the full agent-facing document-authoring plane
(propose → submit → approve → apply, ledgered, human-reviewed) but has no
framework that *runs* the Research → ADR → Plan → Exec → Audit pipeline as an
agentic workflow. The legacy `vaultspec-a2a` project (sibling repository,
`Y:/code/vaultspec-a2a-worktrees/main`) is a LangGraph orchestration backend
that runs exactly that pipeline — but writes `.vault/` documents directly
through agent file tools, which the dashboard contract forbids. This research
grounds the decision: revive A2A as a conforming sibling service, and freeze
the dashboard-side surface it builds against. The dashboard drives
requirements; A2A conforms.

## Findings

### 1. The accepted ADR corpus already decided the integration architecture

The 2026-06-29 `agentic-spec-authoring-backend` ADR cluster (17 records, all
accepted unless noted) pre-decided every load-bearing question this edge
raises. The new ADR codifies a cross-repo contract; it does not need to invent
architecture. Binding decisions, with their owning record:

- **Boundary** (`agentic-authoring-boundary-adr`): human and agent
  collaborators interact only with the fenced Rust authoring API; LangGraph
  agents connect "through an agent adapter that maps runs, thread ids,
  checkpoints, interrupts, tool calls, and token streams onto Vaultspec
  authoring objects." `vaultspec-core` stays hidden behind the internal
  materialization adapter. Rule: `agentic-authoring-api-is-backend-owned`.
- **Execution vs product state** (`agentic-langgraph-integration-adr`):
  LangGraph threads/runs/checkpoints/interrupts are execution primitives, not
  product history. Semantic tool kinds are already enumerated: read context,
  search graph, propose changeset, validate, request approval, cancel,
  request apply. All mutating commands carry idempotency keys because
  interrupts replay. Rule: `langgraph-is-execution-state-not-product-history`.
- **State ownership** (`agentic-authoring-state-store-adr`): "LangGraph
  should persist runnable agent state, interrupts, and checkpoints, but
  Vaultspec must own the durable review and document-change record."
  LangGraph references are provenance, never authority. This is precisely the
  A2A-owns-orchestration-state / engine-owns-document-state split.
- **Identity and approval** (`agentic-security-provenance-adr`): actor
  identity resolves only from a server-held principal seam (per-actor token →
  registered actor record via middleware; the wire envelope carries no actor
  field). Agents cannot self-approve — the ban is keyed on changeset ORIGIN,
  reused on the apply path. Every action lands in an append-only audit trail.
- **Write-path unity** (`agentic-operation-modes-adr`): one lifecycle
  (`proposed → approved → applying → applied`) in every mode; autonomy is a
  recorded approval-policy bundle with a system-actor approver, never a
  bypass arc.
- **Events** (`agentic-streaming-events-outbox-adr`): durable lifecycle
  events are replayable by sequence; token streams are bounded and droppable;
  event schemas are versioned "because ACP-style and LangGraph event shapes
  are not stable enough to persist directly." The stores layer owns replay
  cursors.
- **Multi-agent composition** (`agentic-multiagent-composition-adr`,
  **proposed**, demoted 2026-07-02 under review finding ASA-003): the
  work-unit/composition model "returns to acceptance when the walking
  skeleton produces multi-agent evidence (two real agents whose work must
  compose)." A2A team mode is exactly that evidence — this integration is the
  named return trigger. The new ADR must state whether it re-arms that record
  (recommended: yes, as a follow-on gate, not a prerequisite).
- **Deferral fences** (2026-07-11 `agentic-spec-authoring-backend` ADR):
  section-scoped proposal operations and the CreateDocument delete-inverse
  stay deferred behind explicit gates. A2A workers therefore author
  whole-document operations only; the edge contract must not assume
  sub-document proposal shapes.

### 2. The engine's shipped surface is the stable edge — it already exists

Confirmed live in `engine/crates/vaultspec-api/src/authoring/` (routes
mounted under `/authoring/v1/`, machine bearer + actor-token principal
gating, shared `tiers` envelope on every response including denials):

- Sessions and turns: `/v1/sessions`, `/v1/sessions/{id}`,
  `/v1/sessions/{id}/turns`.
- Proposal lifecycle: `/v1/proposals` (+ `{changeset_id}` `append`,
  `replace`, `submit`, `rebase`, `snapshot`, `conflicts`, `provenance`),
  `/v1/replacement-proposals`, `/v1/rollback-proposals`.
- Review and apply: `/v1/review-queue`, `/v1/review-claims` (+ `respond`,
  `release`), `/v1/reviews/{approval_id}/decisions`, `/v1/apply-requests`.
- Run control: `/v1/runs/{run_id}/resume`, `/v1/runs/{run_id}/cancel`,
  `/v1/interrupts/{interrupt_id}/resume`.
- **Agent tool plane**: `/v1/agent-tools` (served tool catalog),
  `/v1/agent-tools/prepare`,
  `/v1/agent-tools/{tool_call_id}/permission-decision`,
  `/v1/runs/{run_id}/agent-tools/execute`. The catalog advertises
  `propose_changeset` append/replace, and a mount test enforces
  advertise-only-what-runs.
- Identity: `/v1/actor-tokens` (issuance against registered actors).
- Concurrency and events: `/v1/leases` (+ `renew`, `release`), `/v1/events`
  (durable replay), `/v1/mode`, `/v1/recovery`.
- Enforcement is live: an agent hitting `/v1/direct-writes` receives a
  structured denial (`denial_kind: "forbidden_actor"`, "agents must propose
  changesets") with tiers — verified in `authoring/http_new/mod.rs` tests.

Implication: the engine needs **no new Rust for the document plane**. The
A2A-side work is replacing worker file-write tools with clients of this
surface. The only genuinely new engine work is the control plane (finding 4).

### 3. The A2A repository is substantial, current, and one seam away from conforming

Survey of `Y:/code/vaultspec-a2a-worktrees/main` (HEAD `7b2c5f3`,
2026-07-03; last substantive work 2026-04-06, merged PR #38):

- ~53k lines of Python (258 files, 58 test files, ruff/ty/pre-commit/CI),
  plus a ~14.8k-line React/Vite UI. Lockfile pins **current** deps:
  `langgraph 1.1.6`, `langchain-core 1.2.28`, `mcp 1.27.0`, `fastapi
  0.135.3` (`pyproject.toml` floors are stale; `uv.lock` is not).
- Architecture: FastAPI gateway + LangGraph worker services. Orchestration
  core: `src/vaultspec_a2a/graph/compiler.py` (three topologies: `star`
  supervisor routing, `pipeline`, `pipeline_loop` with `max_loops`),
  supervisor/worker/vault-reader nodes, persistent task queue
  (`graph/tools/task_queue.py`), retry classification, checkpointed durable
  state (SQLite default, Postgres option, 5 Alembic migrations).
- **The presets already encode our pipeline**: `team/presets/` maps roles to
  phases — researcher→research, analyst→adr, planner→plan, coder→exec,
  reviewer→audit — with phase-prerequisite gating (its ADR-023) and a
  read-only, token-budgeted `.vault/` context mount
  (`graph/nodes/vault_reader.py`, its ADR-020) that mounts ADRs first.
- Providers: coding CLIs (Claude/Gemini/Codex) driven as LangChain chat
  models over ACP (`@zed-industries/claude-agent-acp` — the only runtime npm
  dependency). No direct `anthropic`/`google-genai` SDK use.
- **The one conforming seam**: A2A never imports `vaultspec-core` at runtime;
  its coupling to the vault is filesystem convention. Reads go through the
  mount layer (read-only, portable — can stay). Writes are performed by the
  agents' own CLI file tools directly into `.vault/` — the exact behavior the
  engine denies as `forbidden_actor`. The write seam swap is the whole
  conformance job.
- Dead weight relative to the new shape: the React UI (this dashboard IS the
  frontend), and the "A2A" protocol branding (the Google A2A module is a
  3-line placeholder stub; real transports are ACP subprocess + REST/WS).

### 4. The control plane has an exact in-repo template: the rag sibling contract

The dashboard frontend may never call A2A directly — `frontend/src/stores/`
is the sole wire client and talks only to the engine (architecture-boundaries
rule; engine ADR D7.5: sibling operations transit the engine only as
transparent, whitelisted, namespaced pass-throughs). The rag precedent
supplies every pattern the ADR needs:

- **Namespaced verb whitelist** (`dashboard-rag-manager-adr`): `/ops/rag/
  {verb}` forwards a fixed whitelist verbatim, returns the sibling envelope
  plus the tiers degradation block, 502-with-tier-block when the sibling is
  down. Args are validated at the engine boundary (bounded enum/int, never
  free-form) — `rag-service-management-adr` D4.
- **Lifecycle: attach-never-own** (`rag-service-management-adr` D1–D3): one
  machine-global running predicate = discovery file + heartbeat freshness +
  ungated `/health` ready with live pid; gate any start on genuinely-absent;
  re-discover and ATTACH on already-running. A2A needs the same
  `service.json`-class discovery contract added (it has `just doctor` and
  health endpoints but no machine-global discovery file).
- **Bounded subprocess/HTTP**: every engine→sibling call carries output cap
  AND wall-clock timeout (resource-bounds rule); degradation is read from
  tiers, never guessed from transport errors.

The candidate whitelisted verb set for an `/ops/a2a/*` (or `/orchestration/*`)
namespace, derived from A2A's existing gateway surface: start run (team
preset + message + target feature tag), run/thread status, cancel, list
presets, health/service-state. Progress streaming can ride the engine's
existing multiplexed SSE `/stream` as a relayed channel (the `backends`
channel precedent) or be polled; the authoring plane's own `/v1/events`
already carries the document-lifecycle half durably.

### 5. Gaps the ADR must decide (nothing else is open)

- **D-candidate 1 — control-plane namespace and verb whitelist**: exact verb
  set, arg validation, envelope treatment, degradation tier. (Template:
  rag manager pillar-2 whitelist.)
- **D-candidate 2 — actor and token provisioning per run**: who registers
  the run's actors and issues tokens (`/v1/actor-tokens`), how tokens reach
  A2A workers (recommended: the engine-side "start run" verb provisions one
  actor per pipeline role and returns tokens in the brokered response, so
  provenance is rooted before the first agent turn; tokens are never minted
  A2A-side).
- **D-candidate 3 — progress streaming**: SSE relay channel vs bounded poll
  of run status; durable document events stay on `/authoring/v1/events`
  regardless.
- **D-candidate 4 — reads**: keep A2A's filesystem read-mount (read-only is
  compatible with engine read-and-infer) vs engine-served reads for
  in-flight changeset visibility. Recommended: filesystem mounts stay for
  corpus context; proposal/changeset state is read from the authoring API.
- **D-candidate 5 — state ownership fence**: A2A owns orchestration state
  (threads, checkpoints, task queue, its own DB); the engine owns all
  document state (changesets, approvals, preimages, audit). A2A must not
  grow a second document ledger. (Restates the state-store ADR as a
  cross-repo fence.)
- **D-candidate 6 — scaffolding**: new documents are created through the
  ledgered create path (whole-document operations only, per the 2026-07-11
  deferral ADR); A2A agents never hand-write frontmatter or filenames.
- **D-candidate 7 — A2A repo mandates** (feeds the dev-team brief): delete
  the React UI and all frontend ambition; headless service driven by its CLI
  and the engine pass-through; drop the aspirational Google-A2A branding or
  keep the name as a label only; adopt the discovery/heartbeat contract;
  keep graph compiler, presets, task queue, providers, thread/context
  packages as the reusable core.
- **D-candidate 8 — composition re-arm**: whether this integration re-arms
  the proposed `agentic-multiagent-composition-adr` (its stated return
  trigger). Recommended: yes, as a follow-on gate once two-agent runs exist.

### 6. Options weighed

- **Revive A2A as a conforming sibling service (RECOMMENDED).** The
  orchestration core is real, current, tested engineering that already
  encodes the pipeline roles; the corpus already reserved its place (agent
  adapter, LangGraph-as-execution-state). Cost: the write-seam swap, the
  discovery contract, UI deletion — all A2A-side; one bounded pass-through
  in Rust.
- **Rebuild orchestration inside the dashboard engine.** Rejected: the
  engine is read-and-infer plus the fenced authoring domain; a LangGraph
  runtime is Python; this would re-create ~50k lines and violate the
  boundary ADR's "sibling service" shape for agent runtimes.
- **Fresh thin Python orchestrator, cherry-picking A2A code.** Viable
  fallback if the A2A team finds the repo's operational surface (compose
  files, bundled runtime, gateway/worker split) too heavy, but starts by
  discarding maintained tests and presets; not preferred while the core
  packages lift cleanly.

## Sources

- Engine routes and denial behavior:
  `engine/crates/vaultspec-api/src/authoring/http/handlers2.rs`,
  `engine/crates/vaultspec-api/src/authoring/http_new/mod.rs` (tests:
  `forbidden_actor` denial, tool-catalog mount, self-approval origin ban),
  `engine/crates/vaultspec-api/src/lib.rs` (mount smoke, W12.P22 fold-in),
  `engine/crates/vaultspec-api/src/authoring/tools.rs`,
  `engine/crates/vaultspec-api/src/authoring/approvals.rs`.
- A2A repository at commit `7b2c5f3` (2026-07-03):
  `src/vaultspec_a2a/graph/compiler.py`,
  `src/vaultspec_a2a/graph/nodes/vault_reader.py`,
  `src/vaultspec_a2a/graph/tools/task_queue.py`,
  `src/vaultspec_a2a/team/team_config.py` + `team/presets/`,
  `src/vaultspec_a2a/providers/`, `uv.lock` (langgraph 1.1.6,
  langchain-core 1.2.28, mcp 1.27.0), 41 ADRs / 13 plans in its own
  `.vault/`.
- Governing dashboard ADRs: listed in `related:` frontmatter.
