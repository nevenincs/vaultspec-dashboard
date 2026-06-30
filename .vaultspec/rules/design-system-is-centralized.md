---
name: design-system-is-centralized
trigger: always_on
---

# The design system is centralized: surfaces compose from it, never redefine it

## Rule

Every UI element on every surface derives from the one centralized design-system
source of truth — a base **component** instance, a bound **color variable**, a
shared **text style**, or a shared **elevation/effect style** — and never from an
ad-hoc redefinition (a hand-built button/chip/tab/switch/field, a raw hex, a loose
`fontSize`/weight, a bespoke shadow). A genuinely bespoke composite (a graph field,
a timeline lane, a diff line, a menu/command row) is allowed, but it must *compose*
those standardized atoms, not re-author the primitives it contains. A standardized
primitive that the library does not yet cover is a gap to close in the library
(add the component/variant/style), not a license to redefine it inline.

## Why

This is the design-language ADRs' token discipline (`warmth-lives-in-tokens-not-decoration`,
`themes-are-oklch-generated-from-a-token-tier`, `icons-come-from-the-two-sanctioned-families`)
generalized from color and icons to the *whole* element vocabulary. The
2026-06-16 design-system hardening pass found the failure mode directly: an audit of
the Figma source (`SlhonORmySdoSMTQgDWw3w`) showed only two real components existed and
every other primitive — tabs, chips, search fields, switches, segmented controls, list
rows, section labels, status dots, key-caps — had been hand-built ad-hoc inside each of
~24 surface frames. Ad-hoc primitives drift: the same control renders five subtly
different ways, a theme/token change reaches some copies and not others, and the
mock-vs-live and per-surface divergences the token rules exist to prevent reappear at
the component layer. Centralizing the primitives (one labelled component board, plus a
type ramp and elevation set bound to the variable tiers) makes one edit re-theme every
instance and makes "a control on screen" always mean "a real, shared definition."

## How

- **Good:** a surface needs a button/chip/tab/field/switch/toggle/slider/badge/key-cap →
  it drops an **instance** of the library component and overrides only its text/state;
  a label uses the **SectionLabel** component or a shared **text style**; a panel uses a
  shared **elevation** style; a color comes from a **bound variable**, never a literal.
- **Good:** the library lacks the exact primitive (e.g. an N-segment control, a
  glyph-swappable icon button) → add the component/variant/style to the centralized board
  first, then instance it on the surface. Bespoke composites (graph, timeline, diff,
  menu rows) stay bespoke but are built *from* these atoms.
- **Bad:** hand-drawing another rounded-rect "button", typing a raw `#hex` or a loose
  `fontSize: 13` weight, or copy-pasting a chip/tab into a frame — that re-creates the
  per-surface ad-hoc drift this rule (and the token-tier rules) exist to prevent.

## Status

Active. Established by the 2026-06-16 design-system hardening goal: the centralized
component board (Button, IconButton, Tab, Chip, SearchField, SectionLabel, StatusDot,
Card, ListRow, Switch, SegmentedToggle, Segment, ProgressBar, Slider, Divider, Badge,
Kbd), the 7-step text-style ramp, and the 3 elevation styles now exist alongside the
color-variable tiers; the standard primitives across the rail, Settings, Command
palette, Context menu, Filtering, Keyboard-shortcuts, and graph controls were converted
to instances, and the hand-built kit was retired.

## Source

2026-06-16 design-system hardening pass over the Figma source `SlhonORmySdoSMTQgDWw3w`
(audit: only Button/IconButton were real components; everything else hand-built per
frame). Sibling rules `warmth-lives-in-tokens-not-decoration`,
`themes-are-oklch-generated-from-a-token-tier`,
`icons-come-from-the-two-sanctioned-families`,
`settings-are-schema-driven-from-one-registry`, `views-are-projections-of-one-model`.
