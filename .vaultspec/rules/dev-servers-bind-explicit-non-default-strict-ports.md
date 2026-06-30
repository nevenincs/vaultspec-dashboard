---
name: dev-servers-bind-explicit-non-default-strict-ports
---

# Every dev/test server binds an explicit non-default port and fails if it is occupied

## Rule

Every long-lived dev or test server this project starts — the Vite SPA dev server
(`npm run dev` / `just dev serve`), the `vaultspec serve` engine it proxies to, the
graph-lab harness, and the adverse/perf Playwright SPAs — MUST bind an EXPLICIT,
non-default port taken from the single source of truth (`frontend/dev-ports.ts`
`DEV_PORTS`, the distinctive 87xx block), with `strictPort: true` / fail-loud-on-bind-
conflict. A server is NEVER allowed to run on a framework default (Vite's 5173) or to
drift to "the next free port". This dev machine runs many projects' dev/test servers at
once, so a default or drifting port silently lands on whatever is open and collides;
OURS is the port we bind explicitly, and if it is already taken the boot ABORTS with a
clear error rather than picking a neighbour. Each port is env-overridable
(`VAULTSPEC_DEV_*_PORT`) for the rare side-by-side-worktree case; the one deliberate
exception is the vitest live-engine harness, which binds an OS-assigned ephemeral port
on purpose (strongest anti-collision guarantee for an automated, possibly-parallel test
process).

## Why

This was promoted on explicit user direction after a multi-server mess wasted a whole
orchestration session and produced fake-looking "verified" work. Stale Vite instances
from before the port-pinning landed had drifted across `5173`–`5180` (bare `vite`
invocations that never honoured the canonical port), and a stale orphan `vaultspec`
engine was squatting `8767`. An agent team's "live verification" ran against one of the
DRIFTED instances (`:5176`) instead of the user's canonical SPA at `gw-workstation:8770`
— so every claim of advancement was against the wrong server while the real dev server
was down. The `frontend/dev-ports.ts` header already documented the contract (exact
non-default ports, `strictPort`, fail-fast) and `vite.config.ts` already honoured it
(`port: DEV_PORTS.spa`, `strictPort: true`) — but the rule was not codified, so nothing
fenced the drifted servers or the wrong-port verification, and nothing stopped an
orchestrator from seeding a non-canonical port (`:5176`) into agent briefs from stale
memory. Codifying it binds every future agent to verify against, and start servers on,
the ONE explicit port — and to treat a server found on any other port as a stale/foreign
instance to clear, not a thing to test against.

## How

- **Good:** `npm run dev` / `just dev serve` binds `DEV_PORTS.spa` (8770) with
  `strictPort: true`; the engine binds `DEV_PORTS.engine` (8767); a new test harness
  reads its port from `DEV_PORTS` (graph-lab 8775, adverse 8774, perf 8776). A port
  already in use aborts the boot loudly.
- **Good:** before starting the dev server, clear any STALE same-project server on the
  canonical ports FIRST (so the engine-dev plugin spawns its own engine instead of
  adopting a stale orphan that then dies and is never respawned); never start the SPA on
  top of a still-alive stale engine.
- **Good:** when verifying live, hit the canonical port (`gw-workstation:8770` /
  `:8767`) ONLY; a vaultspec server found on `5173`/`517x`/any non-canonical port is a
  stale or foreign instance — kill it (if ours) or leave it (if another project's), never
  validate work against it.
- **Bad:** a bare `vite` (no port) or `vite --port 51xx` that drifts to 5173+; any server
  allowed to pick the next free port; an agent brief or memory that names a
  non-canonical dev port; declaring work "verified" against a server on a port that is
  not the one in `DEV_PORTS`.

## Status

Active. Promoted on explicit user direction (2026-06-28) after the drifted-multi-server
incident during the post-crash userfeedback orchestration. The contract already lived in
`frontend/dev-ports.ts` + `vite.config.ts`; this rule binds it for every agent and adds
the verify-against-the-canonical-port and clear-stale-first disciplines. Sibling of
`dev-artifacts-are-scoped-and-reclaimable` (the other dev-environment-hygiene rule) and
`dashboard-layer-ownership` (the engine/SPA two-process split these ports serve).

## Source

The 2026-06-28 post-crash userfeedback orchestration: stale Vite instances on
`5173`–`5180`, a stale orphan engine on `8767`, and agent "verification" against the
drifted `:5176` instead of the canonical `gw-workstation:8770`. Contract source:
`frontend/dev-ports.ts` (the `DEV_PORTS` single-source-of-truth + strictPort/fail-fast
rationale) and `frontend/vite.config.ts` (`port: DEV_PORTS.spa`, `strictPort: true`).
The engine respawn/adopt logic lives in `frontend/vite-plugins/engine-dev.ts`.
