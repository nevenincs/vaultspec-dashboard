// DocChrome — the single chrome bar that crowns an open document, matching the
// binding reader frame `455:1117` (doc-reader · Reader): a path Breadcrumb on the
// left and a View/Edit segmented toggle on the right, over a 1px rule. This is the
// ONE chrome bar the binding design specifies; it replaces the prior stacked
// `DocHeader` crown + a separate Edit-button toolbar (editor-figma-parity).
//
// Composed from the centralized kit (design-system-is-centralized): Breadcrumb and
// SegmentedToggle/Segment are the shared definitions. Pure, prop-driven app chrome
// (dashboard-layer-ownership): it holds no wire state, fetches nothing, and reads
// no raw `tiers` — the host derives the trail from the preserved stores header
// model and passes mode + intent down.
//
// The toggle carries reading-mode accelerator hints (authoring-surface ADR D3): the
// view/edit toggle chord (Mod+E) and the close-editor chord (Mod+Alt+W) render as
// Kbd chips DERIVED from the one keymap registry by shared action id — never
// hand-typed (palette-accelerators-derive-from-the-keymap-registry). The default
// catalog (`deriveEditorKeybindings`) is the same source the registry registers, so
// the hint honours a user's chord override the instant it lands and can never drift
// from the live binding.

import type { ReactNode } from "react";

import { Breadcrumb, type BreadcrumbItem, Kbd, Segment, SegmentedToggle } from "../kit";
import { effectiveChord } from "../../platform/keymap/registry";
import { chordToKeycaps } from "../../platform/keymap/chord";
import { getKeymapOverrides } from "../../stores/view/keymapDispatcher";
import {
  EDITOR_CLOSE_ACTION_ID,
  EDITOR_TOGGLE_MODE_ACTION_ID,
  deriveEditorKeybindings,
} from "../../stores/view/editorKeybindings";

export type DocChromeMode = "view" | "edit";

/** The effective keycaps for one editor action id, sourced from the keymap catalog
 *  (the registry's own definitions) with the live user override applied — or an
 *  empty list when the id is unknown, so the hint simply renders nothing. */
function editorAcceleratorCaps(actionId: string): string[] {
  const def = deriveEditorKeybindings().find((binding) => binding.id === actionId);
  if (def === undefined) return [];
  return chordToKeycaps(effectiveChord(def, getKeymapOverrides()));
}

/** One labelled accelerator hint: a faint verb label + its derived keycaps. Renders
 *  nothing when the action has no resolvable chord. */
function AcceleratorHint({ label, caps }: { label: string; caps: string[] }) {
  if (caps.length === 0) return null;
  return (
    <span className="flex items-center gap-fg-1 text-meta text-ink-faint">
      {label}
      {caps.map((cap) => (
        <Kbd key={cap}>{cap}</Kbd>
      ))}
    </span>
  );
}

export function DocChrome({
  trail,
  mode,
  onModeChange,
  canEdit,
  trailing,
}: {
  /** The path trail leading to the document (kit Breadcrumb). */
  trail: BreadcrumbItem[];
  /** The active mode — drives the segmented toggle's selection. */
  mode: DocChromeMode;
  /** Emits the next mode when a segment is chosen. */
  onModeChange: (mode: DocChromeMode) => void;
  /** When false, the Edit segment is disabled (e.g. a non-editable target). */
  canEdit: boolean;
  /** Trailing chrome after the mode toggle (the coarse-pointer menu disclosure,
   *  touch-selectability ADR D3). */
  trailing?: ReactNode;
}) {
  const toggleCaps = editorAcceleratorCaps(EDITOR_TOGGLE_MODE_ACTION_ID);
  const closeCaps = editorAcceleratorCaps(EDITOR_CLOSE_ACTION_ID);
  const toggleTitle =
    toggleCaps.length > 0 ? `Toggle edit mode (${toggleCaps.join(" ")})` : undefined;

  return (
    <div data-doc-chrome className="shrink-0">
      <div className="flex items-center justify-between gap-fg-3 bg-paper py-[0.8125rem] pl-[1.25rem] pr-[0.875rem]">
        <Breadcrumb items={trail} className="min-w-0" />
        <div className="flex shrink-0 items-center gap-fg-3">
          <div className="flex items-center gap-fg-3" data-doc-chrome-accelerators>
            <AcceleratorHint label="Toggle" caps={toggleCaps} />
            <AcceleratorHint label="Close" caps={closeCaps} />
          </div>
          <SegmentedToggle
            value={mode}
            onChange={(next) => onModeChange(next === "edit" ? "edit" : "view")}
            ariaLabel="Document mode"
          >
            <Segment value="view" title={toggleTitle}>
              View
            </Segment>
            <Segment value="edit" disabled={!canEdit} title={toggleTitle}>
              Edit
            </Segment>
          </SegmentedToggle>
          {trailing}
        </div>
      </div>
      <div className="h-px w-full bg-rule" />
    </div>
  );
}
