---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S22'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Establish the typed keybinding message contract

## Scope

- The platform keybinding registry and its normalization tests
- Every current keybinding label and group producer
- Shortcut and settings compatibility projections
- The localization scanner, its fixtures, and the exact allowlist
- Constructing tests affected by the stricter registry contract

## Description

- Changed keybinding labels and groups from unrestricted strings to typed message presentations.
- Added bounded, scanner-tracked compatibility copy for existing keybinding producers.
- Required group descriptors to be static so translated text and object identity never become grouping keys.
- Normalized registry input from own data properties and rejected malformed descriptors, interpolated groups, accessors, and unbounded compatibility copy.
- Enrolled all current keybinding producers without changing IDs, chords, contexts, or visible copy.
- Kept pre-localization consumers fail closed for typed descriptors until their scheduled React-boundary resolution steps.
- Added an exact scanner rule that accepts only the canonical compatibility factory and detects aliases, namespace calls, unresolved imports, and counterfeit factories.
- Replaced touched component and dispatcher test doubles with real React state and DOM keyboard events.
- Ordered shortcut and settings consumer resolution before every descriptor-producer migration.

## Outcome

The keybinding registry can now carry validated localization descriptors while the remaining English producers are precisely inventoried. Existing shortcuts retain the same visible labels, groups, chords, IDs, contexts, and dispatch behavior.

The focused verification passed 97 tests across nine files. The complete frontend lint recipe passed, including localization scanning, formatting, TypeScript, token, and module checks. The scanner now records 1,499 exact findings, including 50 keybinding compatibility entries. The net increase of six findings is the newly tracked group copy; no new visible copy was added.

## Notes

Terra performed the mechanical producer enrollment. Sol designed and independently approved the registry and scanner contract, then approved the integrated patch after the consumer prerequisite order was made explicit.
