---
tags:
  - '#adr'
  - '#engine-hardening'
date: '2026-06-13'
modified: '2026-06-13'
related:
  - "[[2026-06-13-engine-hardening-research]]"
  - "[[2026-06-12-vaultspec-engine-adr]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
---

# `engine-hardening` adr: `engine hardening: conformance-in-CI, git ahead/behind, degradation adversarial` | (**status:** `proposed`)

## Problem Statement

The engine reached a functional foundation but three categories of hardening
are absent that prevent it from being a dependable production backbone: (1) no
CI step exercises the TypeScript `EngineClient` against a live engine binary —
contract drift between the Rust wire and the TS types ships silently; (2) the
git divergence signal (ahead/behind) is entirely unimplemented, leaving the
dashboard with no worktree synchronization awareness; (3) the degradation
truthfulness guarantee (`every-wire-response-carries-the-tiers-block`) has no
adversarial test coverage at the engine level — each failure mode (rag/core/git
down) is untested. A fourth gap (D8.2 re-derivability) was found already
implemented and CI-gated; it is acknowledged closed here.

## Considerations

- The one-code-path property (S49): the frontend's `EngineClient` is the
  single consumer of the wire. A Rust conformance suite catches Rust-level
  contract drift but cannot catch TypeScript type drift. The `seq`/`last_seq`
  mismatch (Task #9) slipped through Rust testing because the Rust test
  correctly asserted the field's absence while the TS client declared the wrong
  type.
- `gix` handles linked worktrees and bare repos; upstream tracking refs are
  accessible via `gix::reference::Reference::remote_tracking_ref_name()` and
  a rev-walk over the common-dir. `ahead`/`behind` counts are O(log N) on
  typical branches; they must degrade gracefully when no upstream is configured.
- The `every-wire-response-carries-the-tiers-block` rule makes tiers honesty a
  contract guarantee. The current `tiers_block()` implementation in
  `engine-query` has no test simulating each backend being unreachable.
- Re-derivability (D8.2) is already covered by `rederive_test.rs` and runs in
  `cargo test --workspace`; no additional action is required.

## Constraints

- **Engine boundary**: engine is read-and-infer only; it must not write vault
  documents or mutate git refs. `ahead`/`behind` is a read from the git object
  store — fully within the boundary.
- **Concurrent engine sessions**: `engine/` is actively committed by other
  sessions. New files in `engine/crates/ingest-git/src/` and `engine/tests/`
  must be scoped and committed promptly without touching unrelated files.
- **Graceful degradation**: `ahead`/`behind` failures (no upstream, detached
  HEAD, bare remote) must not fail the enclosing request — return `None`.
- **CI boot time**: the TS conformance CI job must build the engine binary and
  start `vaultspec serve` within a reasonable budget; a two-commit fixture (same
  shape as the existing `conformance.rs` fixture) is sufficient.

## Implementation

**D1 — TypeScript conformance CI job**

A new vitest fixture file (`frontend/src/testing/engineConformance.test.ts`)
is conditionally activated when the `ENGINE_BASE_URL` environment variable is
set. When set it imports `EngineClient`, creates a client pointed at the live
port, and drives every contract capability (graph slice, asof/diff with
ms-timestamp, tiers on success and error, search pass-through shape). When not
set it skips — the file is harmless in the normal vitest run. A new CI job
(`engine-conformance`) in `quality-gates.yml` builds the engine binary, starts
`vaultspec serve --port 0` against a temp fixture, extracts the port from
`service.json`, sets `ENGINE_BASE_URL`, and runs `vitest run
--reporter=verbose src/testing/engineConformance.test.ts`. This job runs on
`ubuntu-latest` only; Windows coverage is left to the Rust suite.

**D2 — Git ahead/behind**

`WorktreeInfo` gains `ahead: Option<u32>` and `behind: Option<u32>`. The
computation opens the common-dir repo via `gix`, resolves the upstream tracking
ref for the branch at `head_ref`, and counts commits reachable from HEAD but
not the upstream (`ahead`) and from the upstream but not HEAD (`behind`).
Failures (no upstream, detached HEAD, bare remote with no local tracking) set
both fields to `None` without failing the enclosing workspace scan. The fields
propagate into the `/map` wire response's `worktrees` array and into `/status`
`git` block as `ahead`/`behind`. TypeScript `WorktreeInfo` in `engine.ts` gains
the matching optional fields. A new `ingest-git` unit test covers a two-commit
fixture with one commit ahead of origin.

**D3 — Re-derivability (closed)**

`rederive_test.rs` already covers D8.2 and runs in CI. No new code.

**D4 — Engine degradation adversarial tests**

`engine/tests/tests/degradation_adversarial.rs` adds three scenarios using the
same fixture + ServeGuard pattern as `conformance.rs`: (a) rag unreachable —
provide a `rag_url` pointing to a bound-but-no-server port, assert the response
body carries `tiers.semantic.available === false`; (b) core unreachable —
provide a `core_path` that does not exist, assert `tiers.declared.available ===
false`; (c) valid but minimal state — assert all four tiers are present on a
healthy response (belt-and-suspenders for the envelope rule). Each test boots
its own `ServeGuard` against a temp fixture so they are independent.

## Rationale

D1 is motivated by a concrete, production-class failure. Task #9 (commit
`c812371`) resurrected time-travel scrubbing — a headline feature that was
silently dead — by fixing two field mismatches between the live `/graph/asof`
wire response and `GraphAsofResponse`: `t` was declared `number` but the engine
echoes the raw param as a `string`; `seq: number` was declared but the wire
field is `last_seq: null`. The Rust conformance suite (`conformance.rs`) already
asserted the correct wire shape at the Rust level and passed — it correctly noted
`last_seq: null`; the TS client declaration was simply wrong in a different
namespace. A consumer-typed conformance test would have fed a captured live
response through `EngineClient` and failed the moment `asof.seq` resolved to
`undefined` — catching the bug the Rust suite structurally cannot reach. D1
makes that class of drift a CI failure going forward. D2 is a missing feature
with a well-defined `gix` implementation path; the data is load-bearing for the
dashboard's worktree picker UX. D4 closes the gap between the rule
(`every-wire-response-carries-the-tiers-block`) and its enforcement: without
adversarial tests the guarantee is an aspiration, not a contract; each scenario
maps to a real production failure mode (rag down is the most common, core
unreachable the second).

## Consequences

- **Gains**: contract drift becomes a CI failure within one release cycle; the
  worktree picker gains sync awareness; degradation honesty is adversarially
  verified end-to-end at the engine level.
- **Difficulties**: D1 requires building the engine binary in CI on the frontend
  job — this adds ~90s on cold cache. The CI job is structured to use
  `rust-cache` scoped to the engine workspace to amortize this.
- **Pathways**: D1's live-engine fixture can be extended to cover future
  capabilities without touching the Rust conformance suite; D2's ahead/behind
  signal enables the planned "worktree sync status" NowStrip card.

## Codification candidates

- **Rule slug:** `ts-conformance-gates-contract-drift`.
  **Rule:** Every contract capability visible to `EngineClient` must be covered
  by a vitest test that runs against the live engine binary in CI (not just the
  mock), so that wire type drift fails CI within one release cycle rather than
  reaching production.
