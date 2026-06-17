// The browser-region mode toggle (binding Figma `LeftRail` 244:750 — the
// "Vault / Tree / Code" SegmentedToggle). Re-skinned (W02.P04.S07) onto the
// centralized kit `SegmentedToggle` + `Segment` (board "Design System —
// Components" 135:2) so the control is a real shared definition, not a
// per-surface hand-built tablist (design-system-is-centralized). It switches the
// file-thinking surface between its THREE modes — VAULT (the `/vault-tree`
// projection grouped by `.vault/` subtree, the default), TREE (the SAME
// `/vault-tree` projection nested feature → doc_type → document, a pure
// client-side re-projection — no engine work), and CODE (the `/file-tree`
// projection). The chosen mode is view-local state re-keyed per scope
// (`stores/view/browserMode`), so it never bleeds across a swap.
//
// Read-only navigation law: this is a view-local affordance only — it emits no
// scope/node selection and issues no wire request; it flips the mode in the
// browser-mode store and nothing else (the rail's single-navigation-law "adjust
// a local view affordance"). Three Phosphor domain marks carry the mode identity,
// each distinct by SHAPE (a stack of books / a top-down hierarchy / a sideways
// source tree) so the mode reads without relying on hue; the kit `SegmentedToggle`
// owns the roving-keys radiogroup a11y model and the raised-paper active cue.

import { Segment, SegmentedToggle } from "../kit";
import type { BrowserMode } from "../../stores/view/browserMode";

// vault · tree · code, left to right — the binding board's segmented control. The
// board segments are LABEL-ONLY (no leading icon).
const MODES: { id: BrowserMode; label: string }[] = [
  { id: "vault", label: "Vault" },
  { id: "tree", label: "Tree" },
  { id: "code", label: "Code" },
];

export interface BrowserModeToggleProps {
  mode: BrowserMode;
  onModeChange: (mode: BrowserMode) => void;
}

export function BrowserModeToggle({ mode, onModeChange }: BrowserModeToggleProps) {
  return (
    <div data-browser-mode-toggle className="w-full">
      <SegmentedToggle
        value={mode}
        onChange={(v) => onModeChange(v as BrowserMode)}
        ariaLabel="browser mode"
        fullWidth
      >
        {MODES.map(({ id, label }) => (
          // The binding board (244:750) segments are LABEL-ONLY — no leading icon.
          <Segment key={id} value={id}>
            <span data-browser-mode={id}>{label}</span>
          </Segment>
        ))}
      </SegmentedToggle>
    </div>
  );
}
