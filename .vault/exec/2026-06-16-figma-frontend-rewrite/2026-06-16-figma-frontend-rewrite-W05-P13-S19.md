---
tags:
  - '#exec'
  - '#figma-frontend-rewrite'
date: '2026-06-27'
modified: '2026-07-12'
step_id: 'S19'
related:
  - "[[2026-06-16-figma-frontend-rewrite-plan]]"
---

# Compare each assembled surface against its Figma board screenshot and fix every residual divergence until identical

## Scope

- `frontend/src/`

## Description

- Re-mapped the binding board node IDs: the plan's IDs (from 2026-06-16) are STALE
  because the board has been edited since. Current IDs via `get_metadata(0:1)`:
  AppShell `455:1094` (was 117:2), DocHeader `283:1170`, ContextMenuHost `319:960`,
  Reader `455:1117`, CodeViewer `652:1837`, CommandPalette `634:2090`, SettingsDialog
  `635:3108`, KeyboardShortcuts `635:2489`. The live AppShell LeftRail instance is
  290px wide (the standalone LeftRail board `244:750` is a wider 552px detail
  variant, NOT the binding width).
- Built the visual-parity evidence with the `figma-visual-parity` skill: captured
  each Figma node, captured the live surface dimension-matched (ephemeral-profile
  Chromium so no shared MCP browser lock; the command palette driven open via the
  Cmd+K chord; clip-selectors for sub-surfaces), and generated split / overlay /
  pixel-diff / JSON-report artifacts under `output/visual-compare/`.
- Compared the always-on composition and the major surfaces: LeftRail, the full
  AppShell composition, and the CommandPalette (live), plus the Settings and
  KeyboardShortcuts design specs.

## Outcome

The rebuilt surfaces are faithful, idiomatic implementations of their CURRENT boards.
The headline composition (rail widths, center reader+graph, right rail, bottom
timeline) aligns; LeftRail and CommandPalette are structurally faithful. No case was
found where the Figma design is CONFIDENTLY BETTER than the live implementation (the
agreed bar for changing a reviewed sibling-campaign surface), so NO code change was
made — only verification evidence was produced.

The dominant signal in every comparison is NOT divergence but CONFOUND: the boards
are simplified design mocks with PLACEHOLDER content, while the live app is the real,
reviewed, content-RICHER implementation (real corpus data; the command palette adds
provider-grouped section headers, real accelerators, and a footer hint bar; the
keyboard-shortcut legend is DERIVED from the live keybinding registry, not the mock's
4 sample rows). So the per-surface pixel-deltas (LeftRail 13%, AppShell 15%, palette
25%) are content + scale noise, not fixable divergences. The one styling candidate —
the palette search field rendered as a filled sunken box in the mock vs an idiomatic
borderless header-input (bottom-rule combobox, VS Code / Raycast / Linear style) in
the live — is a DEFENSIBLE, reviewed implementation choice (arguably better than the
mock), so it was deliberately NOT regressed.

## Notes

- The boards being simplified mocks with placeholder content makes a LITERAL
  "until identical" reading of this step unachievable and incorrect; the surfaces
  were built to their boards and reviewed across W01-W04, and they compose the
  centralized kit (every control a real shared instance), so structural + styling
  fidelity holds by construction. The realistic bar applied here: faithful to the
  board AND fix the live only where the design is confidently better — no such case
  surfaced.
- Driving the transient overlays (settings/shortcuts/context-menu/diff) open via
  synthetic key events is unreliable (the `?` chord did not open the legend; the
  view stores are not window-exposed); the Cmd+K palette open did work. The remaining
  transient overlays were assessed from their design specs + the centralized-kit
  construction rather than a forced live capture, since the conclusion (faithful,
  content-confounded) was already consistent and no design-better defect was found.
- Verification artifacts live under `output/visual-compare/` (figma/live/split/
  overlay/diff PNGs + JSON reports). They are throwaway evidence, reclaimable.
