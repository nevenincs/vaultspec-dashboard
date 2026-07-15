// The browser-region mode toggle (binding Figma `LeftRail` 244:750 — the
// "Documents / Files" SegmentedToggle). Re-skinned (W02.P04.S07) onto the
// centralized kit `SegmentedToggle` + `Segment` (board "Design System —
// Components" 135:2) so the control is a real shared definition, not a
// per-surface hand-built tablist (design-system-is-centralized). It switches the
// file-thinking surface between its TWO modes — VAULT (the `/vault-tree`
// projection nested feature → doc_type → document, the default) and CODE (the
// `/file-tree` projection; the raw ids remain `vault` and `code`). The
// chosen mode is view-local state re-keyed per scope
// (`stores/view/browserMode`), so it never bleeds across a swap.
//
// Read-only navigation law: this is a view-local affordance only — it emits no
// scope/node selection and issues no wire request; it flips the mode in the
// browser-mode store and nothing else (the rail's single-navigation-law "adjust
// a local view affordance"). The kit `SegmentedToggle` owns the roving-keys
// radiogroup a11y model and the raised-paper active cue.

import { useCallback } from "react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import {
  BROWSER_MODES,
  BROWSER_VIEW_LABEL,
  browserModePresentation,
  type BrowserMode,
} from "../../stores/view/browserMode";
import { Segment, SegmentedToggle } from "../kit";

export interface BrowserModeToggleProps {
  mode: BrowserMode;
  onModeChange: (mode: BrowserMode) => void;
}

export function BrowserModeToggle({ mode, onModeChange }: BrowserModeToggleProps) {
  const resolveMessage = useLocalizedMessageResolver();
  const browserView = resolveMessage(BROWSER_VIEW_LABEL);
  const handleModeChange = useCallback(
    (value: string) => {
      const presentation = browserModePresentation(value);
      if (presentation !== null) onModeChange(presentation.id);
    },
    [onModeChange],
  );

  if (browserView.usedFallback) return null;

  return (
    <div data-browser-mode-toggle className="w-full">
      <SegmentedToggle
        value={mode}
        onChange={handleModeChange}
        ariaLabel={browserView.message}
        fullWidth
      >
        {BROWSER_MODES.map((id) => {
          const presentation = browserModePresentation(id);
          if (presentation === null) return null;
          const label = resolveMessage(presentation.label);
          if (label.usedFallback) return null;
          return (
            // The binding board (244:750) segments are LABEL-ONLY — no leading icon.
            <Segment key={id} value={id}>
              <span data-browser-mode={id}>{label.message}</span>
            </Segment>
          );
        })}
      </SegmentedToggle>
    </div>
  );
}
