---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S15'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# Wrap rendered headings with the right-side comment affordance and count chip, hover-revealed on pointer and always visible on compact, dispatching one new comment action descriptor

## Scope

- `frontend/src/app/viewer/MarkdownReader.tsx`

## Description

- Add `remarkBlockId` to the reader's remark pipeline and rework the plain heading overrides into a `BlockHeading` that resolves the stamped path to a live section through the raw-body anchor index.
- Render a right-gutter comment affordance — absolutely positioned inside a relative wrapper so revealing it never reflows the prose — hover-revealed on pointer viewports and always visible on compact via `useViewportClass`, plus a comment-count chip on sections that have anchored comments.
- Author one section-comment action descriptor (`viewer:comment-section`) fired by the affordance; it is NOT palette-enrolled because a section verb needs its section payload (a standing palette command has no section context).
- Thread the served comments, bound mutations, and actor state from the smart parent through a reader comment context, plus derive the heading anchor index from the raw served body and add a doc-level orphaned-notes affordance. The reader itself fetches nothing.
- Wire the parent (the markdown doc view) to own the comment read and the five comment mutations and hand the reader the plane; bootstrap the shared editor actor eagerly while editing and lazily on first thread open in view mode.

## Outcome

Reading mode gains per-section comment affordances with touch, click, and keyboard parity, all through the one unified action plane. A caller that mounts the reader without a comment plane is unaffected (headings render plainly).

## Notes

Affordance visibility is exposed as a `data-affordance-visibility` attribute (hover vs always) so it is deterministically testable without computed styles. The context value carries the anchor index + viewport class; the parent supplies only the served comments + callbacks.
