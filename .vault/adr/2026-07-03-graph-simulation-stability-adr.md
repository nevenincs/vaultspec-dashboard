---
tags:
  - '#adr'
  - '#graph-simulation-stability'
date: '2026-07-03'
modified: '2026-07-03'
related:
  - "[[2026-07-02-graph-implementation-review-adr]]"
  - "[[2026-07-02-graph-simulation-stability-audit]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #adr) and one feature tag.
     Replace graph-simulation-stability with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     Status convention: the H1 status value is one of proposed, accepted,
     rejected, superseded, or deprecated. A new ADR starts as proposed; it
     moves to accepted or rejected when the decision is made; it becomes
     superseded when a later ADR replaces it (set by vault adr supersede,
     which also records superseded_by); and deprecated when it is retired
     without a direct successor.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `graph-simulation-stability` adr: `convergence-gated anneal and persisted layout base` | (**status:** `accepted`)

## Problem Statement

The stability model freezes the layout at `alphaMin`, and the settle-on-swap
hardening guarantees the freeze is never applied to a MIS-CLASSIFIED state — but
cooling itself is still SCHEDULE-driven, not convergence-driven. Alpha decays
5%/tick from a cold start and crosses the freeze threshold after ~104 ticks
(~1.7 s at 60 fps) regardless of whether the force network reached equilibrium;
the bounded 260 ms synchronous prewarm covers only a fraction of that. On any
non-trivial graph the freeze therefore captures an interrupted anneal, the pins
make that half-converged state authoritative, and every later reheat honestly
resumes the unfinished work — the reported "initial state is still tensioned;
after every reheat the nodes re-jig and continue settling." Two decisions: how
cooling becomes convergence-aware (the user's proposed active-phase timer), and
whether a converged layout can be pre-supplied as the base state on load.

## Considerations

- d3's `alphaTarget` is the native hold mechanism: alpha relaxes toward the
  target instead of toward zero, so a held target keeps the field simulating at
  sustained energy and a release (`alphaTarget(0)`) hands over to the existing
  decay + freeze unchanged.
- The solver already computes mean per-node displacement every global tick (the
  settle-probe metric) — a convergence detector costs nothing new.
- A fixed timer alone over-simmers small graphs (a 50-node graph converges in
  ~1 s) and may under-serve huge ones; a convergence gate with the timer as the
  HARD CAP adapts to both while staying bounded.
- The synchronous prewarm budget (260 ms) exists to protect the main thread;
  genuinely pre-running 5-10 s synchronously is not acceptable. The user
  explicitly accepts a VISIBLE live settle after the bounded prewarm.
- No layout persistence exists (`setPersistenceScope` is a documented no-op
  seam). The solver's `seed()` already warm-starts from arbitrary positions by
  node id with partial-overlap tolerance — a persisted map plugs straight in.
- Node positions are view-local presentation state (never displayed/filtered
  values), so client-side persistence violates no backend-serving rule; the
  `scopedStore` localStorage discipline (guarded access, corrupt-blob recovery,
  best-effort save) is the established pattern to mirror scene-side.
- Energy discipline (Option B): the anneal adds NO new energy entry point — it
  delays cooling on the existing cold/warm restart paths. Gentle retunes and
  the pin-authoritative reflow must remain untouched, or slider nudges would
  inherit a 10 s simmer.

## Considered options

- **A — convergence-gated anneal + persisted layout base.** Hold `alphaTarget`
  at an anneal temperature on cold/warm restarts until mean displacement stays
  under a calm threshold for K consecutive ticks (or a ~600-tick hard cap
  fires), then release into the existing decay + freeze; persist the settled
  positions per workspace + scope and seed the next cold load from them at a
  carry-proportional start alpha. CHOSEN.
- **B — fixed 5-10 s timer only.** Rejected: over-simmers small graphs,
  under-serves big ones, and encodes wall-clock instead of the thing actually
  wanted (equilibrium); kept only as the bounding cap inside A.
- **C — synchronous pre-run to convergence before first paint.** Rejected: a
  multi-second main-thread block; the 260 ms prewarm budget exists precisely to
  forbid this. The visible live anneal is the accepted presentation.
- **D — worker-thread pre-simulation.** Deferred: a full solver mirror in a
  worker is heavy machinery for a problem A + persistence mostly dissolve
  (after the first visit, loads open at the persisted equilibrium).
- **E — slower alphaDecay.** Rejected: stretches EVERY cooldown including
  gentle retunes, still schedule-driven, still convergence-blind.

## Constraints

- Bounded by construction: the anneal is capped by `annealMaxTicks` (and the
  prewarm phase additionally by the existing tick + wall-clock budget); the
  persisted store is capped per entry (node-ceiling positions, rounded coords)
  and across entries (LRU scope eviction) — no unbounded accumulator.
- The pin-authoritative contracts are untouched: `prewarmReflow`'s zero-tick
  same-topology guarantee, gentle-retune semantics, energy-neutral resume, and
  the alphaMin freeze all hold verbatim; guard tests extend, none weaken.
- The scene stays the sole owner of positions: persistence is a scene-local
  module keyed through the existing `setPersistenceScope` seam; no wire, store,
  or `SceneController` contract change.
- Tunables live in the canonical control registry (`graphControlSchema`), never
  local constants.

## Implementation

- **Solver anneal**: `prewarm` and `reheat` (cold and warm) enter an anneal —
  `alphaTarget(annealAlpha)`, a remaining-ticks budget, a calm counter. Each
  global tick decrements the budget and compares mean displacement to
  `annealSettleSpeed`: `annealSettleTicks` consecutive calm ticks — or budget
  exhaustion — release the target to zero and the existing decay + freeze land
  the layout. A drag or any gentle path (`reheatGentle`, `setParams`,
  `setRadii`, `prewarmReflow`) cancels the anneal; the freeze cannot fire while
  the target holds (alpha never falls below it), so no freeze-race exists.
- **Persisted base**: a bounded scene-local layout store (guarded localStorage,
  versioned blob, coords rounded, per-scope key from `setPersistenceScope`,
  LRU across scopes). When the frame loop observes the settle transition
  (running → false with the solver settled), it persists the current positions
  once per settle. A COLD `setData` (no in-memory carry) consults the store and
  seeds matching ids before the prewarm, starting at a carry-proportional alpha
  (all-persisted ≈ the gentle warm-start; none ≈ full cold) — so a revisit
  opens at the last equilibrium and merely re-anneals the diff.
- Guards: anneal hold/release/cap/cancel probes in the settle suite; layout
  store round-trip, corrupt-blob recovery, caps, and LRU eviction unit tests.

## Rationale

The diagnosis is that the freeze interrupts the anneal, so the fix is to let
the anneal FINISH — measured, not assumed. Holding `alphaTarget` is the d3-
native way to keep the field hot without new machinery, the convergence gate
spends exactly as much active time as each graph needs, and the hard cap keeps
it a bounded budget rather than a promise. Persistence then converts that spent
convergence into capital: the settled layout becomes the base value the graph
opens with, which is the strongest form of the user's "pre-simulated state" —
computed once, honestly, in view, and reused thereafter. Together they change
the felt behavior from "every load and reheat re-jigs a tense lattice" to "the
graph breathes into equilibrium once, then stays put."

## Consequences

- Cold loads and explicit restarts visibly settle for up to ~10 s on large
  graphs (calm-gated, usually far less) instead of freezing tense at ~1.7 s;
  the settled state is genuinely converged, so reheats stop re-jigging.
- Revisits open at the persisted equilibrium (first-ever visits still explode
  and anneal); a topology diff relaxes against a converged skeleton.
- The GPU no longer idles at ~1.7 s on big graphs — the anneal runs the loop
  up to its cap. Bounded and user-serving, but a real cost on battery.
- Persisted layouts are per-browser-profile state: a different machine
  re-anneals from scratch (acceptable — presentation, not truth).
- The Option-A (annealed collide) re-open trigger stays untouched: this ADR
  fixes under-annealing BEFORE the freeze; micro-buzz at rest remains the
  recorded separate trigger.

## Amendment (2026-07-03): cooling ramp + improvement-stall release

First live review found the constant-temperature hold perceptually wrong: the
collide jitter floor at the held temperature sits ABOVE any fixed calm
threshold, so the calm gate never fired on real graphs — the field buzzed at
constant amplitude for the full hard cap and snapped off at release, "a
permanent jitter state for 10 seconds, even when seemingly already settled."
Two refinements, both inside the anneal (no lifecycle change):

- **The hold is a cooling RAMP, not a plateau.** The held alpha target
  declines continuously from `annealAlpha` toward zero across the
  `annealMaxTicks` budget (classic annealing schedule): early hold does the
  hot macro-reorganization, the tail fine-tunes, and anneal motion FADES
  rather than buzzing at one amplitude and stopping audibly. The freeze that
  eventually fires is imperceptible because the motion already died.
- **Release on measured improvement stall.** The calm gate keeps its raw
  absolute fast-path, and gains a TEMPERATURE-NORMALIZED trend detector: an
  EMA of (mean displacement / current alpha) that must improve by at least
  `annealStallImprovement` to reset a stall counter; `annealStallTicks`
  ticks without improvement mean the anneal has extracted everything
  available at the current temperature — release immediately, whatever the
  raw jitter floor is. A layout that opens already-converged (the persisted
  base, a small graph) stalls within ~1.5 s and releases, instead of
  simmering to the cap. Normalizing by alpha keeps the detector honest under
  the ramp (the raw floor shrinks with temperature; the normalized floor
  flattens only when STRUCTURE stops improving).
- The freeze now also cancels any residual anneal bookkeeping, so a ramp that
  cools below `alphaMin` before the explicit release can never leave a stale
  hold behind on a frozen field.

The hard cap stays the outer bound; two new registry constants
(`annealStallTicks`, `annealStallImprovement`) join the anneal set.
