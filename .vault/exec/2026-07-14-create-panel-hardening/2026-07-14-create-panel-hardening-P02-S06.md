---
tags:
  - '#exec'
  - '#create-panel-hardening'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S06'
related:
  - "[[2026-07-14-create-panel-hardening-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace create-panel-hardening with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S06 and 2026-07-14-create-panel-hardening-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Preserve the create draft across dismiss and reset it only on successful create, with store unit tests and ## Scope

- `frontend/src/stores/view/createDocChrome.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
