---
tags:
  - '#research'
  - '#graph-force-stability'
date: '2026-06-16'
modified: '2026-06-16'
related: []
---

# Force-directed stability research

## Problem & symptoms

The dashboard's connectivity (Obsidian-like) node-graph canvas under `frontend/src/scene/field/` was rewritten in the `2026-06-15-dashboard-node-graph-stability` cycle from a graphology ForceAtlas2 worker to a main-thread d3-force driver. That cycle landed green (plan 14/14, all steps `[x]`) and genuinely dissolved the original eleven defects D1–D11: the per-frame camera snap, per-frame hull/hit-index/edge recompute, the NaN crash, the worker re-entry race, and pin-fighting. The graph now settles and freezes instead of spinning forever.

The residual complaint is narrower but real: the layout still **flickers/jumps on data churn and on control interaction**, is **hard to control** (knob changes cause visible re-settling rather than smooth adjustment), and lacks the **interactive fidelity** of Obsidian (no node drag-to-pin, no neighbour-focus reheat, collision radius decoupled from the salience-driven node sizes). The instability is no longer a continuous 60fps breathing loop — it is **transient re-heats and re-inits** fired by upstream React effects and by the control surface, each producing a visible jump because every reheat re-runs forces over the whole field from a non-trivial alpha.

## Current implementation (file:line evidence)

**The d3-force driver** (`frontend/src/scene/field/forceLayout.ts`):
- Fixed cooling schedule: `ALPHA_MIN=0.001`, `ALPHA_DECAY=0.0228`, `VELOCITY_DECAY=0.4` (lines 73–75) — exactly the d3-force v3 defaults (confirmed: `alphaDecay = 1 - pow(0.001, 1/300)`, ~300 ticks). Correct and not user-exposed.
- Reheat alphas: `COLD_START_ALPHA=1`, `WARM_START_ALPHA=0.5`, `PARAM_REHEAT_ALPHA=0.3`, `PIN_REHEAT_ALPHA=0.1` (lines 77–80).
- Forces composed at lines 217–226: `charge` (`forceManyBody`), `link`, `x`, `y` (`forceX/Y(0)` as per-node gravity — correct, not `forceCenter`), `collide`. Charge tuned at lines 231–234: `theta=0.9`, `distanceMax=500`, strength `-repel`.
- `COLLIDE_RADIUS = 18` **fixed** (line 87, line 198) — the driver has no per-node radius by design (comment lines 84–86).
- Manual frame loop driven by `requestAnimationFrame` (lines 303–327): `sim.tick()`, `snapshot()`, `emitPositions()`, freeze when `sim.alpha() < ALPHA_MIN` and fire `onSettle` (lines 321–325). The sim is created `.stop()`ed (line 226) so only the manual loop ticks it — sound.
- `snapshot()` NaN guard (lines 330–349): repairs any non-finite coord to the last good value, zeroes velocity. Solid (D4 closed).
- `setParams()` (lines 372–380): applies params then `sim.alpha(Math.max(currentAlpha, PARAM_REHEAT_ALPHA)).alphaTarget(0)` and restarts the loop — **every knob nudge reheats to alpha≥0.3**.
- `setPinned()` (lines 387–403): sets `fx/fy` solver-level (D7 closed) and reheats to `PIN_REHEAT_ALPHA`.
- `start()` (lines 285–291): `sim.alpha(this.startAlpha)` — a fresh `init` followed by `start` reheats to `COLD_START_ALPHA=1` (cold) or `WARM_START_ALPHA=0.5` (warm, line 274–277, when >50% of nodes have a warm position).

**The field assembly** (`frontend/src/scene/field/fieldAssembly.ts`):
- `onPositions` frame consumer (lines 181–214): gated by `frameMoved()` (line 189) with `MOVE_EPSILON = 0.4` world units (line 40, predicate lines 670–684). No camera fit per frame (D1 closed); fit is once-on-settle (lines 219–224) guarded by `autoFitArmed`.
- `dataSignature` skip (lines 60–65, applied lines 413–414): a **byte-identical** `set-data` re-issue is skipped. But any content change re-runs `applyModelToLayers(true)`.
- `applyModelToLayers(reseed=true)` (lines 753–826): on reseed it calls `this.layout.init(nodeIds, backboneRefs, warm)` then `this.layout.start()` (lines 819–820) — **a full re-init + reheat**, plus `fitToContent(..., false)` (instant) at line 825 AND arms the settle fit (line 824) which animates later (lines 219–224). So a fit fires twice per reseed: instant on seed, animated on settle.
- `set-layout-mode` (lines 546–576) and `set-representation-mode` → `applyRepresentationMode` (lines 605–652): both call `layout.init()` + `layout.start()` for the connectivity branch — another full reheat path.

**The control panel** (`frontend/src/app/stage/AlgorithmPanel.tsx`):
- `LAYOUT_DEFAULTS` (forceLayout.ts lines 64–69): `repel:120, linkForce:0.4, linkDistance:40, center:0.06`.
- `applyParams` (lines 109–113) dispatches `set-layout-params` **on every `onChange`** of every slider (lines 203, 213, 223, 233) — each drag of a slider fires a `set-layout-params` command → `setParams` → reheat to 0.3. No debounce, no `alphaTarget` hold-during-drag.

**The upstream driver of `set-data`** (`frontend/src/app/stage/Stage.tsx`):
- `merged` is a `useMemo` (lines 306–) recomputed when `slice.data` or `expansionSig` changes; the `set-data` effect (lines 342–350) fires on `[merged, scope, timelineMode.kind]`. `merged` is a **fresh object identity** on every live keyframe/expansion refetch.
- The `set-representation-mode` effect (lines 357–362) fires on mount with `connectivity`, AND the `set-data` effect fires on mount — **both call `init()`+`start()`**, double-cold-starting the initial load.

## Root causes of instability (ranked, each with evidence)

**R1 — `set-data` content changes trigger a full `init()` + cold/warm reheat (HIGH, the dominant residual flicker).** The `dataSignature` guard (`fieldAssembly.ts:413`) only skips *byte-identical* re-issues. Any real delta — a live constellation keyframe, a working-set expansion (`Stage.tsx:305–350`), a filter that changes the served slice — recomputes `merged`, fires `set-data`, and runs `applyModelToLayers(true)` → `layout.init(...)` + `layout.start()` (`fieldAssembly.ts:819–820`). `init()` rebuilds the node array and `start()` reheats to `WARM_START_ALPHA=0.5` or `COLD_START_ALPHA=1` (`forceLayout.ts:274–277, 286`). At alpha 0.5 the whole field visibly re-jiggles and re-fits, even though most nodes were already positioned. d3 best practice for an incremental graph change is to mutate `nodes`/`links` in place and reheat to a *low* alpha (~0.1–0.3), not re-init at 0.5–1. The driver has `applyChanges()` for exactly this (`forceLayout.ts:406–451`) but the assembly never calls it on the `set-data` path — it always full-inits.

**R2 — every knob change reheats to alpha 0.3 (HIGH, "hard to control").** `AlgorithmPanel` dispatches `set-layout-params` on every slider `onChange` (`AlgorithmPanel.tsx:203,213,223,233`), and `setParams` reheats to `Math.max(alpha, 0.3)` (`forceLayout.ts:375`). Dragging a slider therefore fires dozens of commands, each kicking the sim back to 0.3 and re-running the loop — the layout lurches while the user is trying to tune it. Obsidian applies force changes continuously against a *held* low alphaTarget during interaction and only re-cools on release; here each change is a discrete cold-ish kick. No debounce and no "hold alphaTarget while a control is active" exists.

**R3 — double fit + double init on initial load and mode entry (MED).** On mount, both the `set-data` effect (`Stage.tsx:342–350`) and the `set-representation-mode` connectivity effect (`Stage.tsx:357–362`) run; the latter's `applyRepresentationMode` connectivity branch also calls `init()`+`start()` (`fieldAssembly.ts:640–641`). The field is initialised and reheated twice in the same commit. Separately, every reseed fits the camera **instantly** on seed (`fieldAssembly.ts:825`, `fitToContent(...,false)`) and then **animated** on settle (`fieldAssembly.ts:219–224`) — two camera moves per load, the second yanking from the seed framing to the settled framing. That second move reads as a post-load "snap-settle".

**R4 — collision radius is a fixed 18 but node bodies range 6–15.6px (MED, overlap/jitter at high salience).** `COLLIDE_RADIUS=18` (`forceLayout.ts:87`) is constant, while the rendered body radius is salience-driven `NODE_RADIUS(6) × (1 + s×1.6)` → up to `6×2.6 = 15.6` plus the selection ring gap (`nodeSprites.ts:174–176, 229–231`). High-salience neighbours collide at 18 but draw at ~15.6, so visually they never touch yet the solver keeps a 36-unit gap; low-salience nodes draw at 6 but are held 36 apart — sparse. More importantly the collide radius does not track the sprite, so dense clusters of large nodes get a constant-radius collision that fights link distance (40) and produces low-amplitude residual shuffling near the `MOVE_EPSILON=0.4` gate. `forceCollide` should be radius-per-node = `nodeRadius(node)+pad`.

**R5 — `MOVE_EPSILON` gate suppresses *render*, not *simulation* (LOW-MED).** `frameMoved()` (`fieldAssembly.ts:670–684`) skips the heavy per-frame render when max per-node motion < 0.4, but the sim keeps ticking until `alpha < ALPHA_MIN` (`forceLayout.ts:321`). Between "motion below 0.4px" and "alpha below 0.001" the sim can run many more ticks producing sub-epsilon jitter that is correctly *not rendered* — but if any single node crosses 0.4 (e.g. a far island still drifting under `distanceMax=500` clipping) the whole frame re-renders. The gate is all-or-nothing per frame, so one twitchy node un-gates the entire field. Obsidian-grade renderers freeze the sim itself on a low-movement *velocity* threshold (settle-then-stop), not just gate the draw.

**R6 — `distanceMax=500` charge clipping can leave disconnected islands drifting (LOW).** `CHARGE_DISTANCE_MAX=500` (`forceLayout.ts:86`) means nodes >500 world units apart exert zero repulsion on each other. A disconnected component pushed outside 500 stops being repelled and drifts only under its own internal forces and the weak `center=0.06` gravity — it can wander slowly for many ticks (feeding R5). The research recommended ~400–500 to stop islands flying off, but combined with a weak center it can also under-constrain them.

**R7 — no real drag-to-pin gesture (control-fidelity gap, not flicker).** The ADR and code comments claim "immediate drag-to-pin" (`forceLayout.ts:9`), but `PointerGestures` (`camera.ts:167–198`) treats *every* pointer-down+move as a **camera pan** — there is no node-grab branch. Pinning only happens via the `set-pinned` command (`fieldAssembly.ts:473–481`) driven from elsewhere (pins store), never from a canvas drag. `setPinned` reheats to 0.1 (`forceLayout.ts:398`). The Obsidian-parity interaction (grab a node, it follows the cursor with `fx/fy` while the field reflows at a held alphaTarget, release re-cools) does not exist.

## Obsidian / d3-force reference model

**Obsidian's force model** is a d3-force-style simulation rendered on PixiJS/WebGL. Its four user sliders map cleanly onto d3-force (confirmed by Obsidian Help and the prior research): **Center force** = per-node gravity toward origin (`forceX(0)+forceY(0)` strength, *not* `forceCenter` which only translates the mean); **Repel force** = `forceManyBody` negative strength; **Link force** = `forceLink` spring strength; **Link distance** = `forceLink.distance` rest length. The current driver matches this mapping exactly (`forceLayout.ts:230–237`).

**d3-force v3.0.0 defaults** (confirmed from d3js.org/d3-force): `alpha=1`, `alphaMin=0.001`, `alphaDecay≈0.0228` (`1-pow(0.001,1/300)`, ~300 ticks), `alphaTarget=0`, `velocityDecay=0.4`; `forceManyBody.strength=-30`, `theta=0.9`, `distanceMin=1`, `distanceMax=∞`; `forceCollide.radius=1, strength=1, iterations=1`; `forceLink.distance=30`, `strength=1/min(deg(src),deg(dst))`, `iterations=1`; `forceX/Y.strength=0.1`. Per tick: `alpha += (alphaTarget − alpha) × alphaDecay`; forces apply scaled by alpha; `velocity *= (1 − velocityDecay)`; `position += velocity`; then pinned nodes snap `x=fx, vx=0`. Below `alphaMin` the timer halts and `'end'` fires — frozen at zero CPU.

**The interaction lifecycle that gives Obsidian its feel:**
- **Drag:** on grab, set `node.fx/fy` and `simulation.alphaTarget(0.3).restart()` — hold a *constant* low target so the field stays gently warm and reflows around the dragged node; on release clear `fx/fy` (or keep for sticky pin) and `alphaTarget(0)` to re-cool. The key is `alphaTarget` (a *held floor*), not a one-shot `alpha()` kick — the field doesn't lurch, it breathes around the interaction.
- **Graph change:** mutate `nodes`/`links` in place, reheat to a *low* alpha (~0.1–0.3), never re-init or cold-restart.
- **Warm-start:** pre-set `x/y` from the last frame before building/updating the sim and start at low alpha so the existing layout nudges instead of exploding.
- **Fit-once:** `zoomToFit()` exactly once on `'end'`, then the camera is the user's — never per tick.

**Anti-flicker techniques** mature renderers rely on (force-graph, sigma.js, Obsidian): (1) **freeze the sim on settle**, not just gate the draw — stop ticking on a velocity/movement floor; (2) **decouple sim tick from render** and pause redraw when frozen (`autoPauseRedraw`); (3) **sub-pixel jitter suppression** via velocityDecay (already 0.4) plus a movement freeze threshold; (4) **per-node `forceCollide` radius** = body radius + pad, so collision tracks the visual; (5) **held `alphaTarget` during continuous interaction** (drag, slider) rather than repeated discrete `alpha()` kicks; (6) **incremental reheat** (low alpha) on data change, never cold re-init.

## Recommended approach (stability fixes + control-fidelity additions)

**Stability fixes (address the residual flicker):**
- **S1 (R1):** route `set-data` content changes through an incremental diff → `FieldLayout.applyChanges()` (already implemented, `forceLayout.ts:406–451`) instead of full `init()+start()`. Compute add/remove node+edge sets against the prior model and reheat to a *low* alpha (~0.15). Reserve `init()` for genuine slice/scope swaps. This is the single highest-leverage change.
- **S2 (R2):** introduce an **"interaction-active" alphaTarget hold**. While a slider (or drag) is active, hold `alphaTarget` at ~0.1 and apply param changes continuously without `alpha()` kicks; on release, `alphaTarget(0)`. Debounce `set-layout-params` dispatch, or coalesce on the scene side. Add a `setParams` variant that updates forces without reheating when already warm.
- **S3 (R3):** collapse the double-init on mount (have the `set-data` path be the single connectivity initializer, and make `set-representation-mode: connectivity` a no-op when the model is already connectivity-laid-out). Fit the camera **once** — drop the instant seed-fit (`fieldAssembly.ts:825`) when the animated settle-fit will follow, or make seed-fit a cheap framing only when there is no prior camera state.
- **S4 (R4):** make `forceCollide` radius per-node from the same `nodeRadius(node)` salience function the sprite layer uses (`nodeSprites.ts:216–238`), plus a small pad — share the function across the scene/field boundary so collision tracks the visual body.
- **S5 (R5/R6):** add a **velocity/movement freeze** in the driver: when max per-node displacement stays below a threshold for N consecutive ticks, stop the sim early (fire `onSettle`) even if alpha > alphaMin. Tune `distanceMax` against a slightly stronger center gravity so islands cannot drift indefinitely.

**Control-fidelity additions (Obsidian parity):**
- **C1 (R7):** wire a real **node drag-to-pin** gesture: pointer-down on a hit node enters node-drag (set `fx/fy` to cursor each move, `alphaTarget(0.3)` held), release re-cools and optionally records a sticky pin. This is the headline missing interaction.
- **C2:** add **neighbour-focus reheat** (hover/select a node → gently warm and pull its ego network), a known parity feature the ADR flagged as opened-pathway.
- **C3:** consider exposing **collision/node-separation** and **settle damping** as advanced knobs (kept distinct from the fixed cooling schedule), and a **"freeze/unfreeze"** toggle (Obsidian's pause). Keep `alphaDecay/velocityDecay/alphaMin` fixed per the `force-layout-cooling-is-fixed-never-exposed` candidate rule.

## Open questions for the ADR

- **Incremental vs re-init boundary:** what exactly distinguishes a "content delta" (→ `applyChanges`, low reheat) from a "new slice" (→ `init`, warm reheat)? Scope/workspace swap and representation-mode change are clearly re-init; live keyframes and working-set expansions are clearly incremental. Where do filter-driven slice changes fall — visibility diff (already handled via `set-visibility`) or node-set change?
- **alphaTarget-hold seam:** does the "interaction active" state belong in the driver (a `beginInteraction()/endInteraction()` pair) or in the assembly (which already knows about pointer gestures)? It must serve both slider-drag and node-drag.
- **Drag-to-pin vs camera-pan disambiguation:** pointer-down on a node body → node drag; on empty canvas → camera pan. Does this change the `PointerGestures` contract (`camera.ts`), and how does it interact with the existing select/open/context gestures and the 4px drag threshold?
- **Collision radius sharing:** `nodeRadius()` lives in `nodeSprites.ts` (a render concern); the driver is framework-free and radius-agnostic by design. Does the seam pass a `radiusOf(id)` callback into `init/applyChanges`, or does the assembly own a per-node radius map it hands to the driver?
- **Settle-freeze threshold:** a movement-based early freeze risks freezing a slow-converging large island prematurely. What threshold/dwell (N ticks) is safe across 12–300 node counts, and should it scale with node count?
- **Scope:** does this remain connectivity-only (per the parent ADR's D10 fence), or do the drag-to-pin and freeze improvements extend to lineage/semantic (currently deterministic, solver-stopped)?

## References (files, rag hits, web sources with versions)

**Files (file:line):**
- `frontend/src/scene/field/forceLayout.ts` — driver: cooling (73–75), reheat alphas (77–80), forces (217–238), collide radius fixed 18 (87,198), frame loop + freeze (303–327), NaN snapshot (330–349), `setParams` reheat 0.3 (372–380), `setPinned` reheat 0.1 (387–403), `applyChanges` incremental (406–451), `start` reheat (285–291), warm-start threshold (274–277).
- `frontend/src/scene/field/fieldAssembly.ts` — `MOVE_EPSILON=0.4` (40), `dataSignature` skip (60–65, 413–414), `onPositions`+`frameMoved` gate (181–214, 670–684), settle-fit once (219–224), `applyModelToLayers` reseed init+start+double-fit (753–826, esp. 819–825), `set-layout-mode` init (546–576), `applyRepresentationMode` connectivity init (605–652), `set-pinned` (473–481).
- `frontend/src/app/stage/AlgorithmPanel.tsx` — `applyParams` on every onChange (109–113), slider rows (196–235), `LAYOUT_DEFAULTS` re-export (25).
- `frontend/src/app/stage/Stage.tsx` — `merged` useMemo (306–), `set-data` effect on `[merged,...]` (342–350), `set-representation-mode` effect (357–362), expansion signature (301–305).
- `frontend/src/scene/field/camera.ts` — `PointerGestures` (167–224): pointer-down+move = camera pan only, **no node-drag branch** (173–190); `animateTo` lerp (303–338).
- `frontend/src/scene/field/nodeSprites.ts` — `NODE_RADIUS=6`, `SALIENCE_RADIUS_MAX=2.6` (174–176), `nodeRadius()` salience sizing 6→15.6 (216–238) — the function collision should share.
- `frontend/src/scene/field/circularLayout.ts` — alt circular layout (full).

**Prior campaign:**
- `[[2026-06-15-dashboard-node-graph-stability-adr]]` — D1–D10, codify candidates `scene-render-work-is-gated-on-the-layout-clock`, `force-layout-cooling-is-fixed-never-exposed` (neither promoted yet).
- `[[2026-06-15-dashboard-node-graph-stability-research]]` — D1–D11 inventory, Obsidian/d3-force reference, parameter table. Note its own caveat: the 20 prior layout tests "never drive the live `onPositions` loop" — the residual surface is the live driving loop, still under-tested.
- `[[2026-06-15-dashboard-node-graph-stability-plan]]` — 14/14 steps closed; verification criteria were "settles and freezes" + "no per-frame snap", which the residual flicker (transient reheats on churn/interaction) does not contradict — explaining why it shipped green yet still flickers.

**Web sources (versions):**
- d3-force **v3.0.0** simulation API — d3js.org/d3-force/simulation (alpha=1, alphaMin=0.001, alphaDecay≈0.0228=1−pow(0.001,1/300), alphaTarget=0, velocityDecay=0.4; tick()/restart()/stop()/on('tick')/on('end'); `alphaTarget(0.3).restart()` drag reheat; fx/fy pin snaps x=fx,vx=0 each tick; phyllotaxis seed initialAngle=π(3−√5)).
- d3-force **v3.0.0** forces — d3js.org/d3-force/many-body (forceManyBody strength −30, theta 0.9, distanceMin 1, distanceMax ∞; jiggle 1e-6 for coincident nodes); forceLink (distance 30, strength 1/min-degree), forceCollide (radius 1, strength 1), forceX/Y (strength 0.1).
- Obsidian graph view force model — obsidian.md/help/plugins/graph and Obsidian forum (Center/Repel/Link force + Link distance map to forceX-Y gravity / forceManyBody / forceLink strength / forceLink.distance; PixiJS render).
