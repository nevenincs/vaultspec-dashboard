---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S21'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Preserve shared action composition boundaries

## Scope

- The background-menu composition boundary
- The global-tail composition boundary
- Their existing real-behavior tests

## Description

- Verified that neither composition module owns a label, status, error, disabled reason, or temporary action-presentation bridge entry.
- Kept the background menu dependent on the shared timeline and chrome action builders instead of duplicating their presentation descriptors.
- Kept the global tail dependent on the shared refresh builder instead of duplicating its presentation descriptor.
- Preserved the background action order, timeline-only prepend behavior, current graph and follow-mode evaluation, registry-derived refresh accelerator, and terminal global-tail placement.
- Left shared wording migrations with their owning steps: chrome actions in `S123`, refresh in `S146`, and timeline criteria in `S230`.

## Outcome

No production change was required. The two target modules remain presentation-neutral composition boundaries, so future catalog changes have one owner and flow to every consumer automatically.

The focused background-menu and global-tail tests passed. The complete frontend lint recipe also passed, including localization scanning and TypeScript checks.

## Notes

This is an evidence-backed no-op. It intentionally claims no localization-scanner reduction because the target modules contained no user-facing strings or temporary bridge entries to remove.
