---
tags:
  - '#exec'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
body_hash: 'sha256:b4acb24037a3c013733fe3be930cc18f7c342dc44869611a840747efcbdb20d0'
step_id: 'S13'
related:
  - "[[2026-07-12-touch-selectability-plan]]"
---

# Re-enable selection on command, document-search, and semantic-search result row data text across the palette surfaces

## Scope

- `frontend/src/app/palette/`

## Description

- Add `select-text` to the title, feature-tag, and why spans of `SearchResultPill`, the shared face of the command-K semantic, document, and compact search surfaces

## Outcome

All three search surfaces gained selectable result data through the one shared pill; command rows in `CommandPalette` are chrome verbs and stay unselectable by design.

## Notes
