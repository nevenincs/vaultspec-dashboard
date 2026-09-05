---
tags:
  - '#reference'
  - '#graph-simulation-stability'
date: '2026-09-05'
modified: '2026-09-05'
body_schema: 'body-v2'
body_hash: 'sha256:209a7500eeb105fffac6361599bc85462fd4ceb60a4d80b47c84e36d34fefd44'
related:
  - "[[2026-07-03-graph-simulation-stability-adr]]"
---

# `graph-simulation-stability` reference: `active force balance and frame cadence`

## Summary

The current solver composes d3-force v3 link, many-body and collision forces in `frontend/src/scene/three/d3ForceSolver.ts`. Installed `d3-force/src/link.js` distributes impulses by endpoint degree, whereas `manyBody.js` uses uniform node charge and `collide.js` distributes corrections by squared collision radius. There is no shared inertial mass, so balanced internal constraints need not cancel cluster translation.

A deterministic direct-library probe starts four nodes at (0,0), (80,15), (-40,70), (-25,-65), links node 0 to the other three, and uses radii 20,4,7,12. At alpha 1 held constant, velocityDecay 0.65, link distance 40 and strength 1, exact charge -180 (theta 0), collision padding 20 and strength 0.8, the combined system translates its arithmetic centroid 196.0568 world units in 200 ticks. Link alone translates 1.6544, charge alone less than 1e-12, and collision alone 0.1294. These are active-state measurements without centering or cooling; neither a renderer nor a freeze is involved.

With default charge -120, collision padding 3, collision strength 0.35 and velocityDecay 0.5, the same star translates 16.0706 world units over 200 ticks. Replacing just the degree-biased link updates with equal-and-opposite updates normalized by maximum endpoint degree reduces centroid translation below 1e-12 in this non-contact configuration. Dense mixed-radius contact needs independent coverage.

`frontend/src/scene/three/threeField/simulation.ts` computes max(1, round(frameElapsed / tickMs)) and resets its timestamp each frame. It discards fractional time and cannot execute zero ticks: 144 Hz runs 144 ticks per second, 90 Hz runs 90, and 40 Hz runs 80. `setRunning` correctly resets the epoch on resumption, but no actual elapsed-time accumulator exists.

Existing graph stability ADRs and solver tests govern frozen rest, gentle retunes, bounded annealing, pinned survivors, and local drag wake. Those contracts do not establish momentum balance during active simulation. Upstream source was checked at the installed v3.0.0 and the official d3-force v3.0.0 source and link-force documentation.

A mass-consistent probe retaining the stock link kernel assigns masses 3,1,1,1 (max(1,degree)) and divides only each many-body force delta by that node mass. With exact charge -120, velocityDecay 0.5, no collisions or centering, and constant alpha 1 for 1000 ticks, the stock composition moves the mass-weighted center 65.1309 world units; the consistent composition moves it 2.1e-14. This retains existing hub stabilization. Equal-mass springs normalized by maximum degree weaken a star leaf's spring by its hub degree and substantially change large-hub layouts.

Additional host defects in `frontend/src/scene/three/threeField/interaction.ts`: pointerdown immediately starts solver dragging before movement is classified; frozen state does not prevent force/radius/drag entry paths from starting the render loop; graph disposal leaves stale numeric drag identity, and empty replacement can leave running true without a solver. These are independent energy and lifecycle defects, not explanations for isolated active-force propulsion.

After mass correction, an 80-node branching tree (edge floor(i/3) to i+1 for i=0..78, radii 4+i%17, no centering or alpha decay) was held at alpha 1 for 500 ticks. Exact repulsion gives mass-weighted drift 3.8e-14; stock Barnes-Hut at theta 0.5 still gives 9.8392 world units. The one-sided cell approximation is therefore a second source of net impulse and requires a symmetric approximation for the active-drift requirement.

A collision-only benchmark over ten ticks compared stock contacts with the corrected uniform grid on this machine: 5000 separated grid nodes averaged 17.98 versus 8.60 ms/tick; 5000 vertical nodes 13.53 versus 9.96 ms/tick; 500 initially coincident nodes 3.88 versus 2.64 ms/tick. These are diagnostic samples, not portable performance guarantees. A held-alpha 120-node star preserved mean link length (100.23 versus 100.54 world units) and reduced overlapping pairs (157 versus 126); a ring retained zero overlaps with mean link length 51.55 versus 49.01. Dense stars still have soft-contact overlaps at held temperature.

The integrated symmetric repulsion, consistent mass and grid contacts reduce the 80-node held-alpha drift to 3.76e-14 over 500 ticks. The existing 60-ring plus 20-isolate held-temperature jitter probe measures 0.0468 world units per node per tick (existing regression bound 0.15). The new approximation measured 2.12% relative RMS force error against exact interactions on 193 irregular nodes at theta 0.5; total impulse residual was about 2e-13 and torque about 1e-11.

A separate static spiral benchmark at theta 0.5 and maximum interaction distance 500 measured symmetric repulsion at 13.49 ms versus stock 14.82 ms for 1200 nodes, and 124.38 ms versus 98.06 ms for 5000. Dense near-field and coincident interactions retain quadratic worst-case work. Production prewarming now checks its elapsed budget every tick, limiting overshoot to one force tick instead of sixteen; the existing catch-up cap remains binding.
