---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S18'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---




# Render the leading YAML block through a dedicated FrontmatterHeader: tags as pills, date and modified as stamps, related as clickable wiki-links

## Scope

- `frontend/src/app/viewer/FrontmatterHeader.tsx`

## Description

- Add the FrontmatterHeader with a small total parser handling exactly the vault frontmatter shape (tags/related list sequences, date/modified scalars, inline lists), splitting the leading YAML block from the body and never throwing.
- Render tags as pills on the accent-subtle ground, dates as stamps in muted ink, and related entries as clickable wiki-links that open the target in the reader via the open-in-viewer intent.

## Outcome

Frontmatter renders as structured chrome; the component test confirms pills, date stamps, and clickable related links that fire the navigation intent.

## Notes

None.
