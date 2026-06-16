// The browser-region mode toggle (dashboard-left-rail ADR "Browser" / Figma
// `LeftRail_*` segmented vault·tree·code control): a compact, keyboard-reachable
// control that switches the file-thinking surface between its THREE modes — VAULT
// (the `/vault-tree` projection grouped by `.vault/` subtree, the default), TREE
// (the SAME `/vault-tree` projection nested feature → doc_type → document, a pure
// client-side re-projection — no engine work), and CODE (the `/file-tree`
// projection). The chosen mode is view-local state re-keyed per scope
// (`stores/view/browserMode`), so it never bleeds across a swap.
//
// Read-only navigation law: this is a view-local affordance only — it emits no
// scope/node selection and issues no wire request; it flips the mode in the
// browser-mode store and nothing else (the rail's single-navigation-law "adjust
// a local view affordance"). Three Phosphor domain marks carry the mode identity,
// each distinct by SHAPE (a stack of books / a top-down hierarchy / a sideways
// source tree); the toggle is one ARIA tablist so the modes read as a segmented
// choice, with roving arrow-key movement that auto-scales to the mode count.

import { Books, TreeStructure, TreeView } from "@phosphor-icons/react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useRef } from "react";

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
  { id: "vault", label: "vault", mark: Books },
  { id: "tree", label: "tree", mark: TreeView },
  { id: "code", label: "code", mark: TreeStructure },
];

export interface BrowserModeToggleProps {
  mode: BrowserMode;
  onModeChange: (mode: BrowserMode) => void;
}

export function BrowserModeToggle({ mode, onModeChange }: BrowserModeToggleProps) {
  const tabEls = useRef(new Map<BrowserMode, HTMLButtonElement>());
  const registerTab = useCallback(
    (id: BrowserMode) => (el: HTMLButtonElement | null) => {
      if (el) tabEls.current.set(id, el);
      else tabEls.current.delete(id);
    },
    [],
  );

  // Roving arrow-key movement across the two-tab segmented control (ADR
  // "Keyboard and a11y"): ArrowLeft/Right (and Up/Down) move and activate, so
  // the mode is reachable and switchable from the keyboard alone.
  const onKeyDown = (index: number) => (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (
      e.key === "ArrowRight" ||
      e.key === "ArrowDown" ||
      e.key === "ArrowLeft" ||
      e.key === "ArrowUp"
    ) {
      e.preventDefault();
      const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
      const next = (index + (forward ? 1 : MODES.length - 1)) % MODES.length;
      const target = MODES[next]!;
      onModeChange(target.id);
      tabEls.current.get(target.id)?.focus();
    }
  };

  return (
    <div
      role="tablist"
      aria-label="browser mode"
      aria-orientation="horizontal"
      data-browser-mode-toggle
      className="flex shrink-0 gap-vs-0-5 rounded-fg-xs border border-rule bg-paper-sunken p-vs-0-5"
    >
      {MODES.map(({ id, label, mark: Mark }, index) => {
        const active = mode === id;
        return (
          <button
            key={id}
            ref={registerTab(id)}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={`${label} browser${active ? ", current" : ""}`}
            // Roving tabindex: only the active tab is in the Tab order; arrows
            // move between the two (the segmented-control a11y pattern).
            tabIndex={active ? 0 : -1}
            data-browser-mode={id}
            data-browser-mode-active={active ? "" : undefined}
            onClick={() => onModeChange(id)}
            onKeyDown={onKeyDown(index)}
            className={`flex flex-1 items-center justify-center gap-vs-1-5 rounded-fg-xs border px-vs-2 py-vs-0-5 text-label transition-colors duration-ui-fast focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
              active
                ? "border-rule bg-paper-raised font-medium text-ink shadow-fg-raised"
                : "border-transparent text-ink-faint hover:text-ink-muted"
            }`}
          >
            {/* Grayscale-safe active cue: fill + weight + the leading mark, so
                the active mode reads without relying on hue. */}
            <span className="shrink-0" aria-hidden>
              <Mark size={MARK_PX} weight={active ? "fill" : "regular"} />
            </span>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
