---
name: graph-layout-is-pin-authoritative-not-force-converged
derived_from:
  - "audit:2026-07-02-graph-implementation-review-audit"
---

# The graph's settled layout is pin-authoritative, not force-converged

## Rule

The headline graph's rest state is an ENGINEERED stability model, not a d3-force fixed
point, and this is the accepted, intentional design: `D3ForceSolver` freezes the whole
graph at `alphaMin` and pins every node via `fx`/`fy` (`sleepAll()`), because
`forceCollide` is deliberately never alpha-scaled and the integrator cools on a fixed
schedule rather than converging to a force balance. Energy may be (re)injected into a
settled layout only through the named, gentle entry points — `set-data`'s warm-start
prewarm, `setForceParams`'/`setAppearanceParams`' change-proportional `reheatGentle`,
and an explicit `reheatNow()`/cold restart — never through a bare global unpin
(`wakeAllFree()` + a WARM-alpha `reheat(false)`). `resume`/`pause` must stay
energy-neutral: toggling ticking never re-pumps heat. Every ambient warm data path
(ego expansion, live delta splice, a same-scope re-fetch) MUST pin carried survivors
before relaxing (the `prewarmReflow` discipline) so already-settled nodes are never
re-simulated; a same-id-set update does zero ticks and moves nothing. These invariants
are enforced by the solver's settle-probe guard tests, not by comment-reading
vigilance.

## Why

`2026-07-02-graph-implementation-review-adr` (accepted, Option B) settled a standing
architectural IOU that the audit's `2026-07-02-graph-implementation-review-audit`
GIR-001 finding named: the solver's own header admitted the rest state "achieves
stability but the implementation is suspicious" — collide never cools, so the layout
reads as still only because `tick()` freezes it and pins survive. The corroborating
`2026-06-29-graph-simulation-stability-research` proved the intuitive fix (alpha-anneal
collide for a "true" fixed point) is the wrong lever: d3-force is simulated annealing,
not a minimizer, so it cools on a fixed tick schedule whether or not forces have
balanced — annealing collide would only quiet residual jitter, it would not make a
WARM reheat displacement-free, and the pin/sleep machinery is required regardless for
drag locality. The real, live bugs were the discharge valves that violated the
model's own contract: `set-simulation-active:true` claimed an energy-neutral resume in
its own comment but actually ran the violent `reheat(false)` (GIR-002), and
`setParams()` defaulted to that same violent reheat when a caller omitted
`reheatAlpha` (GIR-003). Rejecting the physics rewrite and instead codifying the
freeze-and-pin model — while closing those valves and hardening the sleep invariant on
a drag hand-off (GIR-004) — keeps the ecosystem's most battle-tested contact solver,
adds zero regression risk to a shipped, test-covered design, and converts a standing
apology into a documented decision with guard tests as the backstop.

## How

- **Good:** a slider retune calls `setForceParams`, which always passes a gentle,
  change-proportional `reheatAlpha` — the layout eases rather than snaps.
- **Good:** an ego expansion or a live SSE delta batch feeds through `prewarmReflow`,
  pinning every carried survivor at its current position and relaxing only the
  genuinely new nodes; a delta that changes no id set ticks zero times.
- **Good:** a pause/resume toggle sets `running` without touching the solver's alpha —
  the graph looks exactly as it did before the pause.
- **Good:** a new energy-injection path is added as a NAMED entry point (extending the
  gentle-reheat family), and its test asserts settled nodes move less than the
  guard-test epsilon under the new path, mirroring the resurrected settle-probe
  measurements in the solver suite.
- **Bad:** any code path that calls `wakeAllFree()` (or otherwise globally unpins) and
  then pumps alpha to a WARM value without going through the gentle/proportional
  reheat — this visibly displaces nodes the user believes are at rest, exactly the
  GIR-002/GIR-003 defect shape.
- **Bad:** treating the settled layout as something the solver should be made to
  "truly converge to" via a bespoke alpha-annealed collide force — the annealing does
  not solve the actual displacement bug (which is a discharge-valve problem, not a
  convergence problem) and trades away the stock, battle-tested contact solver for
  unproven tuning risk.

## Status

Active. Promoted at the close of the `graph-implementation-review` remediation cycle
(audit finding GIR-001, ADR Option B accepted, remediation steps R1–R6 executed and
gated), on explicit mandate direction. Recorded re-open trigger: if at-rest
displacement or contact micro-buzz recurs AFTER the energy valves are closed and the
settle-probe guards are green, the alpha-annealed-collide experiment (ADR Option A)
gets its own ADR with the probe harness as its measurement baseline — this rule does
not forbid that path, it forbids reaching for it before the valve-closure discipline
here has been exhausted. Sibling of `graph-compute-is-cpu-gpu-is-render-and-search`
(the solver stays a plain, deterministic CPU simulation under either option),
`derived-projections-memoize-on-the-graph-generation` (the sibling discipline of
computing once and holding state rather than recomputing), and
`bounded-by-default-for-every-accumulator` (the solver's typed-array state stays fixed
size regardless of which entry point re-energises it).

## Source

ADR `2026-07-02-graph-implementation-review-adr` (accepted; Option B, decisions R1–R6).
Audit `2026-07-02-graph-implementation-review-audit`, finding GIR-001 (and the related
GIR-002/GIR-003/GIR-004 discharge-valve and sleep-invariant findings the same
remediation closes). Research `2026-06-29-graph-simulation-stability-research`
(findings F4/F6, the d3-force-is-an-annealer-not-a-minimizer grounding). Guard: the
resurrected settle-probe measurements in `d3ForceSolver.test.ts`.
