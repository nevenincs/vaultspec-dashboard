---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S32'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# Add a copy-section-link verb to the heading comment affordance emitting the round-trippable stem-plus-anchor wiki-link through the shared copy-link descriptor family

## Scope

- `frontend/src/app/viewer/MarkdownReader.tsx`

## Description

- Add a "Copy section link" verb to the heading comment affordance surface, rendered as an icon action in the thread panel header (touch-reachable — the panel opens on tap — and it keeps the heading gutter to a single button).
- Build it through the shared `copyLinkAction` descriptor family (`vault-doc:copy-link`) with the heading's stamped block-identity slug as the anchor, so it emits the round-trippable `[[stem#slug]]` form and reuses the family's fallback-safe clipboard writer — no bespoke clipboard code.
- Thread the open document's stem to the reader through the comment plane so the verb can name the target; it renders only when the source is a document and the heading carries a slug.
- Tests: a render test that the header verb copies `[[stem#slug]]`, and the copy-to-follow round-trip (the emitted link resolves back to the document node id and the slug through the reader's own plugin + resolvers).

## Outcome

A reader can copy a deep link to any section from its comment affordance; the emitted `[[stem#slug]]` navigates back to that exact section on follow (S31), completing the D3 section-link loop. The verb rides the one shared copy-link descriptor, so the accelerator, menu, and this surface cannot drift.

## Notes

Placed the verb in the thread-panel header rather than a second gutter icon to keep the compact reader's heading gutter to one control (a second always-visible gutter icon would eat too much width on a phone). The copy verb reuses `copyLinkAction` unchanged — `documentLinkActions` already modelled the optional section anchor (D3), so no extension was needed.
