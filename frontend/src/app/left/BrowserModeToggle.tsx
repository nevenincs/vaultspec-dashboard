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

import { Books, TreeStructure, TreeView } from "@phosphor-icons/react";

import { Segment, SegmentedToggle } from "../kit";
import type { BrowserMode } from "../../stores/view/browserMode";

// 14px is the iconography ADR's grayscale-by-shape gate size; the three domain
// marks are distinct by SHAPE (a stack of books / a top-down hierarchy / a
// sideways branching tree) so the mode reads without relying on hue.
const MARK_PX = 14;

// vault · tree · code, left to right, matching the binding design's segmented
// control. `TreeView` (a top-down org hierarchy) is the tree mode's mark — the
// vault corpus RE-nested — distinct in shape from `TreeStructure` (the sideways
// source tree) the code mode carries.
const MODES: { id: BrowserMode; label: string; mark: typeof Books }[] = [
  { id: "vault", label: "Vault", mark: Books },
  { id: "tree", label: "Tree", mark: TreeView },
  { id: "code", label: "Code", mark: TreeStructure },
];

export interface BrowserModeToggleProps {
  mode: BrowserMode;
  onModeChange: (mode: BrowserMode) => void;
}

export function BrowserModeToggle({ mode, onModeChange }: BrowserModeToggleProps) {
  return (
    <div data-browser-mode-toggle>
      <SegmentedToggle
        value={mode}
        onChange={(v) => onModeChange(v as BrowserMode)}
        ariaLabel="browser mode"
      >
        {MODES.map(({ id, label, mark: Mark }) => (
          <Segment key={id} value={id}>
            {/* Grayscale-safe active cue: the kit Segment carries the raised-paper
                fill + medium weight; the leading domain mark adds shape so the
                active mode reads without relying on hue. */}
            <span className="flex items-center gap-fg-1-5" data-browser-mode={id}>
              <span className="shrink-0" aria-hidden>
                <Mark size={MARK_PX} weight={mode === id ? "fill" : "regular"} />
              </span>
              <span>{label}</span>
            </span>
          </Segment>
        ))}
      </SegmentedToggle>
    </div>
  );
}
