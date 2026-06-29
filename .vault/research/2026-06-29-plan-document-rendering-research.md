---
tags:
  - '#research'
  - '#plan-document-rendering'
date: '2026-06-29'
modified: '2026-06-29'
related:
  - "[[2026-06-29-plan-document-rendering-adr]]"
---

# `plan-document-rendering` research: `plan document rendering, metadata and counting`

The markdown reader renders plan documents as plain GFM with no plan-specific treatment
and no derived metadata, and the right-rail step-tree rollups are computed in the frontend.
This research grounds how plans are served and rendered before deciding the design, and
what plan metadata the engine already exposes versus what must be added.

## Findings

- **Reader has no plan treatment.** The reader renders a plan body through react-markdown +
  GFM; task-list items are native disabled checkboxes styled flush, distinguished from other
  docs only by the `plan` eyebrow category. No summary, no structure, no progress.

- **Plan structure data already exists, but rollups are frontend-derived.** The engine's
  plan-interior route serves the full Wave -> Phase -> Step tree with per-step `done`. The
  frontend `derivePlanInteriorView` then computes per-wave/phase rollups client-side
  (`rollupSteps`/`sumRollups`) over that served tree. The plan-interior tree is BOUNDED by a
  node ceiling that truncates large plans; the descent already tracks the true total even
  for dropped branches, but the wire carries no rollup or count, so the client rollup is an
  undercount the moment the interior truncates. This is also a
  `display-state-is-backend-served-not-frontend-derived` violation (a displayed count
  recomputed in the frontend).

- **A single completion authority already exists.** The plan completion class
  (not-started / in-progress / finished) is derived from a plan's checkbox progress by one
  function backing the plan-state filter vocabulary — but it is exposed only as a vocabulary
  facet, not per-document. Reusing it for a per-plan summary keeps one classifier.

- **The kit covers the card.** The centralized kit already ships a card surface, a progress
  track, badges, and a status dot; the right-rail step tree owns a done/open check
  vocabulary (filled disc vs hollow ring). The reader should compose these, not hand-build.

- **Attach-point options.** A per-plan summary could attach to the content route, a new
  endpoint, or the existing plan-interior response. The plan-interior projection is the one
  place that already walks the full tree under the budget, so serving rollups + a summary
  there simultaneously makes the right-rail rollups engine-authoritative — the strongest
  option. The content route stays a pure body/frontmatter projection.

- **Step rendering options.** Restyle the authored task-list in place (faithful to the body,
  no extra data) versus replace it with the structured interior tree (richer, diverges from
  the document). In-place restyle was preferred for a reader that mirrors the document.
