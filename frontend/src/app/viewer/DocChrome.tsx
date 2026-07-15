// Document navigation and reading-mode controls. The host owns the path, mode,
// and actions; this component resolves presentation at render time.

import type { ReactNode } from "react";

import { Breadcrumb, type BreadcrumbItem, Segment, SegmentedToggle } from "../kit";
import { effectiveChord } from "../../platform/keymap/registry";
import {
  chordToKeycaps,
  resolveKeycapPresentations,
} from "../../platform/keymap/chord";
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import type { MessageDescriptor } from "../../platform/localization/message";
import { getKeymapOverrides } from "../../stores/view/keymapDispatcher";
import {
  EDITOR_TOGGLE_MODE_ACTION_ID,
  deriveEditorKeybindings,
} from "../../stores/view/editorKeybindings";

export type DocChromeMode = "view" | "edit";

export const DOC_CHROME_MESSAGES = {
  documentMode: { key: "documents:viewer.accessibility.documentMode" },
  edit: { key: "documents:viewer.modes.edit" },
  view: { key: "documents:viewer.modes.view" },
} as const satisfies Record<string, MessageDescriptor>;

/** Return the effective keycaps for an editor action. */
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
  /** The active mode drives the segmented toggle's selection. */
  mode: DocChromeMode;
  /** Emits the next mode when a segment is chosen. */
  onModeChange: (mode: DocChromeMode) => void;
  /** When false, the Edit segment is disabled (e.g. a non-editable target). */
  canEdit: boolean;
  /** Optional controls rendered after the mode toggle. */
  trailing?: ReactNode;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const message = (descriptor: MessageDescriptor) => resolveMessage(descriptor).message;
  const toggleCaps = resolveKeycapPresentations(
    editorAcceleratorCaps(EDITOR_TOGGLE_MODE_ACTION_ID),
    resolveMessage,
  );
  const toggleTitle =
    toggleCaps.length > 0
      ? resolveMessage({
          key: "documents:accessibility.switchReadingAndEditingShortcut",
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
            ariaLabel={message(DOC_CHROME_MESSAGES.documentMode)}
          >
            <Segment value="view" title={toggleTitle}>
              {message(DOC_CHROME_MESSAGES.view)}
            </Segment>
            <Segment value="edit" disabled={!canEdit} title={toggleTitle}>
              {message(DOC_CHROME_MESSAGES.edit)}
            </Segment>
          </SegmentedToggle>
          {trailing}
        </div>
      </div>
      <div className="h-px w-full bg-rule" />
    </div>
  );
}
