---
tags:
  - '#adr'
  - '#graph-implementation-review'
date: '2026-07-02'
modified: '2026-07-02'
related:
  - "[[2026-07-02-graph-implementation-review-audit]]"
  - "[[2026-06-29-graph-simulation-stability-research]]"
---

# `graph-implementation-review` adr: `graph simulation stability model` | (**status:** `accepted`)

## Problem Statement

The graph-implementation architecture review (finding GIR-001 in the related audit)
established that the d3-force field's "settled" state is not a force fixed point.
`forceCollide` is deliberately not alpha-scaled, so the force field never fully cools;
the layout reads as stable only because the solver's `tick()` freezes the whole graph at
`alphaMin` — `sleepAll()` pins every node via `fx`/`fy` — and because every warm data
path (`prewarmReflow`) pins carried survivors so they are never re-simulated. The rest
state therefore stores residual collide/centering force, and any code path that globally
unpins and re-energises a settled layout (`reheat(false)` at WARM alpha 0.5, or
`setParams` without a gentle `reheatAlpha`) visibly displaces nodes the user believes
are at rest. The solver's own header names this ("a true fixed point would require
scaling collide by alpha (a known refinement)") and `reheatGentle`'s doc comment defers
the same fix as "a separate, higher-risk follow-up" — a standing architectural IOU with
no decision record behind it.

This ADR settles that IOU one way or the other: either the physics is changed so rest
becomes a true fixed point, or the freeze-at-`alphaMin` + pin-authoritative model is
accepted as the intentional design and its invariants are codified and guarded. What is
NOT acceptable is the current state — a load-bearing stability model that the code
apologises for in comments, with live discharge valves (audit findings GIR-002 and
GIR-003) and no recorded decision.

## Considerations

- **How d3-force actually cools.** Every stock d3 force scales its velocity
  contribution by the global `alpha`, EXCEPT `forceCollide`: its positional relaxation
  is applied at full strength every tick regardless of temperature. So as alpha decays,
  link/charge/centering contributions vanish, but contact resolution keeps producing
  O(1) micro-adjustments wherever bodies touch — the "never fully cools" residue. The
  freeze at `alphaMin` is what converts that residue into apparent stillness.
- **The forces never balance anyway.** Even with an alpha-annealed collide, a "settled"
  d3 layout is not a zero-force configuration — it is a configuration where the
  alpha-scaled forces have been damped to imperceptibility. Any WARM re-energise
  (alpha pumped to 0.5) re-reveals the unbalanced forces everywhere and moves settled
  nodes regardless of the collide fix. Alpha-annealing collide therefore buys safety
  only for the alpha≈0 regime (an energy-neutral unpin stops drifting); it does not
  make reheats displacement-free.
- **The sleeping/pinning layer is required regardless.** Drag locality — the product's
  signature "grabbing one node must not wake the graph" behaviour — depends on pinning
  sleeping nodes, because a drag holds `alphaTarget` at `dragAlpha` 0.3 and at that
  temperature every unpinned node would feel the re-revealed force field. Option A does
  not retire the pin machinery; it would run alongside it.
- **Existing mitigations already narrow the exposure.** The gentle, change-proportional
  reheat (`reheatGentle` + `forceChangeFraction`) tames the force/size slider path; the
  unified `prewarmReflow` discipline pins carried survivors on EVERY warm path (filter
  reflow, ego expansion, live delta, same-scope re-fetch), so a same-id-set update does
  zero ticks and moves nothing. The remaining discharge valves are enumerated and small:
  the falsely-"energy-neutral" `resume()` behind `set-simulation-active` (GIR-002,
  dormant — only the dev lab dispatches it) and the violent `setParams` default
  (GIR-003, dead branch in the shipped path).
- **Test infrastructure precedent.** A since-removed diagnostic probe suite measured
  both defect shapes directly (residual per-node speed on the tick before freeze;
  `reheat(false)` displacing settled nodes) and demonstrated the energy-neutral resume
  fix shape (tick without reheat moves pinned/asleep nodes < 0.001). Whatever is
  decided, those measurements should return as permanent guards, not stay deleted.
- **Determinism and flicker-free init are load-bearing.** Reload-stable layouts
  (deterministic phyllotaxis seeding, no RNG), the bounded synchronous `prewarm`, and
  the render-on-demand freeze (idle GPU at settle) are product guarantees this decision
  must not disturb.

## Considered options

- **OPTION A — alpha-anneal the collide force.** Wrap `forceCollide` in a custom force
  that scales its correction by the current alpha (or a floor-clamped ramp), so at
  `alphaMin` ALL velocity contributions vanish and rest becomes a true fixed point of
  the dynamics; the freeze and the pins become belt-and-braces instead of load-bearing.
  Pros: physics-honest rest; the "unpin at rest discharges energy" bug class dies at
  the root; micro-buzz near contacts cannot resurface. Cons: d3's stock `forceCollide`
  has no alpha parameter, so this is a bespoke force replacing the most battle-tested
  contact solver in the ecosystem; annealing contact resolution as the layout cools
  risks freezing residual OVERLAPS into the rest state (the "no two nodes touching"
  look degrades) and needs real tuning (anneal floor, threshold alpha) plus a
  measurement harness; it does NOT make warm reheats displacement-free (forces still
  do not balance), so the GIR-002/GIR-003 valve closures are required under A anyway;
  and the pin machinery must be kept for drag locality, so A adds a physics path
  without removing any architecture.
- **OPTION B — codify freeze-at-alphaMin + pin-authoritative layout as the accepted
  design.** No physics change. The model — "the settled layout is authoritative; the
  graph is static unless explicitly dragged; asleep ⇔ pinned; every ambient
  re-energise is gentle and change-proportional; a full re-explode happens only on an
  explicit user restart or a cold load" — is declared intentional, its remaining
  discharge valves are closed (GIR-002, GIR-003), its invariants get permanent guard
  tests (the resurrected probe measurements), and the apologetic comments are rewritten
  as design statements. Pros: zero regression risk to a shipped, test-covered,
  deliberately-engineered stability model; the actual user-visible defects are the
  valves, which are one-line-scale fixes; keeps the solver stock d3. Cons: rest remains
  physically dishonest (held, not converged); the discipline must be maintained by
  every future energy-injection path (guard tests are the backstop); latent micro-buzz
  returns if any future path leaves nodes awake near contact at low alpha without the
  freeze.

## Constraints

- `graph-compute-is-cpu-gpu-is-render-and-search`: the solver stays a plain,
  deterministic CPU simulation (stock d3-force); no GPU/GPGPU migration is in scope
  under either option.
- `bounded-by-default-for-every-accumulator`: solver state must remain fixed-size typed
  arrays keyed by node count; neither option may introduce a growing accumulator or an
  unbounded retry/anneal loop.
- The `prewarmReflow` guarantees must not regress: a pure removal / same-id-set update
  does ZERO ticks and moves nothing; warm updates relax only genuinely-new nodes; a
  cold load keeps the bounded (tick-cap AND wall-clock) synchronous prewarm.
- The reheat-displacement class must not be reintroduced: any change to `resume`,
  `setParams`, `setRadii`, or the reheat family must preserve gentle/proportional
  semantics and the asleep ⇔ pinned invariant (including through a drag hand-off).
- Tunables have ONE definition: any new constant (e.g. an anneal floor under Option A)
  must live in the canonical control registry (`graphControlSchema`), never a local
  duplicate.
- Parent-feature stability: the solver (`d3ForceSolver.ts`) and its host
  (`threeField.ts`) are mature and heavily test-covered; the seam (`sceneController.ts`
  command union) is LOCKED — no seam change is needed under either option.

## Implementation

**Decision: OPTION B** — accept and codify the freeze + pin-authoritative stability
model; reject Option A for now with an explicit re-open trigger.

The implementation is discipline codification plus valve closure, entirely inside the
scene layer, no seam or wire change:

- Close the two energy-discipline valves: make the `set-simulation-active` resume path
  genuinely energy-neutral (resume ticking without any solver re-energise, matching its
  own comment and the `set-frozen` precedent), and remove the violent implicit default
  from the solver's live-retune path so a caller must choose gentle-proportional or an
  explicit restart.
- Harden the sleep invariant: guard the drag hand-off so asleep ⇔ pinned-at-rest holds
  unconditionally (GIR-004), not just via the current pointer-handler ordering.
- Resurrect the settle-probe measurements as permanent guard tests in the solver suite:
  an energy-neutral resume moves settled nodes by < ε; `reheatGentle` never lowers the
  current temperature; a same-id-set warm update does zero ticks; the freeze fires and
  `isSettled()` holds with nothing awake.
- Rewrite the solver's apologetic comments as design statements (the freeze and pins
  ARE the stability model), fix the stale alpha-decay schedule comment to match the
  canonical schema values (GIR-005), and record the Option-A re-open trigger in the
  header where the "known refinement" note lives today.

## Rationale

Option B is recommended on three grounds. First, Option A's headline benefit is
narrower than it looks: because d3 layouts are damped-imperceptible rather than
force-balanced, alpha-annealing collide only makes the alpha≈0 unpin safe — a case the
pin machinery already covers — while every warm reheat still displaces settled nodes,
so the valve closures (GIR-002/GIR-003) are the real fix under EITHER option. Second,
Option A trades the ecosystem's most battle-tested contact solver for a bespoke
annealed force with genuine tuning risk (frozen-in overlaps at rest), against a
selection rationale that explicitly chose d3-force for its battle-testedness — and it
removes no architecture, since drag locality requires the sleep/pin layer regardless.
Third, the current model is not an accident to be repaired but an engineered design
that held up under adversarial review: the audit (GIR-001) found it internally
consistent, layered, and test-covered, with the defects confined to two enumerable
valves and one latent invariant hole. Codifying it — with guard tests replacing
vigilance — converts the standing IOU into a decision, at near-zero regression risk.
Option A remains available behind a recorded trigger: if at-rest displacement or
contact micro-buzz recurs AFTER the valves are closed and the guards are green, the
annealed-collide experiment gets its own ADR with the probe harness as its measurement
baseline.

This recommendation independently converges with the related prior research
`2026-06-29-graph-simulation-stability-research`, which examined the same lever from
the user-symptom side ("the graph must be static unless a node is explicitly dragged")
and concluded that alpha-annealing collide is the wrong lever — the architecturally
correct alternative being to treat the settled layout as authoritative, pin survivors,
and never re-simulate existing nodes. That conclusion became the shipped
`prewarmReflow` discipline this ADR now codifies; the present decision extends it by
closing the residual energy valves and installing the guard tests.

## Consequences

- The stability model becomes an accepted, documented design instead of an apologised-
  for implementation detail; future agents inherit "settled = frozen + pinned, and
  that is intentional" rather than rediscovering it as a suspicion (this review's
  mandate framing — "achieves stability but the implementation is suspicious" — is
  answered in the record).
- The two remaining displacement bugs (dormant resume valve, violent setParams
  default) are eliminated, and the invariant set gains build-gated guards, so the
  discipline no longer depends on comment-reading vigilance.
- Rest remains physically a held state: the honest cost of B. Any future feature that
  wants nodes awake near contact at very low alpha without freezing (e.g. a continuous
  ambient animation mode) will hit the collide residue and should fire the recorded
  Option-A trigger rather than improvising.
- No perf, wire, seam, or visual change: layouts, determinism, flicker-free init, and
  idle-GPU-at-settle are untouched. The blast radius is comments, two small behaviour
  fixes in already-dead-or-dormant branches, one drag-handoff guard, and new tests.
- Codification candidate: the invariant set below is rule-shaped ("every ambient
  re-energise is gentle and change-proportional; a full re-explode only on explicit
  restart or cold load; asleep ⇔ pinned") and can be promoted once it has held a
  cycle.

## Required remediation decisions (plan-step enumeration)

The recommended option implies exactly these sub-tasks, each concrete enough to become
one plan step:

1. **R1 — energy-neutral resume (GIR-002).** Change the `set-simulation-active:true`
   handling in `threeField.ts` so `resume()` sets the loop running and wakes the rAF
   WITHOUT calling the solver's `reheat(false)`; an explicit restart remains
   `reheatNow()`. Update the handler comment so it states what the code now does.
2. **R2 — no implicit violent retune (GIR-003).** In `d3ForceSolver.ts`, remove the
   `reheat(false)` fallback from `setParams` — either require `reheatAlpha` or default
   it to the gentle schema value — so the violent path is only reachable through an
   explicit `reheat(cold)` call.
3. **R3 — drag hand-off guard (GIR-004).** In `d3ForceSolver.setDrag`, release the
   previous drag index (clear its pin/rest bookkeeping as `clearDrag` does) when a new
   index is grabbed without an intervening release, so asleep ⇔ pinned-at-rest holds
   unconditionally.
4. **R4 — resurrect the settle-probe as permanent guards.** Add to
   `d3ForceSolver.test.ts`: (a) settled + energy-neutral resume ⇒ max node move < ε;
   (b) `reheatGentle(a)` never lowers the current alpha; (c) same-id-set warm update
   (`prewarmReflow` with no new nodes) does zero ticks and zero movement; (d) the
   `alphaMin` freeze fires, `isSettled()` holds, and a subsequent tick moves nothing.
5. **R5 — comment truth (GIR-005 + design statements).** Fix the `alphaDecay` doc
   comment to the canonical schema schedule (0.05 decay / 0.005 min, ≈100 ticks from
   cold), and rewrite the solver-header "known refinement" and `reheatGentle`
   "higher-risk follow-up" notes into design statements that name this ADR and its
   Option-A re-open trigger.
6. **R6 — full-gate verification.** Run the scene test suite plus `just dev lint
   frontend` to green (`declaring-green-runs-the-full-gate`); no live-verify is
   required beyond the suite since the touched branches are dormant/dead in the
   product path, but a manual pause→resume + slider-retune spot-check on the live
   graph is cheap insurance.

Out of scope here (tracked by their own audit findings, not this ADR): the unbounded
`/graph/diff` wire (GIR-010/011), the delta-path full rebuild (GIR-006), the empty
`set-data` ghost state (GIR-008), and the autoframe re-engage yank (GIR-012).
