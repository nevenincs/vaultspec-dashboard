---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-07-12'
body_hash: 'sha256:0f63932819aea0a79eeb48922f984a48874ba3dd4f6811b07987b5a37c4fe74f'
step_id: 'S20'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---

# Override fenced code rendering to delegate to the shared useHighlighter hook so reader fences and the code viewer share one tokenizer

## Scope

- `frontend/src/app/viewer/MarkdownReader.tsx`

## Description

- Override the `code` component to delegate fenced blocks to a CodeFence that uses the shared useHighlighter hook (the same tokenizer the code viewer uses), converting the Shiki HAST to React via hast-util-to-jsx-runtime; inline code spans render as a neutral token-styled span.
- Show the raw code in a neutral pre block while the grammar loads or for an unknown language (plain-text degradation, never a throw).

## Outcome

Reader fences and the code viewer share one tokenizer and one theme.

## Notes

None.
