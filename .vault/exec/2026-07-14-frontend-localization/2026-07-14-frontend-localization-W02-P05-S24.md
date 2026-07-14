---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S24'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize left-rail shortcuts

## Scope

- Eight left-rail keybindings and their same-ID action builders
- The command-palette collapse action composition
- Common and document catalog messages, policy, and alternate-locale resources
- Real-runtime keybinding and action parity tests
- The exact localization scanner baseline

## Description

- Replace eight legacy keybinding labels with canonical typed document action descriptors.
- Replace the rail-specific group heading with the shared Navigation shortcut group.
- Reuse the same exported descriptor objects in every same-ID action builder.
- Extract the cycle action builder so the keybinding resolver does not author separate copy.
- Compose the command-palette collapse command from the shared action builder.
- Replace browser-mode, Vault/Code, left-rail, facet, and title-case wording with clear user concepts.
- Preserve all action IDs, chords, contexts, order, sections, icons, runs, and dispatch behavior.
- Retain only the three separately scheduled dynamic browse, sort, and reset-sorting action bridges.
- Remove 18 superseded exact bridge entries from the localization baseline.

## Outcome

Left-rail shortcuts, their live actions, and the shared collapse command now use one catalog-owned wording source. The interface speaks in document, file, tree, filter, and navigation concepts without exposing internal surface or mode names.

Focused verification passed 41 tests across five files. TypeScript, ESLint, formatting, the localization scanner, and diff checks passed. The complete frontend lint recipe also passed. The scanner baseline decreased from 1,476 to 1,458 exact findings: legacy keybinding entries decreased from 50 to 41 and legacy action entries decreased from 130 to 121.

## Notes

Terra implemented the bounded producer migration from its read-only rollout map. Scanner reconciliation removed one additional command-palette collapse bridge made obsolete by the required shared-builder composition. Sol independently reviewed and approved the final patch with no findings.
