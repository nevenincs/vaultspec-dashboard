---
tags:
  - '#audit'
  - '#syntax-highlighting'
date: '2026-07-06'
modified: '2026-07-06'
related:
  - "[[2026-07-06-syntax-highlighting-plan]]"
  - "[[2026-07-06-syntax-highlighting-adr]]"
---

# `syntax-highlighting` audit: `implementation review`

## Scope

Reviewed the syntax-highlighting implementation against the accepted ADR and
closed L1 plan. The audit covered `frontend/src/app/viewer/HighlightedCode.tsx`,
the `CodeViewer` reuse path, the `MarkdownDocView` edit-mode mount, the
`DiffPanel` snippet rendering path, the language resolver update, and the new and
extended tests.

## Findings

### implementation-review | low | no critical or high issues found

Status: PASS. The implementation satisfies the plan: shared token-line rendering
exists, code viewer delegates to it, Markdown edit mode mounts a highlighted
textarea without replacing the native input authority, review snippets derive a
language hint from served labels and reuse the same highlighter, and tests cover
the editor, snippet, and path-hint behavior. No engine or stores wire contract
was changed, no new fetch was added in app chrome, and the existing bounded
highlighter cache remains the only syntax-token accumulator.

## Recommendations

- Keep future typography or padding changes for the editor routed through the
  highlighted textarea component so the visible layer and input layer stay aligned.
- If source-code editing is later desired, file a separate ADR; this implementation
  deliberately keeps code files read-only.
