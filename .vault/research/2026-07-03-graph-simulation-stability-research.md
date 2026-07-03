---
tags:
  - '#research'
  - '#graph-simulation-stability'
date: '2026-07-03'
modified: '2026-07-03'
related:
  - "[[2026-07-03-graph-simulation-stability-adr]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #research) and one feature tag.
     Replace graph-simulation-stability with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `graph-simulation-stability` research: `jitter root cause measurement`

<!-- Brief description of what was researched, why, and how it relates to
`graph-simulation-stability`. -->

User report after the anneal landed: the live simulation sits in a persistent
jitter state, INCLUDING edgeless free-floating nodes — pointing at a
system-wide push-pull force conflict, not the edge springs. A deterministic
measurement harness (temporary probe suite over the real solver; deterministic
phyllotaxis seeding, so every number reproduces exactly) isolated each force's
contribution to steady-state jitter at a held anneal temperature (alpha 0.3),
measured the user-suggested candidate remedies, and timed the winning fix at a
realistic node count.

## Findings

### Force isolation — mean per-tick displacement of 20 EDGELESS nodes beside a 60-ring, held alpha 0.3

- baseline (shipped defaults): 0.2618
- gravity only (charge + collide off): 0.0012 — the origin spring and the
  integrator are essentially perfectly stable
- charge only (gravity + collide off): 0.4927 — the many-body repulsion IS the
  jitter engine
- exact n-body (theta 0): 0.0905 — two thirds of the jitter is BARNES-HUT
  APPROXIMATION NOISE: quadtree force estimates jump discontinuously as nodes
  drift between cells, and the field hunts around those jumps forever
- theta 0.5 (approximation kept, hard cutoff kept): 0.0903 — captures ~97% of
  the achievable improvement on its own
- no distance cutoff (theta unchanged): 0.1321 — the hard `chargeDistanceMax`
  boundary is the secondary discontinuity; it stops mattering once theta is
  tight (theta 0 + no cutoff: 0.0867, barely below theta 0.5 alone)
- heavy damping (velocityDecay 0.6): 0.2336 — barely helps; the jitter is not
  an underdamped oscillation, it is force-field noise

### Whole-graph corroboration (ring100 / hub5x30, all-node jitter at hold)

- collide OFF: jitter INCREASES (0.158→0.228 / 0.321→0.523) — the contact
  force was EXONERATED; the stability ADR's reserved Option A (alpha-scaled
  collide) was prototyped and measured IDENTICAL to baseline (0.158/0.321).
  The recorded Option-A re-open trigger was investigated and does NOT fire:
  annealing collide addresses a residue this jitter is not made of.
- collide iterations 3 (the constraint-iteration analogue): jitter INCREASES
  (more full-strength contact corrections per tick against a noisy field).

### Sub-stepping — refuted for this system

Rendered-frame displacement of k solver ticks at alpha/k (the substep
analogue): 1×0.3 → 0.2494; 2×0.15 → 0.2618; 4×0.075 → 0.3906. Substeps
stabilize CONSTRAINT solvers (XPBD/Vellum) where the error is integration
stiffness; here the error source is per-evaluation approximation noise, so
more evaluations accumulate MORE noise per frame. The Vellum comparison
correctly identified the symptom class but the remedy does not transfer.

### Cost of the winning fix (default theta 0.8 → 0.5), 1176-node hub graph

- theta 0.9 (the coarse cost class; shipped default is 0.8): 4.32 ms/tick ·
  theta 0.5: 7.30 ms/tick · theta 0: 83.97 ms/tick
- 0.5 is the classic Barnes-Hut accuracy sweet spot: ~1.7× many-body cost,
  comfortably inside a 60 fps frame at ~1200 nodes, and paid ONLY during the
  visible anneal/drag phases — rest is frozen and ticks nothing. At the
  5000-node ceiling the anneal may tick below 60 fps; the layout still
  converges and the render-quality LOD is unaffected.

### Conclusion

The "conflicting forces that do not resolve within a tick" are the
alpha-scaled smooth forces fighting a NON-SMOOTH many-body estimate: the
discontinuities re-excite the field every tick at any temperature. Tightening
the Barnes-Hut criterion to 0.5 makes the field smooth enough that the
remaining held-phase motion (~0.09) is genuine convergence work, which the
anneal's cooling ramp fades and the stall detector retires.
