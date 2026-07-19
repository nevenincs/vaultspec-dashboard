---
tags:
  - '#reference'
  - '#a2a-orchestration-edge'
date: '2026-07-14'
modified: '2026-07-19'
related:
  - "[[2026-07-14-a2a-orchestration-edge-adr]]"
  - '[[2026-07-14-a2a-orchestration-edge-research]]'
---

# `a2a-orchestration-edge` reference: `dev-team brief for the vaultspec-a2a revival`

This is the implementation brief for the team reviving the `vaultspec-a2a`
repository (`Y:/code/vaultspec-a2a-worktrees/main`). It is derived from the
accepted edge ADR (D1–D8) and is the working contract: the dashboard engine's
surface is FROZEN; A2A conforms to it. Any change to the edge is a reviewed
cross-repo contract event, never a refactor. Consult the ADR for the why; this
brief is the what and where.

## Summary

### The one-paragraph mission

Turn `vaultspec-a2a` into a headless orchestration sibling of the dashboard
engine. Your LangGraph teams keep doing what they do — run the
Research → ADR → Plan → Exec → Audit pipeline over team presets — but every
document your agents produce becomes a proposed changeset on the engine's
authoring API, reviewed and applied by a human in the dashboard. You never
write a `.vault/` file again. You are fronted by the engine: the dashboard
frontend never calls you; the engine forwards a small whitelisted verb set to
your gateway.

### Mandates (non-negotiable, from ADR D7)

- **Delete the frontend.** Remove `src/ui/` (React/Vite, ~14.8k lines) and
  every UI-serving route, build step, and dev dependency that exists for it.
  A2A is headless: its surfaces are its CLI, its gateway REST/SSE for the
  engine, and its health endpoints. No new UI ambition of any kind.
- **Delete the Google-A2A protocol stub** (`src/vaultspec_a2a/protocols/a2a/`,
  a placeholder). The project name survives as a label only; declared
  transports are ACP (agent subprocesses) and REST/SSE (engine-facing).
- **No vault writes, ever.** Remove/disable every file-write tool an agent
  can point at any `.vault/` path. The engine denies agent direct writes
  (`forbidden_actor`); your conformance is that agents no longer even try.
- **No cross-imports.** The engine never appears in your dependency graph and
  you never appear in the engine's. The edge is loopback HTTP only.
- **Preserve the core.** `graph/` (compiler, nodes, task queue), `team/`
  (presets, role→phase gating), `providers/` (ACP chat-model stack),
  `thread/`, `context/` stay. The gateway/worker split may be simplified but
  is not required to change.

### Workstream 1 — the write-seam swap (the substance of the revival)

Replace agent file-write capability with clients of the engine's authoring
API, mounted at `/authoring/v1/` on the engine origin (loopback), machine
bearer + per-actor token auth, every response in the shared envelope with a
`tiers` block:

- Sessions: create an `authoring_session` per run
  (`/v1/sessions`, `/v1/sessions/{id}/turns`); associate your LangGraph
  `thread_id`/`run_id`s with it and store the Vaultspec ids in your thread
  state as references.
- Proposals: draft and grow changesets via `/v1/proposals` and
  `/v1/proposals/{changeset_id}/append|replace`; move to review with
  `/v1/proposals/{changeset_id}/submit`; inspect via `snapshot`, `conflicts`,
  `provenance`; rebase with `rebase`.
- The served tool plane: `/v1/agent-tools` is the engine's tool catalog
  (advertise-only-what-runs); `prepare`, `{tool_call_id}/permission-decision`,
  and `/v1/runs/{run_id}/agent-tools/execute` are the execution path. Prefer
  binding your worker tools to this catalog over hand-rolling request
  builders — the catalog is versioned with the engine.
- Interrupts/resume: `/v1/runs/{run_id}/resume`, `/v1/runs/{run_id}/cancel`,
  `/v1/interrupts/{interrupt_id}/resume` — resume by interrupt id, never
  positional order.
- Idempotency: every mutating command carries an idempotency key (LangGraph
  interrupt replay re-runs the interrupted node; the engine deduplicates on
  the key). Derive keys from stable run-local material, never timestamps.
- Whole-document operations only. Section-scoped operations are deferred
  engine-side; do not build against sub-document shapes. New documents are
  proposed as whole-document creations — the engine scaffolds/validates
  frontmatter and filenames through its internal core adapter; your agents
  never author frontmatter, filenames, or templates.
- Approval is not yours: agents cannot approve or apply their own proposals
  (origin-keyed ban, enforced engine-side). Humans decide in the dashboard.
  Treat a denial envelope as a value, not an error — read `denial_kind`.

### Workstream 2 — identity (ADR D2)

Tokens arrive; you never mint them. The engine's brokered `run-start`
provisions one actor per pipeline role (researcher, analyst, planner,
executor, reviewer, supervisor) and passes per-actor tokens in the start
payload. Requirements on your side: carry each token only in the worker it
belongs to; never share tokens across roles; never log a token or the start
payload verbatim; drop tokens at run end. Your gateway's start endpoint must
accept the token bundle and thread it to the right workers.

### Workstream 3 — the engine-facing control surface (ADR D1, D3)

The engine forwards exactly five verbs to your gateway; expose stable
endpoints for them and version their shapes:

- `run-start` — preset id + prompt/message + target feature tag + the actor
  token bundle. Returns your run/thread id and echoes the Vaultspec session
  id once created.
- `run-status` — authoritative snapshot of the run (topology position,
  per-role state, produced proposal ids). This is the recovery read; design
  it so a client that saw nothing else can render the run.
- `run-cancel` — idempotent cancel by run id.
- `presets-list` — enumerate team presets with plain-language names.
- `service-state` — health/doctor rollup.

Progress streaming: your orchestration events (node transitions, agent turns,
bounded token frames) are relayed by the engine as a non-authoritative SSE
channel. Emit them versioned and bounded; assume any frame can be dropped —
durable truth lives in `run-status` plus the engine's authoring events, which
the dashboard consumes without your involvement.

### Workstream 4 — lifecycle and discovery (ADR D7c)

Adopt the machine-global discovery contract so the engine's attach-never-own
predicate applies verbatim: publish a service discovery file in a
machine-global home location (the rag precedent: `~/.vaultspec-rag/
service.json` — yours would be the A2A equivalent) carrying pid, port, and a
heartbeat the engine can test for freshness, plus an ungated health endpoint
reporting ready + live pid. One resident service per machine; the engine
starts you only when genuinely absent and attaches otherwise.

### What stays yours (ADR D5)

Threads, runs, checkpoints, task-queue entries, your database, retry policy,
topology choice, preset design, provider management. Store Vaultspec ids
(session, changeset, proposal, approval) as references in your records; the
engine stores your ids as provenance. Do not duplicate any document-state
record the engine owns.

### Sequencing suggestion (not a mandate)

1. Deletions first (UI, protocol stub, agent file-write tools) — shrinks the
   surface before conformance work.
2. Authoring-API client + one solo-coder preset producing a research document
   end-to-end (propose → submit → visible in the dashboard review lane).
3. Token-bundle handling on `run-start` + the five-verb gateway surface.
4. Discovery/heartbeat contract; engine-side pass-through lands opposite it.
5. Full team preset (multi-role) — this is also the event that re-arms the
   dashboard's multiagent-composition decision (ADR D8), so flag it when it
   happens.

### Acceptance criteria

- A pipeline run started through the engine pass-through produces documents
  that appear ONLY as reviewable proposals in the dashboard, each attributed
  to its per-role actor, and nothing in the run wrote to any `.vault/` path.
- Killing A2A mid-run degrades the dashboard honestly (tiers), and a
  restarted A2A resumes or reports the run from `run-status`.
- The repository contains no UI code, no Google-A2A stub, no engine import,
  and no agent-reachable filesystem write into a vault.

## Active-run reload discovery addendum (2026-07-19)

The shipped sibling contract at `vaultspec-a2a` commit `f84f0788` adds
`GET /v1/runs?state=active`. The dashboard engine exposes it only through the
reviewed `active-runs` pass-through verb. The engine supplies the active
workspace root, never accepts a browser-controlled filesystem path, validates
an optional exact feature tag with the existing 128-character token grammar,
and requests at most two results. The existing 15-second read timeout and
loopback response ceiling continue to apply.

Both `run-start` and `active-runs` carry an `expected_scope` echo. The engine
compares it to the same selected scope cell used for the operation and returns
409 when a concurrent workspace switch wins; the echo is never forwarded as a
filesystem authority. Run start always injects that cell's root into sibling
`metadata.workspace_root`, ensuring dashboard-started rows are discoverable by
the later workspace filter.

The sibling response is versioned and bounded:

```json
{
  "api_version": "v1",
  "state": "active",
  "runs": [
    { "run_id": "run-id", "status": "running", "feature_tag": "optional" }
  ],
  "truncated": false
}
```

Dashboard recovery keeps only two valid rows and restores a viewing binding
only for one result with `truncated: false`. It never guesses among concurrent
runs and never invents the unavailable original prompt. Once bound, the
existing `run-status` read supplies authoritative state and the per-run SSE
relay supplies non-authoritative progress. A scope change clears a binding
from the prior scope before any new discovery can attach, and render-time scope
gating prevents even one stale frame from appearing under the new workspace.
Any malformed or drifted discovery envelope fails closed, and the consumed
query snapshot is removed so dismissing a terminal run cannot resurrect it.

Sibling bounds are a response limit of 100, stable newest-first ordering, a
1,000-row scan budget, 100-row pages, and a 16,384-character metadata selector
projection. The dashboard deliberately narrows the upstream limit to two for
ambiguity detection. Actor filtering is absent by contract until a stable
non-secret actor identifier exists; oversized otherwise-valid metadata may be
safely omitted by the sibling and remains a documented medium follow-up.
