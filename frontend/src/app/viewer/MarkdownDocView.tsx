// The markdown document view with read + edit modes (editor-dock-workspace P05).
// View mode renders the read-only `MarkdownReader`; edit mode mounts the existing
// (document-editor backend) bounded editor slice as a raw-markdown body editor
// plus a PROPERTIES card for `tags / date / related`, saving through the core
// write verbs (`set-body` / `set-frontmatter`) over `/ops/core/*`. Only markdown
// documents are editable; the code viewer stays read-only.
//
// The editor slice is single (one open editor at a time, bounded-by-default): a
// markdown panel is editable when it IS the editor target, and entering edit mode
// seeds the slice from this panel's read. Layer law: this is dumb `app/` chrome —
// it fetches nothing (the content query + the write mutations are the sole wire
// clients) and reads the tiers-derived `ContentView`, never raw `tiers`.

import { useMemo } from "react";

import {
  deriveMarkdownReaderView,
  useSaveBody,
  useSetFrontmatter,
  type ContentView,
} from "../../stores/server/queries";
import {
  applyEditorWriteResult,
  closeDocumentEditor,
  markEditorFailed,
  markEditorSaving,
  openDocumentEditor,
  updateEditorDraft,
} from "../../stores/view/editor";
import { promoteDocTab } from "../../stores/view/tabs";
import { useViewStore, type EditorStatus } from "../../stores/view/viewStore";
import { Button } from "../kit";
import { MarkdownReader } from "./MarkdownReader";

const STATUS_LABEL: Record<EditorStatus, string> = {
  idle: "Saved",
  dirty: "Unsaved changes",
  saving: "Saving…",
  saved: "Saved",
  "save-failed": "Save failed",
  conflict: "Conflict — the file changed on disk",
};

export function MarkdownDocView({
  nodeId,
  content,
  scope,
}: {
  nodeId: string;
  content: ContentView;
  scope: string | null;
}) {
  const editorTargetId = useViewStore((s) => s.editorTarget?.nodeId ?? null);
  const draftText = useViewStore((s) => s.draftText);
  const baseBlobHash = useViewStore((s) => s.baseBlobHash);
  const editorStatus = useViewStore((s) => s.editorStatus);
  const isEditing = editorTargetId === nodeId;

  const saveBody = useSaveBody();
  const setFrontmatter = useSetFrontmatter();
  // The frontmatter (tags/date/related) for the PROPERTIES seed comes from the
  // reader projection's frontmatter block, not the header crown.
  const frontmatter = useMemo(
    () => deriveMarkdownReaderView(content).frontmatter,
    [content],
  );

  const enterEdit = () => {
    openDocumentEditor(nodeId, content.text, content.blobHash ?? "");
    // An explicit edit promotes a provisional (preview) tab to a permanent one.
    promoteDocTab(nodeId);
  };

  const saveBodyNow = () => {
    markEditorSaving();
    saveBody.mutate(
      { nodeId, scope, text: draftText, baseBlobHash },
      {
        onSuccess: ({ result }) => {
          if (result.kind !== "created") applyEditorWriteResult(result);
        },
        onError: () => markEditorFailed(),
      },
    );
  };

  if (!isEditing) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-end gap-fg-2 border-b border-rule px-fg-3 py-fg-1">
          <Button variant="ghost" onClick={enterEdit} disabled={!content.available}>
            Edit
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <MarkdownReader content={content} scope={scope} />
        </div>
      </div>
    );
  }

  const canSave = editorStatus === "dirty" || editorStatus === "save-failed";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-fg-2 border-b border-rule px-fg-3 py-fg-1">
        <span
          className={`text-label ${
            editorStatus === "conflict" || editorStatus === "save-failed"
              ? "text-state-broken"
              : editorStatus === "dirty"
                ? "text-ink"
                : "text-ink-muted"
          }`}
        >
          {STATUS_LABEL[editorStatus]}
        </span>
        <div className="flex items-center gap-fg-2">
          <Button
            variant="primary"
            onClick={saveBodyNow}
            disabled={!canSave || saveBody.isPending}
          >
            Save
          </Button>
          <Button variant="ghost" onClick={closeDocumentEditor}>
            Done
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <textarea
          className="min-h-0 flex-1 resize-none border-none bg-paper px-fg-6 py-fg-3 font-mono text-body leading-relaxed text-ink outline-none"
          value={draftText}
          onChange={(event) => updateEditorDraft(event.target.value)}
          spellCheck={false}
          aria-label="document body editor"
        />
        <PropertiesCard
          nodeId={nodeId}
          scope={scope}
          baseBlobHash={baseBlobHash}
          tags={frontmatter?.tags.map((t) => t.label).join(", ") ?? ""}
          date={frontmatter?.dates.find((d) => d.label === "created")?.value ?? ""}
          related={frontmatter?.related.map((r) => r.stem).join(", ") ?? ""}
          onSave={(fields) => {
            markEditorSaving();
            setFrontmatter.mutate(
              { nodeId, scope, baseBlobHash, ...fields },
              {
                onSuccess: ({ result }) => {
                  if (result.kind !== "created") applyEditorWriteResult(result);
                },
                onError: () => markEditorFailed(),
              },
            );
          }}
          saving={setFrontmatter.isPending}
        />
      </div>
    </div>
  );
}

/** The frontmatter PROPERTIES card: edit tags / date / related, saved atomically
 *  through `set-frontmatter` (the engine validates and refuses a non-conformant
 *  write, surfaced through the editor status). Seeded from the read's header. */
function PropertiesCard({
  tags,
  date,
  related,
  onSave,
  saving,
}: {
  nodeId: string;
  scope: string | null;
  baseBlobHash: string;
  tags: string;
  date: string;
  related: string;
  onSave: (fields: { tags?: string[]; date?: string; related?: string[] }) => void;
  saving: boolean;
}) {
  return (
    <form
      className="flex w-64 shrink-0 flex-col gap-fg-3 overflow-y-auto border-l border-rule bg-paper-sunken px-fg-3 py-fg-3"
      aria-label="document properties"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const read = (name: string) =>
          (form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? "";
        const list = (value: string) =>
          value
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean);
        onSave({
          tags: list(read("tags")),
          date: read("date").trim() || undefined,
          related: list(read("related")),
        });
      }}
    >
      <Field label="Tags" name="tags" defaultValue={tags} placeholder="#tag, #tag" />
      <Field label="Date" name="date" defaultValue={date} placeholder="YYYY-MM-DD" />
      <Field
        label="Related"
        name="related"
        defaultValue={related}
        placeholder="stem, stem"
      />
      <Button type="submit" variant="secondary" disabled={saving}>
        Save properties
      </Button>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue: string;
  placeholder: string;
}) {
  return (
    <label className="flex flex-col gap-fg-1 text-label text-ink-muted">
      {label}
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="rounded-fg-sm border border-rule bg-paper px-fg-2 py-fg-1 text-body text-ink outline-none focus-visible:border-accent"
      />
    </label>
  );
}
