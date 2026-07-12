---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S17'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# Render and guard tests: affordance visibility per viewport class, action-plane enrollment, and orphaned-comment rendering

## Scope

- `frontend/src/app/viewer`

## Description

- Add pure unit tests for the plugin (slugging determinism/collision, ancestor-inclusive path stamping, stack reset), the section-anchor parse (heading sections, fenced-code skipping, ATX rules mirroring the engine), and the H1-lift anchor index.
- Assert `gitBlobOid` against git's own well-known object ids (the empty blob and `hello\n`), proving the digest equals the engine's `blob_oid` and the backend's fence byte-for-byte.
- Add a live-wire test proving a selector built by the reader's own math anchors on the real engine: parse the served body, build the selector with the shared compose-box builder, create the comment over the real wire, assert it lists as anchored, and delete it in a finally.
- Add happy-dom render tests driving the presentational reader with a plane-shaped prop: affordance visibility per viewport class (matchMedia stub), the count chip from served comments, the thread lifecycle (open, compose creates a section-anchored selector, resolve), and orphaned rendering with an explicit re-anchor.
- Add unit tests for the action-plane enrollment (one stable id, one runnable lane, stable id across label reshaping) and the section↔comment narrowing.
- Add tests for the review-polish duplicate-section handling: a unit test that a duplicated full heading path is flagged ambiguous in the anchor index, and a render test that the reader blocks composing on such a section with an honest hint and never calls create.

## Outcome

Thirty-five tests across the six viewer files pass; the full viewer suite (eighteen files, one hundred and one tests) stays green. The render tests also prove the react-markdown integration end to end — the plugin's `hProperties` reach the heading component, so the affordance actually mounts.

## Notes

The reader is dumb presentational chrome, so the render tests supply the comment plane as a prop rather than mocking the engine wire; the wire that backs those callbacks is exercised end to end in the live test. The content-hash crux — how a new comment's selector gets its hash — is answered concretely: it is computed client-side the SAME way the backend does (git blob oid of the raw section bytes), and that is verified against the real engine, not asserted from a copied value.

The fixture vault has no `##` subheadings (only H1s, which the reader lifts into the DocHeader), so the live end-to-end reader-UI compose was not driven through the DOM against the engine; instead the live test exercises the identical `sectionSelectorForBlock` code path the compose box uses, and the render tests drive the full UI lifecycle with a plane prop. Modifying the shared fixture was avoided because several live suites read those documents.
