---
name: every-composite-navigates-through-the-one-focuszone
---

# Every composite navigates through the one FocusZone, and its keys never reach the global dispatcher

## Rule

Every multi-child interactive composite in `frontend/src/app/` — a tree, list,
toolbar, tab set, segmented control, menu, rail-header group, mark cursor, or any
future roving widget — manages its within-widget keyboard motion through the one
shared `FocusZone` primitive (`app/chrome/useFocusZone.ts`) and contributes
**exactly one tab stop** to the shell tab ring (the active child is `tabIndex=0`,
its siblings `-1`; arrows / Home / End rove). No surface hand-rolls a private
roving-tabindex or arrow-key handler. Any widget-intrinsic key a composite
consumes (the arrows, and a menu's Enter/Escape) **must `stopPropagation`** so it
never bubbles to the single global keymap dispatcher's window listener —
`FocusZone` does this for its consumers, and a widget that keeps its own handler
(the kit `Segment`, the context menu, the settings radiogroup) must call it
explicitly. Inter-region traversal (`F6`/`Shift+F6`, the skip link) is a Class-A
command bound in the keymap registry, never a private global `keydown` listener.

## Why

The `2026-06-21-keyboard-navigation` campaign (ADR `2026-06-21-keyboard-navigation-adr`)
built the two-tier focus model — Tab between regions, arrow within — and the
enrollment proved two failure modes that this rule fences. First, **the
double-fire**: the prior keyboard-action campaign bound bare `ArrowUp/Down/Left/Right`
as *global* graph-cycle commands on a window listener, so every widget that handled
arrows WITHOUT `stopPropagation` fired its own move AND the global graph nav — the
vault tree's arrow nav appeared dead precisely because the global selection change
re-rendered the tree and reset its roving. The fix was uniform: route composites
through `FocusZone` (which stops consumed keys) and add `stopPropagation` to the
remaining hand-rolled handlers (`Segment`, `ContextMenuHost`, the settings
`EnumControl`). Second, **render-time roving must be idempotent**: React
double-invokes each row's render, so a roving implementation that relies on a
mutable first-item latch is consumed by the first invocation and the committed
second one finds no tab stop — `FocusZone` resolves the tab stop from the previous
render's order (a concrete key) and dedupes, never from a per-call latch. One
primitive replacing the five bespoke roving sites is what made the enrollment
mechanical and kept every composite behaving identically; the campaign live-verified
the model across the foundation, both left-rail trees, the graph toolbar, the
plan step tree, the rail headers, and the timeline sliders.

## How

- **Good:** a new tree/list/toolbar/menu calls `useFocusZone({ orientation, wrap,
  activeKey, onActiveKeyChange })` and spreads `rove(key)`'s `{ ref, tabIndex,
  onKeyDown }` onto each child; the zone is one tab stop, arrows rove, and consumed
  keys are stopped before the global dispatcher sees them.
- **Good:** a widget that legitimately keeps its own arrow handler (a kit primitive,
  a custom menu) calls `e.preventDefault()` AND `e.stopPropagation()` on the keys it
  consumes, so a Class-B widget key never reaches the Class-A registry.
- **Good:** a new global affordance like region cycling is a `KeybindingDef` in the
  keymap registry fired by the one dispatcher — never a `window.addEventListener("keydown", …)`.
- **Bad:** hand-rolling a `tabindex` roving loop or an `e.key === "ArrowDown"` handler
  in a surface, or `preventDefault`-ing an arrow without `stopPropagation` — it
  double-fires the global graph nav and drifts from every other composite. This is
  the exact defect set the campaign found and fixed.

## Status

Active. Promoted from the `2026-06-21-keyboard-navigation` campaign at the close of
its first enrollment, in which the `FocusZone` model held across every surface it
was applied to and the double-fire / double-invoke failure modes were each found
and fixed the hard way. Complements `keyboard-shortcuts-bind-through-the-one-keymap-registry`
(the Class-A side this rule's Class-B isolation completes).

## Source

ADR `2026-06-21-keyboard-navigation-adr` (codification candidate
`every-composite-navigates-through-the-one-focuszone`) and research
`2026-06-21-keyboard-navigation-research`. The double-fire convergence (global
bare-arrow bindings vs widget arrows) and the render-time-roving idempotence-under-
React-double-invoke lesson were the load-bearing discoveries of the enrollment.
Sibling rules `keyboard-shortcuts-bind-through-the-one-keymap-registry`,
`dashboard-layer-ownership`, `bounded-by-default-for-every-accumulator`.
