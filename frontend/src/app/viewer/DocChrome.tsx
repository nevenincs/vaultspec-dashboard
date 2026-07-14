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
// The mode toggle exposes its accelerator only through the native hover tooltip.
// The chord is DERIVED from the one keymap registry by shared action id — never
// hand-typed (palette-accelerators-derive-from-the-keymap-registry). Inline shortcut
// hints belong only in menus and the command palette, keeping document chrome quiet.

import type { ReactNode } from "react";

import { Breadcrumb, type BreadcrumbItem, Segment, SegmentedToggle } from "../kit";
import { effectiveChord } from "../../platform/keymap/registry";
import {
  chordToKeycaps,
  resolveKeycapPresentations,
} from "../../platform/keymap/chord";
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import { getKeymapOverrides } from "../../stores/view/keymapDispatcher";
import {
  EDITOR_TOGGLE_MODE_ACTION_ID,
  deriveEditorKeybindings,
} from "../../stores/view/editorKeybindings";

export type DocChromeMode = "view" | "edit";

/** The effective keycaps for one editor action id, sourced from the keymap catalog
 *  (the registry's own definitions) with the live user override applied — or an
 *  empty list when the id is unknown, so the hint simply renders nothing. */
function editorAcceleratorCaps(actionId: string) {
  const def = deriveEditorKeybindings().find((binding) => binding.id === actionId);
  if (def === undefined) return [];
  return chordToKeycaps(effectiveChord(def, getKeymapOverrides()));
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
  const resolveMessage = useLocalizedMessageResolver();
  const toggleCaps = resolveKeycapPresentations(
    editorAcceleratorCaps(EDITOR_TOGGLE_MODE_ACTION_ID),
    resolveMessage,
  );
  const toggleTitle =
    toggleCaps.length > 0
      ? resolveMessage({
          key: "common:accessibility.toggleEditModeShortcut",
          values: { accelerator: toggleCaps.join(" ") },
        }).message
      : undefined;

  return (
    <div data-doc-chrome className="shrink-0">
      <div className="flex items-center justify-between gap-fg-3 bg-paper py-[0.8125rem] pl-[1.25rem] pr-[0.875rem]">
        <Breadcrumb items={trail} className="min-w-0" />
        <div className="flex shrink-0 items-center gap-fg-3">
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
