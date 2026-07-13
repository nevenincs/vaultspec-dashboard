---
tags:
  - '#plan'
  - '#keyboard-action-correctness-review'
date: '2026-07-02'
modified: '2026-07-12'
tier: L2
related:
  - '[[2026-07-02-keyboard-action-correctness-review-audit]]'
  - '[[2026-06-19-keyboard-action-system-adr]]'
---

# `keyboard-action-correctness-review` plan

### Phase `P01` - Copy actions (the user-visible cure)

Make copy work on non-secure http origins via an execCommand fallback, surface success/failure, and route the bespoke viewer buttons through the verb.

- [x] `P01.S01` - KAR-002/003: implement the promised hidden-textarea execCommand(copy) fallback in writeClipboard so copy fires within the user gesture and works on non-secure http origins (navigator.clipboard undefined off localhost); `frontend/src/stores/view/clipboardActions.ts`.
- [x] `P01.S02` - KAR-004: surface the copy {ok} result via the context menu's existing aria-live region (success + failure feedback) instead of discarding it; `frontend/src/app/menu/ContextMenuHost.tsx`.
- [x] `P01.S03` - KAR-005: route the bespoke CodeViewer + MarkdownReader copy buttons through the dispatchCopy verb so the fallback + feedback reach them; `frontend/src/app CodeViewer.tsx + MarkdownReader.tsx`.

### Phase `P02` - Action reliability

Consume menu-fired ops outcomes, make the dispatch logging seam promise-aware, and guard the default chord set against conflicts.

- [x] `P02.S04` - KAR-006: menu-fired ops verbs (relate/autofix/archive) consume the dispatch promise - branch on the business-refusal envelope, catch transport failures, invalidate cache on success, and surface feedback via the palette ops-message machinery; `frontend/src/app/menu + stores/view/opsActions`.
- [x] `P02.S05` - KAR-007: make loggingMiddleware promise-aware (catch-log-rethrow on async handler rejections, not just sync throws); `frontend/src/platform/dispatch/middleware.ts`.
- [x] `P02.S06` - KAR-008: guard test asserting the assembled default chord set is conflict-free for same-specificity pairs (global-vs-canvas shadowing is deliberate); `frontend/src/platform/keymap/registry.ts + guard test`.

## Description

## Steps

## Parallelization

## Verification
