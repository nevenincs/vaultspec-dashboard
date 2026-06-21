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

import { Breadcrumb, type BreadcrumbItem, Segment, SegmentedToggle } from "../kit";

export type DocChromeMode = "view" | "edit";

export function DocChrome({
  trail,
  mode,
  onModeChange,
  canEdit,
}: {
  /** The path trail leading to the document (kit Breadcrumb). */
  trail: BreadcrumbItem[];
  /** The active mode — drives the segmented toggle's selection. */
  mode: DocChromeMode;
  /** Emits the next mode when a segment is chosen. */
  onModeChange: (mode: DocChromeMode) => void;
  /** When false, the Edit segment is disabled (e.g. a non-editable target). */
  canEdit: boolean;
}) {
  return (
    <div data-doc-chrome className="shrink-0">
      <div className="flex items-center justify-between gap-fg-3 bg-paper py-[0.8125rem] pl-[1.25rem] pr-[0.875rem]">
        <Breadcrumb items={trail} className="min-w-0" />
        <SegmentedToggle
          value={mode}
          onChange={(next) => onModeChange(next === "edit" ? "edit" : "view")}
          ariaLabel="Document mode"
        >
          <Segment value="view">View</Segment>
          <Segment value="edit" disabled={!canEdit}>
            Edit
          </Segment>
        </SegmentedToggle>
      </div>
      <div className="h-px w-full bg-rule" />
    </div>
  );
}
