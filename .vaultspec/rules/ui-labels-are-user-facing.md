---
name: ui-labels-are-user-facing
trigger: always_on
---

# Every label a user sees is plain language; internal seam names never surface

## Rule

Every string the front end RENDERS to a user — control labels, tooltips, section
headings, tab names, empty/loading/degraded-state copy, error and status messages,
menu items, and any Figma UI label bound for the same surface — must be plain,
user-facing language. The code's internal vocabulary (seam/param names, physics or
graph-theory terms, backend/tier identifiers, wire field names) may live in the
source but must never appear on screen. When a control binds to an internal param,
the rendered `label`/`title` is reworded to plain language while the param key keeps
its internal name; the two are deliberately decoupled.

## Why

A data-driven instrument is only trustworthy if its words are legible to the person
reading it, not to the engineer who wired it. The graph-controls audit
(`2026-06-20`) found the live controls surfacing raw internal terms — `Repulsion`,
`Link spring`, `Salience spread`, `Edge width/opacity`, `simulation` — straight from
the `set-force-params` / `set-appearance-params` seam, alongside degraded-state copy
naming the `semantic` tier and raw `feat/…` branch strings. Each is a leak of the
implementation's vocabulary into the user's surface: "salience" and "link spring"
mean nothing to a reader, and a label that reads like a param name makes the UI feel
like a debug console, not a product. The fix is a clean split — the seam keeps
`charge`/`linkStrength`/`nodeSalienceScale`, the screen reads `Spacing` / `Grouping`
/ `Importance`. This mirrors the project's existing design discipline
(`design-system-is-centralized`, the no-jargon / Obsidian-graph framing of the design
rewrite): the centralized system owns the rendered vocabulary, and surfaces consume
it, never re-leak internals.

## How

- **Good:** a slider binds to `set-appearance-params.nodeSalienceScale`; its rendered
  label is **Importance** with the tooltip "How much a node's importance affects its
  size." The param key stays `nodeSalienceScale` in code.
- **Good:** the degraded state reads "Search is temporarily unavailable," not
  "Semantic tier offline"; a node-graph affordance says **Link** (the user-facing
  graph term, per the Obsidian reference), never **Edge**.
- **Good:** a Figma UI label and its code counterpart carry the SAME plain wording, so
  design and implementation read identically (`figma-is-the-binding-source-of-truth`).
- **Bad:** rendering `Repulsion` / `Link spring` / `Edge opacity` / `simulation`
  because that is what the param is called internally — the user is shown the wiring.
- **Bad:** surfacing a raw wire/tier/branch identifier (`feat/dashboard-timeline`,
  `temporal`, `doc_type`) as the visible label instead of a human phrase.

## Status

Active. Codified on explicit user direction at the close of the `2026-06-20`
graph-controls parity audit, alongside the engineering and design hand-off briefs that
strip the dead seams and rename the live controls to plain language. The constraint is
self-evident for a UI application but written down so reviewers can reject jargon
labels going forward.

## Source

Graph-controls parity audit (`2026-06-20`): the live `graphControlsChrome.ts`
presentation strings and the scene degraded-state copy carried internal seam/physics
terms onto the user surface; the codified label set reworded every one. Sibling rules
`design-system-is-centralized`, `figma-is-the-binding-source-of-truth`,
`views-are-projections-of-one-model`.
