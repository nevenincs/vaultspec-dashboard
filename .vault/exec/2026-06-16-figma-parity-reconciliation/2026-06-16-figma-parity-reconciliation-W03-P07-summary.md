---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---




# `figma-parity-reconciliation` `W03.P07` summary

Phase W03.P07 rewrote the scene foundation - the headline custom node-connection
canvas - as a faithful translation of the binding graph frames, driven through the
preserved and frozen `SceneController` contract and reading every scene token as
literal hex. All six Steps (S41 to S46) are closed. The GPU substrate, the
category-circle node sprites, the category-colour read path, the engine-served
salience sizing, the flat-grey edge mesh, and the single scene token-read seam were
each rebuilt cleanly over the regenerated literal-hex foundation tokens; the work is
render-only and moved no graph compute, widened no seam union, and changed no
LOD/ceiling semantics.

- Modified: `frontend/src/scene/field/pixiField.ts` (S41)
- Modified: `frontend/src/scene/field/nodeSprites.ts` (S42)
- Modified: `frontend/src/scene/field/categoryColor.ts` (S43)
- Modified: `frontend/src/scene/field/salienceEncoding.test.ts` (S44)
- Modified: `frontend/src/scene/field/edgeMeshes.ts` (S45)
- Modified: `frontend/src/scene/field/tokenReads.ts` (S46)

## Description

S41 rewrote `pixiField.ts` as the clean GPU substrate for the binding graph/Hero
connection-field treatment: the Pixi Application, its warm paper ground, and the
camera-driven world container under which the sprite, edge, and overlay layers parent.
The field ground reads the `--color-canvas-bg` scene token as literal hex per theme
(resolvable by getComputedStyle with no var() chain), the stale `0xfaf9f7` fallback was
corrected to the live light-theme `0xfdfaf6`, and the data-theme MutationObserver was
lifted into a private `watchTheme` helper so the ground stays synced on a theme flip.
The file is documented as the renderer side of the frozen SceneController seam - it
widens neither union, receives data only via the forwarded command channel, and never
fetches or reaches into the stores layer.

S42 rewrote `nodeSprites.ts` faithful to the binding graph/Node-items frame: a plain
category-coloured filled circle sized by the engine-served salience, a clean meta-size
label below, and exactly three states (default, selected accent ring, filtered-out
fade). The default body now reads crisp at full opacity - the per-age freshness dim was
deliberately removed from the disc as a fidelity correction (it muddied the clean
instrument register and competed with the three-state model), surviving as the pure
exported `freshnessAlpha` helper for off-canvas recency consumers. The single surviving
on-canvas status treatment (circle-level ghost desaturation for retired/archived/
superseded nodes) was preserved via a `ghostFloor` helper, with full status data still
flowing off-canvas. The entire exported API contract was preserved so every consumer and
test binds unchanged.

S43 rewrote `categoryColor.ts` to own only the kind-to-`--color-scene-category-<category>`
token-name mapping, routing every read through the shared `tokenReads` `cssColorNumber`
seam. The literal-hex contract is stated explicitly: the eight category tokens are
emitted as flat `#rrggbb` per theme because getComputedStyle does not walk a var() chain
for a custom property, so the token must never be a var() alias. The eight-category type,
the doc-type folding rules, and the unknown-to-code in-family fallback were preserved so
no node ever renders uncoloured.

S44 rewrote `salienceEncoding.test.ts` to pin the circle salience sizing as the
engine-served degree-of-interest encoding: salience in [0,1] is the size driver,
monotonic for every species, capped at the documented band, and superseding
member-count. The salience source is framed as the engine CPU degree-of-interest
projection, keeping the size encoding render-side over an engine-served scalar
(graph-compute-is-cpu). One spec-derived clamp assertion was added (an out-of-band
salience clamps to [0,1]), derived strictly from the documented band, never copied from a
run.

S45 rewrote the `edgeMeshes.ts` treatment to read as the binding graph/Hero thin flat-grey
node-connection field: every group draws the single uniform `--color-scene-rule` grey
(literal hex per theme) at a low, near-uniform opacity behind the nodes, so the canvas
reads as clean category circles on a faint connective mesh rather than a coloured web.
The per-treatment alpha was brought near-uniform so the soft haze never blooms brighter
than the hairline rule lines. The full exported API and the proven static-topology
buffer machinery were preserved (the tier DATA and per-treatment GEOMETRY are kept for
off-canvas consumers; only the resolved tint flattens to the single grey) - a clean
retreatment over the tightly-pinned contract, not a destabilising rewrite.

S46 rebuilt `tokenReads.ts` as the single scene token-read seam over the regenerated
literal-hex foundation, documenting that the scene-read tokens are emitted as flat
`#rrggbb` into the generated colors region of the stylesheet, enumerating the exact
scene-read subset, and stating the literal-hex defensive contract on `cssColorNumber`
(a non-hex value falls through to the caller's fallback rather than mis-painting). Both
exports' signatures and runtime behaviour were preserved byte-for-byte so the out-of-scope
consumers (`minimapLayer.ts`, `overlayLayer.ts`) and the in-scope ones bind unchanged.

## Verification

Each Step shipped its own commit and passed the scoped gate - eslint exit 0, prettier
--check clean, and project tsc -b exit 0 - with the dependent scene suite green at each
step (the cumulative S46 run was 92/92 across tokenReads, categoryColor, edgeMeshes,
nodeSprites unit and draw, salience-encoding, field-assembly, minimapLayer, and overlays).
The aggregate frontend gate was not used as the green signal during the phase because a
concurrent scene agent carried live, untracked scorecard WIP under the same directory;
scope was isolated and confirmed clean on each touched file plus the scene tests.

Figma MCP reads of the binding frames were not reachable from the executor session (the
plugin tools were not exposed and the local capture was stale against the retired seed
file), so the phase proceeded on the documented ADR fallback: the current scene, already
restyled toward the binding frames this cycle, as the faithful base, rewritten cleanly on
the frozen SceneController contract and the new literal-hex foundation.

The W03 wave review returned REVISE, carrying one HIGH-1 finding (an orphaned evidence
HoverCard surfaced in the P08 hover-card work) plus the P08/P09 carry-forwards; the HIGH-1
remediation has since landed gate-green. P07 itself introduced no CRITICAL or HIGH
findings.
