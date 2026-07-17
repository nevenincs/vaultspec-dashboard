---
tags:
  - '#exec'
  - '#create-panel-hardening'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S06'
related:
  - "[[2026-07-14-create-panel-hardening-plan]]"
---

# Preserve the create draft across dismiss and reset it only on successful create, with store unit tests

## Scope

- `frontend/src/stores/view/createDocChrome.ts`

## Description

- Add the preserving `close` action to the chrome store: every dismiss path (Escape, backdrop, Cancel, close button, keymap toggle-close) closes and clears the transient error and one-shot focus flag while KEEPING feature/type/title/related; export `closeCreateDocDialog`.
- Keep `reset` as the successful-create path only; the panel routes onClose/Cancel through the preserving close and resets only on a created receipt.
- Reopen restores the preserved draft at stage 1.
- Unit tests: dismiss preserves and clears the error; toggle-close preserves; reset wipes; reopen-restores-at-stage-1.

## Outcome

Closes escape-discards-draft-no-confirm (MEDIUM) per the ADR's preserve-not-confirm decision. 18 store tests green.

## Notes

The two prior tests asserting close-resets were rewritten to the new contract (they documented the data-loss behavior the audit condemned).

## Review addendum

Recorded judgment (review LOW): the link-seed key survives dismissal, so
reopening the SAME feature+type after the corpus gains a new upstream
document keeps the preserved pre-fill rather than re-seeding — the
preserve-draft policy deliberately wins over freshness; the add-link field
makes the newer stem one commit away.
