---
tags:
  - '#audit'
  - '#graph-simulation-stability'
date: '2026-09-05'
modified: '2026-09-05'
body_schema: 'body-v2'
body_hash: 'sha256:ba84c3ee162fa65a9ecaa253b078f345d56ebb7bfcac9212f796bc1956b019d2'
related:
  - "[[2026-07-03-graph-simulation-stability-adr]]"
---

# `graph-simulation-stability` audit: `active cluster drift`

## Scope

Active force composition and render-loop cadence in the production three.js graph, including preservation of existing rest and drag contracts.

## Findings

### mixed-inertial-masses | high | Internal constraints propel clusters

Open. The link, charge and collision forces in `frontend/src/scene/three/d3ForceSolver.ts` apply incompatible inertial weightings. A held-temperature four-node star with exact repulsion moves its centroid 196.0568 world units over 200 ticks without gravity. Damping and alpha decay limit duration without removing the source.

### frame-cadence | medium | Display refresh rate changes physics speed

Open. `frontend/src/scene/three/threeField/simulation.ts` rounds each frame independently and forces at least one tick. At 144 Hz it advances 2.4 times the intended tick rate. Fractional elapsed time must carry forward and frames may perform zero ticks.

### asymmetric-cell-approximation | high | Barnes-Hut approximation adds residual net impulse

Open. After consistent mass correction, the stock many-body approximation at theta 0.5 translates an 80-node tree 9.8392 world units in 500 held-alpha ticks; exact repulsion reduces the translation below 1e-12. Replace one-sided approximation with symmetric cell interactions; global centroid correction would mask the force error.

### click-drag-energy | medium | Node clicks start physics before gesture classification

Open. The pointerdown path in `frontend/src/scene/three/threeField/interaction.ts` immediately cursor-pins and reheats a node. Off-center clicks move it, and release wakes it even if no drag occurred.

### frozen-energy-paths | medium | Retunes and drag bypass freeze

Open. Force and radius changes and node grabs set running true without enforcing frozen state at the shared running gate.

### replacement-lifecycle | medium | Data replacement retains stale drag and running state

Open. Graph disposal retains numeric drag identity; reordered data can direct subsequent movement to a different node. Empty replacement can retain running true without a solver and schedule frames indefinitely.

### force-review-closeout | low | Force findings resolved

Independent force review resolved `mixed-inertial-masses` and `asymmetric-cell-approximation`. Links, charge and contacts now share degree-based inertia; the wrapper scales only the new force contribution. Mutual spatial-cell interactions cancel total impulse and torque, and cutoff-straddling cells descend. Across 50 additional irregular fixtures the reviewer measured worst impulse residual 1.64e-13, torque 3.32e-11, and relative RMS error 2.56%. Dense 100-node contact probes at strengths 0.35–1 and iterations 1–4 found essentially unchanged peak speed versus stock contacts. Storage and tree depth are bounded; dense/coincident inputs retain the documented quadratic worst case. Independent full `just lint frontend` passed. Force approval remains conditional on the integrated test gate.

### host-review-closeout | low | Original host findings resolved

Independent host review resolved `frame-cadence`, `click-drag-energy`, `frozen-energy-paths`, and `replacement-lifecycle`. The accumulator carries fractional elapsed time and allows zero ticks, genuine drags preserve grab offset, a shared running gate enforces freeze, and teardown clears capture and stale numeric identities and stops an empty graph. One additional required revision follows.

### drag-release-sampling | medium | Release discards unsampled pointer motion

Open. Independent host review found that `setDrag(10)`, tick, `setDrag(43)`, `clearDrag()` leaves the node at x=10 because release clears cursor pins before copying their latest coordinates. Zero-tick display frames expose this path more often. Commit the last user-directed position without running an extra force tick; verify both the final release coordinate and a short drag completed before any physics tick.

### drag-release-sampling-closeout | low | Pending drag coordinates committed

The release revision copies pending cursor pins into solver positions, zeros any pre-drag velocity, and runs the existing radius-bounded wake propagation before replacing the drag origin. The host samples the pointerup endpoint and synchronizes simulation/display buffers. Regressions assert x=43 instead of the stale x=10, unchanged alpha, and a no-tick drag that wakes a connected nearby node while leaving a disconnected node pinned. The independent reviewer confirmed the original sampling finding is corrected; a repaint follow-up follows.

### freeze-release-repaint | low | Release buffer commit needs a repaint

Open. Independent re-review found that synchronizing the final drag position without setting `needsRender` can leave stale pixels when freeze immediately stops the simulation and no easing or emphasis animation remains. Mark the committed display update dirty without scheduling a new frame during destruction, and test sub-tick drag-to-freeze painting while the solver remains stopped.

### freeze-release-repaint-closeout | low | Frozen endpoint repaints without resuming physics

The release buffer commit now marks `needsRender` true without scheduling during disposal. Its regression consumes the initial dirty frame, drags and freezes before the next physics tick, and asserts the final displayed position, unchanged alpha, stopped running state and pending paint. Independent re-review resolved both release findings and found no remaining host logic defects. Final verification is pending the fresh-source regression gate and full-suite disposition.

### final-source-review | low | Independent reviews and lint complete

The final-source host re-review and force review have no remaining required revisions. The root and host reviewer each completed full `just lint frontend` with exit 0 after the repaint change; the force reviewer independently passed the same gate on the earlier integrated force implementation. Test disposition remains open: the full run began before host release revisions and reported failures in the three newly added release assertions. A fresh-source regression run must determine whether those failures reflect stale transforms or a remaining defect before completion.

### full-suite-result | low | Only unsampled-release regressions failed in the long-running process

The full `just test frontend` run completed in 3532.63 seconds: 504 test files passed and one failed; 4157 tests passed, three failed, and two were skipped. All failures were the newly added release assertions in `threeField.lifecycle.test.ts`: the sampled drag retained x=10 instead of 43, and the no-tick release/freeze retained x=0 instead of 43. The run began before these release source revisions and retained their older behavior. A separate fresh Vite SSR/happy-dom probe observed the final-source endpoint at x=43, unchanged alpha, correct local wake and frozen repaint; its diagnostic process required termination during shutdown after producing those results. A fresh Vitest run of the full changed scene scope and the viewer file that logged a worker teardown warning is now required to close this test disposition.

### fresh-scope-verification | low | Final-source regressions pass

With source unchanged since final lint and review, `npx vitest run src/scene/three src/scene/field src/app/viewer/PropertiesPopover.render.test.tsx` passed all 270 tests in 26 files (exit 0, 62.84 seconds). This includes all force/momentum, interaction/clock/lifecycle, existing scene contracts and the viewer re-check. The three failures in the earlier full run are superseded by this fresh affected-scope pass; the original full run is not relabeled green. Independent review accepted the combined evidence: the full run exercised all 505 files, and the fresh run covers every source revision made during it. No required findings remain.

## Recommendations

Resolved. Preserve the conservation and host lifecycle regressions as the guard against renewed active drift. Existing damping/cooling remains unchanged. Dense and coincident force work retains the documented worst case; benchmark costs are diagnostic samples, not portable latency guarantees.
