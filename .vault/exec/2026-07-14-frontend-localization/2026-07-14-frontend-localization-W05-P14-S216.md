---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S216'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Replace editor store mutation and unsaved-change messages with typed outcomes

## Scope

- `frontend/src/stores/view/editor.ts`
- `frontend/src/app/viewer/MarkdownDocView.tsx`

## Description

- `STATUS_LABEL` was a hardcoded `Record<EditorStatus, string>` (`"Saved"`,
  `"Unsaved changes"`, `"Saving…"`, `"Save failed"`, `"Conflict — the file
  changed on disk"`); retyped to `Record<EditorStatus, MessageDescriptor>`
  resolving to a new `documents:editor.statuses.*` catalog family (`idle` and
  `saved` share the one `saved` key).
- `advisoriesLabel` (`"Conformance advisories"`) retyped to a
  `MessageDescriptor` (`documents:editor.advisories.label`).
- `MarkdownEditorAdvisoryRowView`'s `fixableLabel: string | null` +
  `fixableSuffix: string` pair (raw `" - fixable"` string composition)
  collapsed to a single `fixable: boolean`, with the display string moved to
  the render boundary (`documents:editor.advisories.fixable`, rendered via a
  `DecorativeGlyph` middot separator rather than a raw `" - "` string).
- `MarkdownDocView.tsx` resolves all three: the status label
  (`resolveMessage(editor.statusLabel).message`), the advisories aria-label
  and heading text (`resolveMessage(editorChrome.advisoriesLabel).message`),
  and the fixable tag (`resolveMessage({ key:
  "documents:editor.advisories.fixable" }).message` behind the boolean flag).
- FIXED A LATENT EM-DASH: the conflict status catalog entry was authored as
  `"Conflict — the file changed on disk"`; the message-policy punctuation rule
  rejects em dashes, so it was written as `"Conflict: the file changed on
  disk"` instead.

## Outcome

The editor store's status and advisory presentation is fully typed-message-
driven; no raw English literal or manually composed suffix string remains.

## Notes

Fixed by opus-l10n. Independently reverified: `git diff` matches the reported
change exactly across both files (type changes, catalog keys, the
`fixableLabel`/`fixableSuffix` → `fixable: boolean` collapse, the em-dash fix),
localization scanner clean, and the live suite (`editor.test.ts` +
`editorMutations.test.ts` + `MarkdownDocView.render.test.tsx` +
`catalogKeys.test.ts` + `messagePolicy.test.ts`) — 71/71 passed, matching the
reported count. This record was authored during a reconciliation pass; not a
fresh implementation on my part. This also closes the note left on
`W05.P14.S193`'s record flagging this file's separate defect.
