---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S14'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# Author the heading-path block-identity remark plugin producing stable slug ids with bounded per-block work

## Scope

- `frontend/src/app/viewer/remarkBlockId.ts`

## Description

- Author `remarkBlockId`, a pure remark transform that walks mdast headings in document order and stamps each with its ancestor-inclusive heading path and a slug id through `hProperties` (`data-comment-path`, `data-block-id`, `id`).
- Track the ancestor stack with the shallower-pops-deeper discipline that mirrors the engine's `parse_heading_sections`, so a stamped path matches the section selector the backend resolves.
- Disambiguate repeated heading paths with an occurrence-indexed slug; degrade an empty slug to a stable `section` sentinel.
- Add pure unit tests for the slugging (determinism, unicode, collision fallback) and the path/id stamping (ancestor reset, duplicate disambiguation) over a hand-built tree — no DOM.

## Outcome

Every heading the reader renders now carries a stable ancestor-inclusive block identity the reader resolves against the raw-body anchor index. Work is bounded (O(depth) per heading); no fetch, no document read. Unit tests pass.

## Notes

The slug doubles as a stable fragment anchor a later copy-link verb can target. The plugin is deliberately independent of the raw section bytes — the content-hash math lives in the shared section-anchor helper, keeping the plugin pure and trivially testable.
