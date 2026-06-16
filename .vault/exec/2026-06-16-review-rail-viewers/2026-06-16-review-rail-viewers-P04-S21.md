---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S21'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---




# Render the reader degraded, empty, and error states from the tiers-derived content selector

## Scope

- `frontend/src/app/viewer/MarkdownReader.tsx`

## Description

- Render the reader's loading, errored, degraded, empty, and truncated states from the tiers-derived ContentView the stores layer supplies — the reader fetches nothing and reads no raw tiers block.
- Show an honest truncation notice over the served prefix when the body was byte-capped.

## Outcome

The reader's states derive from the content view; the component test covers the loading, error, and structural-degraded states.

## Notes

None.
