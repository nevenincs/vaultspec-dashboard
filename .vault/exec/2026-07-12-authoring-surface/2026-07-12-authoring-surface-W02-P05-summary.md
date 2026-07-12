---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# `authoring-surface` `W02.P05` summary

All four steps complete (S14-S17). Reading mode now surfaces the section-anchored comments plane (ADR D2): heading-path block identity, a right-side comment affordance (hover-revealed on pointer, always visible on compact) with a count chip, and a section thread panel with compose/edit/resolve/delete plus honest orphaned handling and explicit re-anchor. Every verb rides the one unified action plane; the reader stays dumb chrome consuming a plane the markdown doc view owns. Code review pending.

- Created: `frontend/src/app/viewer/remarkBlockId.ts`
- Created: `frontend/src/app/viewer/sectionAnchor.ts`
- Created: `frontend/src/app/viewer/readerComments.ts`
- Created: `frontend/src/app/viewer/CommentThreadPanel.tsx`
- Modified: `frontend/src/app/viewer/MarkdownReader.tsx`
- Modified: `frontend/src/app/viewer/MarkdownDocView.tsx`
- Created: `frontend/src/app/viewer/remarkBlockId.test.ts`
- Created: `frontend/src/app/viewer/sectionAnchor.test.ts`
- Created: `frontend/src/app/viewer/sectionAnchor.live.test.ts`
- Created: `frontend/src/app/viewer/readerComments.test.ts`
- Created: `frontend/src/app/viewer/ReaderComments.render.test.tsx`

## Description

The heading-path block-identity plugin (S14) stamps every rendered heading with its ancestor-inclusive path and a collision-safe slug through `hProperties`, bounded per node and mirroring the engine's section-parser ancestry so a stamped path resolves against the same selector the backend fences. The reader (S15) resolves that path to a live section through a raw-body anchor index, renders the gutter comment affordance without prose reflow (absolute inside a relative wrapper, viewport-class-switched visibility), a count chip on commented sections, and dispatches one new `viewer:comment-section` action descriptor; the markdown doc view owns the comment read and the five comment mutations and threads a plane to the reader, which fetches nothing. The thread panel (S16) composes kit atoms into a section thread (list + compose + resolve/reopen/edit/delete) and a doc-level orphaned panel that surfaces drifted comments with the typed reason in plain language and an explicit re-anchor.

The content-hash crux is resolved concretely: a new comment's selector `expected_content_hash` is computed client-side the SAME way the backend does — the git blob object id (`sha1("blob " + byteLen + "\0" + bytes)`) of the raw section bytes (heading line through the next same-or-shallower heading). The section bytes are identical whether taken from the raw document or the frontmatter-stripped body, since a section starts at its heading and every heading follows the frontmatter, so the reader parses the frontmatter-stripped body for clean ancestor paths and the hash still matches the backend's read of the raw worktree file. This is verified end to end against the live engine (a reader-built selector lists as anchored), not asserted from a copied value; `gitBlobOid` is additionally pinned to git's own well-known object ids.

## Review polish

Adversarial review verdict: APPROVED, no critical/high findings. Four polish fixes landed before commit: (1) the thread panel width is clamped to the reader pane via a container-query max-width so a reader narrower than the panel never scrolls horizontally; (2) the heading reserves right-gutter space so the always-visible count chip and affordance never overlap long heading text; (3) a document with a duplicated full heading path is detected in the anchor index — the reader blocks composing on that section and shows an honest plain-language hint rather than silently creating an orphan the backend would resolve as ambiguous; (4) the comment plane is memoized (stable empty listing, ref-stable actor bootstrap, react-query-stable mutation callbacks) so the plane context does not churn every render. Two tests were added for the ambiguous-section behavior.

## Verification

- Viewer suite green: 101/101 across 18 files, including the live-engine anchoring proof over the real `vaultspec serve` origin and the react-markdown integration proving `hProperties` reach the heading component.
- Full frontend gate green: `just dev lint frontend` exits 0 (eslint, prettier, tsc, the px scanner including the container-query unit, and the module-size ratchet). No file this phase touched is over-length.
- No test doubles for the wire: the live test rides the real engine + fixture vault. The render tests drive the presentational reader with a plane prop (not a wire mock); the wire backing those callbacks is exercised by the live test.
- Fixture vaults were not modified (several live suites read them); the fixture corpus has no `##` subheadings, so the live compose was exercised through the identical `sectionSelectorForBlock` code path rather than the reader DOM.
