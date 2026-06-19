---
tags:
  - '#plan'
  - '#graph-backend-unification'
date: '2026-06-19'
modified: '2026-06-19'
tier: L3
related:
  - "[[2026-06-19-graph-backend-unification-adr]]"
---

# `graph-backend-unification` plan

Switch all graph rendering to the three.js field and remove the Cosmos and PixiJS backends, in four safety-sequenced waves.

## Description

This plan executes the `graph-backend-unification` ADR: make the three.js +
d3-force field the single live graph surface and remove the Cosmos
(`@cosmos.gl/graph`) and PixiJS (`pixi.js`) backends. The work is four sequenced
waves, safety-first (cut over and verify before any deletion). Canonical Step
rows are added per wave through the `vaultspec-core vault plan` CLI as each wave
is executed, grounded in the migration recon (the exact pixi-only delete-list,
the `SceneFieldRenderer` parity blockers, the timeline reintegration scope, and
the dependency audit), rather than enumerated speculatively up front.

## Steps

Wave intents are fixed below; the CLI-managed Step rows under each Wave are added
just-in-time as the wave executes, grounded in the recon reports.

W01 - Cutover and verify. Flip `createDashboardScene` to return the three.js
field, close any `SceneFieldRenderer` parity gaps the recon surfaces (commands
Cosmos handled that three.js does not yet), and verify the stage, timeline, and
graph lab all run live on three.js. Cosmos and Pixi remain in the tree as a
fallback through this wave.

W02 - Gradient edges and timeline. Make gradient edge rendering the default in
the three.js field, and reimplement whatever the timeline needs on three.js per
the recon.

W03 - Rip-out. Delete the Cosmos and Pixi fields and their pixi-only helper
stack, remove `@cosmos.gl/graph` and `pixi.js`, promote `three`, `d3-force`, and
`culori` to runtime dependencies, prune any now-dead `d3-*` deps, and strip the
cosmos-specific seam surface (the `set-cosmos-config` command and cosmos config).
One committed chunk per coherent deletion. Runs only after W01 is verified.

W04 - User-facing controls. Design a simplified user-facing control panel (node
size and display basics) in Figma as the binding source, and implement it as an
enrolled interface distinct from the advanced developer panel.

## Parallelization

Waves are sequenced: W01 before W02 before W03, and W03 (the irreversible
deletion) is hard-gated on a verified W01. W04's Figma design may proceed in
parallel with W01-W03; its implementation follows once the control surface is
stable. Within a wave, independent file-scoped Steps may be parallelized across
agents with one owner per file to avoid the shared-tree edit race.

## Verification

The migration is complete when every Step is closed and: the stage, timeline,
and graph lab all render live on the three.js field; gradient edges are the
default; `@cosmos.gl/graph` and `pixi.js` are absent from `package.json` and
`node_modules`; no source file imports Cosmos or Pixi; the full lint gate (`tsc`
+ eslint + prettier) and the test suite pass; and the user-facing control panel
matches its binding Figma design.
