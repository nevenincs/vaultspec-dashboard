---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S217'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Migrate right-rail keybinding definitions to shared canonical action wording

## Scope

- Right-rail keybinding production descriptors and action parity tests.

## Description

- Confirm status and changes keybindings use the canonical shell action descriptors.
- Prove each live action label is the same frozen descriptor object as its keybinding label.
- Preserve IDs, chords, context, order, execution, and multilingual resolution.

## Outcome

Right-rail actions and shortcuts share one localized descriptor for each stable action ID.

## Notes

The production migration was already present. Terra added the missing identity proof, and Sol approved the non-tautological test with no findings. Four focused tests passed.
