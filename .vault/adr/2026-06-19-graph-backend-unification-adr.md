---
tags:
  - '#adr'
  - '#graph-backend-unification'
date: '2026-06-19'
modified: '2026-07-17'
related:
  - '[[2026-06-16-graph-force-stability-research]]'
---

# `graph-backend-unification` adr: `Unify graph rendering on the three.js field; retire Cosmos and PixiJS` | (**status:** `accepted`)

## Problem Statement

The dashboard graph has carried three rendering backends behind the one
`SceneFieldRenderer` seam: a Cosmos (`@cosmos.gl/graph`) GPU field, which is the
current live surface; a PixiJS (`pixi.js`) 2D field; and a three.js + d3-force
field built and hardened over the recent reimplementation campaign. Maintaining
three renderers multiplies the surface area of every scene change, and two of
them are now redundant: the three.js field has been tested and verified robust
and usable to roughly 5000 nodes, which covers the bounded-LOD product target.
This ADR records the decision to unify on the one hardened renderer and retire
the other two, and the two rendering/UX decisions that ride with the switchover.

## Considerations

- The `SceneFieldRenderer` seam is the clean abstraction all three fields
  implement, and the live surface is chosen by a single factory
  (`createDashboardScene` in `fieldAssembly.ts`) consumed by the stage, the
  timeline, and the graph lab. The live cutover is therefore a factory flip, not
  a rewrite.
- The three.js field is the product choice for the bounded range (about 5k nodes
  and under); its current defaults are acceptable and explicitly subject to later
  revision.
- Two heavy dependencies leave the bundle: `@cosmos.gl/graph` (GPU) and
  `pixi.js`. `three`, `d3-force`, and `culori` are runtime dependencies currently
  mis-listed under dev dependencies.
- Gradient edge rendering is wanted as the default look once migrated.
- The advanced simulation controls already exist as a developer panel; users need
  a separate, simplified control surface (node size and display basics) authored
  in Figma as the binding design source.

## Constraints

- The cutover is gated on the three.js field being a true drop-in for the seam:
  any `SceneCommand` or behaviour Cosmos provides that three.js lacks is a
  blocker (under active scoping). Removal must never precede a verified cutover —
  delete only after the live surface demonstrably runs on three.js.
- Shared scene utilities (the token-read seam, the camera and hit-test helpers)
  must be distinguished from the pixi-only stack so the removal does not delete
  code the three.js field still depends on.
- The timeline mounts the same scene factory; it must keep working or be
  reimplemented on three.js.
- The dev environment's system drive is near-exhausted; the dependency purge and
  rebuilds must account for the recurring resource-exhaustion risk.

## Implementation

A high-level statement of what the three decisions commit to; the sequenced,
file-level work is carried by the implementation plan, not here.

D1 — one renderer. The three.js + d3-force field becomes the single live graph
surface for every consumer. `createDashboardScene` returns the three.js field;
Cosmos and PixiJS are then deleted entirely and their npm dependencies purged,
with `three`, `d3-force`, and `culori` reclassified as runtime dependencies. The
seam sheds its Cosmos-specific surface (the `set-cosmos-config` command and
cosmos config types) and its Cosmos-native and sigma-fallback framing.

D2 — gradient edges are the default. Edge rendering defaults to a gradient style;
the current rendering is acceptable and may receive further UX adjustment after
the migration settles.

D3 — user-facing controls via Figma. The advanced simulation controls remain a
developer surface; a simplified user-facing control panel (node size and display
basics) is designed in Figma as the binding source of truth and implemented as an
enrolled, clear, easy-to-use interface, distinct from the dev panel.

Sequencing is safety-first: flip the factory, verify every consumer live on
three.js, default gradient edges, reintegrate the timeline, and only then delete
Cosmos and Pixi and purge their dependencies — continuously, in committed chunks —
before designing and shipping the user controls. Removal is continuous but never
runs ahead of a verified cutover.

## Rationale

One renderer collapses the maintenance surface and removes two heavy GPU and 2D
backends the three.js field now supersedes for the bounded product range. The
seam makes the switch low-risk, and the prior convergence review established the
three.js + d3-force architecture as sound and idiomatic for the roughly-5k-node
target. Keeping Cosmos as an insurance backend would perpetuate the
three-renderer tax for an unbounded whole-vault overview that is explicitly out
of scope.

## Consequences

Gains: a single owned renderer, two heavy dependencies removed and a smaller
bundle, one place to evolve scene visuals, and a real user-facing control
surface. Costs and risks: the timeline and any cosmos-specific assumptions must
be migrated rather than simply dropped; a seam-parity gap would regress the live
surface, mitigated by cutting over before deleting and by scoping the blockers
first; the unbounded whole-vault GPU overview is forgone, which is accepted
because bounded-LOD is the product choice; and the dev-environment disk pressure
can break tooling mid-migration if not managed.

## Codification candidates

- **Rule slug:** `graph-renders-through-one-field-seam`.
  **Rule:** All graph rendering goes through the single three.js
  `SceneFieldRenderer` field selected by `createDashboardScene`; no second
  renderer or direct GPU/2D graph backend is reintroduced. Candidate only —
  promote after the unified renderer holds across one full cycle.
