---
tags:
  - '#adr'
  - '#a2a-project-bound-state'
date: '2026-09-23'
modified: '2026-09-23'
body_schema: 'body-v2'
body_hash: 'sha256:11350e56643019cb28f4d63c8f40e0b2e0e0c39b49f12745ad75a43b1405eb62'
related:
  - "[[2026-07-14-a2a-orchestration-edge-adr]]"
  - '[[2026-09-23-a2a-project-bound-state-reference]]'
---

# `a2a-project-bound-state` adr: `a2a resident discovery becomes project-bound, dashboard side` | (**status:** `accepted`)

## Problem Statement

The sibling `vaultspec-a2a` repository accepted
`2026-09-23-project-bound-state-adr` (a2a repo): every a2a-owned environment
variable is renamed from `VAULTSPEC_<NAME>` to `VAULTSPEC_A2A_<NAME>` with no
legacy fallback, and a2a's resident state (discovery record, handoff
credential, database, and every other a2a-owned path) moves from a per-user
home (`~/.vaultspec-a2a`) to a project-bound default
(`<a2a project root>/.vault/data/agents`). The dashboard engine is the other
half of this contract: `routes/ops/a2a/discovery.rs` reads a2a's discovery
record to attach to the resident gateway, and `vaultspec-product::lifecycle`
sets two of a2a's environment variables when it spawns an owned gateway. Both
sides must agree on the new names and the new discovery location, or the
dashboard silently attaches nowhere.

## Considerations

- The a2a-side decision is already accepted upstream; this record does not
  re-litigate it, it adopts the dashboard's half of an already-decided
  cross-repo contract (`2026-07-14-a2a-orchestration-edge-adr` D7(c) governs
  the discovery contract this decision narrows).
- The engine serves exactly one workspace per process. That served workspace
  root is the natural, already-available root for a2a's project-bound
  discovery default in the ordinary case where the dashboard and a2a share a
  working tree.
- `2026-07-14-a2a-orchestration-edge-adr` carries pre-existing markdown lint
  debt (`mdformat` reformats several of its historical amendment blockquotes
  destructively, merging a top-level `**D2**` heading into an unrelated
  blockquote) that predates this change and reproduces identically on
  unmodified `main`. Hand-editing that record's body to append an amendment
  would need to pass the repository's `mdformat`/`pymarkdown` pre-commit
  gate, and the safe, minimal `pymarkdown` fix does not resolve the
  `mdformat` finding without corrupting document structure. A new small ADR
  avoids that pre-existing, unrelated file entirely.

## Considered options

- **Amend `2026-07-14-a2a-orchestration-edge-adr` D7(c) in place (REJECTED
  for now).** The natural home for a refinement of the same decision, but
  blocked by the pre-existing `mdformat` corruption risk on that file
  (Considerations). Revisiting this file's markdown structure to make it
  safely reformattable is separate work, out of this change's scope.
- **New small ADR citing the a2a-side decision by stem (CHOSEN).** Records
  the dashboard-side half of the contract without touching the
  lint-fragile file; cites `2026-07-14-a2a-orchestration-edge-adr` in
  `related:` as the governing edge contract this narrows.
- **No vault record, code-only change.** Rejected: this is a decision with a
  costly reversal path (discovery location and every a2a env var name are a
  contract both repos must agree on); a routine execution note would not
  survive as durable evidence of why the location moved.

## Constraints

- Depends on the a2a-side `2026-09-23-project-bound-state-adr` (a2a repo)
  already being accepted; the dashboard is the consuming half, not the
  deciding half, of the environment-variable naming and default-location
  rule.
- No route, verb, payload shape, or verdict vocabulary on the `/ops/a2a/*`
  edge changes; this decision is scoped to discovery location and
  environment-variable naming only.

## Implementation

`vaultspec-product::a2a_contract` renames the retired per-user
`A2A_HOME_DIR` constant to a project-relative default
(`.vault/data/agents`); `A2A_HOME_ENV` (`VAULTSPEC_A2A_HOME`) is unchanged as
the override name, but a relative value now resolves against a2a's project
root rather than the user's home. `vaultspec-product::lifecycle` renames the
two a2a environment variables it sets when spawning an owned gateway
(`VAULTSPEC_DESKTOP_APP_HOME` and `VAULTSPEC_DESKTOP_SETTLEMENT_URL` become
`VAULTSPEC_A2A_DESKTOP_APP_HOME` and `VAULTSPEC_A2A_DESKTOP_SETTLEMENT_URL`).
`routes/ops/a2a/discovery.rs` drops the per-user-home discovery candidate
entirely and roots the default candidate at the engine's own served
workspace root, threaded from `AppState::workspace_root` through the
pass-through, the run-stream relay, and (via a process-wide value set once at
boot, since a2a is one resident per served workspace and this specific
call site has no per-request state to thread one through) the memoized
agent-tier snapshot. `frontend/e2e/agent/harness.ts` renames every a2a-owned
environment variable it sets or deletes when it spawns a source a2a
checkout directly for the cross-repository e2e lane.

## Rationale

The dashboard has no independent stake in HOW a2a names its own environment
variables or lays out its own state; matching the accepted upstream
convention is the only option that keeps the two repositories' contract
readable and searchable (grep for one name family instead of two competing
spellings). Rooting the discovery default at the engine's served workspace,
rather than replicating a2a's own ancestor-search algorithm, keeps the
dashboard side of the resolution simple: the engine already knows its one
served workspace, and a2a's project root coincides with it in the ordinary
case where both processes run against the same checkout.

## Consequences

- The dashboard and a2a agree on one discovery location and one environment
  variable naming convention; a future rename on either side is a reviewed
  cross-repository contract event, same as before.
- A user profile no longer needs an a2a home directory at all; a machine
  that never ran a2a leaves no trace in the user's profile.
- `2026-07-14-a2a-orchestration-edge-adr` now needs a follow-on ADR (or a
  markdown-structure repair Step) before it can safely carry a hand-authored
  amendment again; that repair is out of this decision's scope and is left
  as an open item for whichever change next needs to touch that record.
