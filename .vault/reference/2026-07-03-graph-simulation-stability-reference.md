---
tags:
  - '#reference'
  - '#graph-simulation-stability'
date: '2026-07-03'
modified: '2026-07-03'
related:
  - "[[2026-07-03-graph-simulation-stability-adr]]"
  - "[[2026-06-29-graph-simulation-stability-adr]]"
  - "[[2026-07-02-graph-implementation-review-adr]]"
---

# `graph-simulation-stability` reference: `Obsidian-feel force sim discipline — Quartz, d3-force, ForceAtlas2 vs our solver`

Comparative source audit of the reference force-graph implementations behind the
"Obsidian feel" (smooth, continuously eased, no pop, no buzz), diffed against our
`d3ForceSolver` + `threeField` loop to locate what the glitchy sim is missing or
misconfiguring. Sources read in full: stock d3-force (`simulation.js`, `manyBody.js`,
`collide.js`, `link.js` from our own `node_modules`), graphology
`layout-forceatlas2` (`defaults.js`, `iterate.js`, `index.js`, `worker.js`, cloned),
Quartz v5 clone (graph plugin docs; see availability note), our `d3ForceSolver.ts`,
`graphControlSchema.ts`, and the `threeField.ts` frame/drag/set-data paths, grounded
against the three accepted stability ADRs.

**Obsidian availability note.** Obsidian itself is closed-source (proprietary
Electron; its license prohibits reverse-engineering the bundle), so its graph core
cannot be read directly. Its model is publicly known to be d3-force with a
continuously warm field (held `alphaTarget ≈ 0.05` — the "living graph" jiggle).
The Quartz v5 clone has the graph view extracted to an external community plugin not
vendored in-repo; its documented config plus the well-known Quartz v4
`graph.inline.ts` behaviour are cited instead.

## Summary

### Per-reference discipline

**Stock d3-force (our engine).** Defaults: `alpha 1`, `alphaMin 0.001`,
`alphaDecay ≈ 0.02284` (a designed 300-tick schedule), `velocityDecay 0.4` public
(nodes retain 60% velocity/tick), manyBody `strength -30`, `theta 0.9`,
`distanceMax Infinity`, link `distance 30`, degree-normalized spring strength,
`forceCollide` NOT added by default. Rest is a timer stop only — no pinning, no
freeze; nodes simply stop being ticked. Canonical drag: `alpha(0.3)`,
`alphaTarget(0.3)`, `restart()` — a GLOBAL wake; release hands back to decay.
Seeding is deterministic phyllotaxis.

**Quartz / Obsidian.** Config exposes only `repelForce` (~0.5 → effective charge in
the −15..−30 range), `centerForce` (0.3 local / 0.2 global), `linkDistance 30`; no
collide option exists at all; alpha/velocity knobs are not exposed so d3 defaults
apply. Obsidian holds the field permanently warm (`alphaTarget ≈ 0.05`) and lives
with drift — global drag jiggle is invisible against the ambient micro-motion. The
decisive Quartz v4 mechanism: a RENDER-TIME position lerp,
`renderX += (physicsX − renderX) × 0.1` per frame — physics jitter is time-averaged
~10× before it reaches the screen, and any physics stop glides out over ~10 frames
instead of snapping. Cold start accepts a visible explosion-then-settle from the
phyllotaxis seed.

**ForceAtlas2 (graphology).** No alpha, no cooling schedule at all. Stability is
per-node adaptive speed (`iterate.js:696-789`): `swinging = mass × |F_new − F_old|`
(oscillation), `traction = |F_new + F_old| / 2` (progress),
`nodespeed = convergence × log(1 + traction) / (1 + √swinging)`, scaled by a global
`slowDown` (recommended `1 + log(order)`). An oscillating node damps itself; a
converged node has zero speed — rest is a TRUE ATTRACTOR of the dynamics, not a
schedule-imposed stop. Anti-collision (`adjustSizes`) is OFF by default and is a
force modification (scales with iteration energy), not a position constraint; a
`MAX_FORCE = 10` per-tick displacement clamp prevents cold-start explosions.
Designed to run in a worker streaming position batches to a main-thread renderer.
Drag = `NODE_FIXED`, no energy bump. Defaults `barnesHutTheta 0.5` (matching our
post-amendment value), Barnes-Hut only recommended above ~2000 nodes.

### Parameter comparison (ours vs references)

| Parameter | Ours (schema) | d3 default | Quartz/Obsidian | FA2 |
|---|---|---|---|---|
| charge strength | −120 | −30 | ≈ −15..−30 | scalingRatio 1 |
| chargeTheta | 0.5 | 0.9 | 0.9 | 0.5 |
| chargeDistanceMax | ~10× linkDist (~400) | Infinity | Infinity | n/a |
| linkDistance | 40 | 30 | 30 | n/a |
| spring strength | 1/min(deg) × k | 1/min(deg) | d3 default | linear attraction |
| centering | forceX/Y(0) @ 0.06 | none | forceCenter 0.2–0.3 | gravity 1 |
| forceCollide | YES, strength 0.8 | not added | ABSENT | adjustSizes OFF |
| velocityDecay (public) | 0.5 | 0.4 | 0.4 | per-node adaptive |
| alphaDecay | 0.05 | ≈ 0.0228 | ≈ 0.0228 | no concept |
| alphaMin | 0.005 | 0.001 | 0.001 | no concept |
| rest model | FREEZE + pin (fx/fy) | timer stop | never rests (warm) | true fixed point |
| drag | alphaTarget 0.3, LOCAL wake set | global wake | global wake | NODE_FIXED only |
| loop | 1 tick per rAF, main thread | internal timer | 1 tick/rAF | worker + batches |
| render-time lerp | NONE (raw positions) | n/a | YES (~10%/frame) | consumer-side |
| seeding | phyllotaxis | phyllotaxis | phyllotaxis | random/caller |

### Ranked root-cause candidates for the glitchy feel

1. **Missing render-time position lerp — highest impact, no ADR conflict.**
   `threeField.ts` uploads raw `solver.pack` positions straight to the GPU texture;
   every Barnes-Hut approximation wobble and anneal correction reaches the screen at
   full amplitude. Quartz's `~0.1/frame` display lerp is THE mechanism that makes the
   same d3 physics feel smooth: measured anneal-floor jitter (~0.26 mean
   displacement/tick) would render at ~0.026 — imperceptible — and the freeze would
   glide out over ~10 frames instead of dead-stopping. Minimal change: a
   `lerpPositions` buffer eased toward `cpuPositions` each frame (`k ≈ 0.1` while
   simulating, snap `k = 1` once settled so the frozen display equals physics truth).
   Presentation-layer only; the pin-authoritative physics contract is untouched.

2. **forceCollide at strength 0.8, never alpha-scaled — the buzz contributor.**
   Every reference either omits collide entirely (d3 default, Quartz/Obsidian — no
   config option exists) or ships it off (FA2 `adjustSizes: false`, and theirs scales
   with iteration energy when on). Ours resolves contacts at full strength while the
   other forces decay — ~3.3× over-corrected at the anneal hold. Minimal change:
   lower `collideStrength` 0.8 → 0.3–0.4. Fuller change: alpha-scale collide — that
   is exactly the reserved Option A re-open path (deferred, not rejected; re-evaluate
   after fix 1 lands).

3. **alphaDecay 0.05 is 2.2× the d3 default.** Our post-anneal tail is ~68 ticks
   (~1.1 s) vs ~149 (~2.5 s) at d3's 0.0228 — less time for the field to self-balance
   before the freeze captures it. Minimal change: schema default 0.05 → 0.03. No ADR
   opinion binds this tunable.

4. **Persisted layout base is decided but unimplemented.** The 2026-07-03 ADR plans
   seeding from a bounded scene-local layout store (`setPersistenceScope` is a no-op
   seam today); with it, a revisit opens at the converged seed and the anneal
   stall-releases in frames instead of a ~10 s visible settle from the phyllotaxis
   explosion.

5. **chargeTheta 0.5 is the codified sweet spot; 0.3–0.4 is the next lever.**
   Residual Barnes-Hut noise (~0.17 vs the exact-n-body 0.09 baseline) remains; going
   lower costs ~3× many-body time. Evaluate only if jitter is still visible after 1–2.

6. **Secondary, lower impact:** the binary drag `wakeRadius` boundary (a step change
   at 7× linkDistance — soften with a strength gradient or widen to 12–15×; the
   references have no boundary because they wake globally, which our
   static-unless-dragged requirement forbids); and the tick-count anneal budget /
   stall detector being frame-rate-dependent (600 ticks = 10 s at 60 fps but 20 s
   under a slow renderer — convert both to wall-clock).

### Deliberate divergences to keep (do not "fix" toward the references)

- **Local drag mode** (sleep/wake set): our static-unless-dragged product law;
  references wake globally, incompatible with the requirement.
- **Freeze-at-alphaMin + pin-authoritative rest** (Option B, codified): Obsidian
  never rests — adopting its warm field would trade our stillness requirement for
  smoothness. The lerp (candidate 1) buys the smoothness WITHOUT that trade.
- **forceX/Y centering** beats Quartz's forceCenter for a settled field (per-node
  spring, no correlated centroid oscillation) — we diverge in our favour.
- **chargeTheta 0.5** (more accurate than Quartz's effective 0.9) — reverting would
  restore the dominant jitter source.
- **Degree-normalized spring strength** — already exactly aligned with d3/Quartz.

### FA2 direction worth recording

FA2's swinging/traction adaptive per-node speed makes rest a genuine equilibrium
without any cooling schedule — the principled long-term alternative to
schedule-driven cooling if the freeze model is ever re-opened (the recorded Option-A
trigger). Its `MAX_FORCE` displacement clamp is also a cheap, no-conflict guard worth
considering against cold-start explosion spikes.
