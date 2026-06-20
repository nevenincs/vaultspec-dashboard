// The global create-document dialog (left-rail unified action plane). Creation
// used to be reachable only from a stage button whose form lived inline; this
// lifts the form into one app-mounted modal so "New document" can be invoked
// from any plane — the left-rail context menu, the command palette, a keybinding,
// or the stage trigger — and always render the same dialog.
//
// Layer law (dashboard-layer-ownership): dumb `app/` chrome. It drives the stores
// create mutation (the sole wire client), reads its draft through the createDoc
// chrome view seam, and opens the created doc through the tab seam; it never
// touches the engine client, the raw view store, raw `tiers`, or identity
// parsing. Open/close state is shared view chrome (createDocChrome), so the
// dialog is a pure projection of it — mounted once, opened from many surfaces.

import { useActiveScope, useCreateDoc } from "../../stores/server/queries";
import {
  CREATE_DOC_TYPES,
  deriveCreateDocSubmission,
  isCreateDocType,
  resetCreateDocChrome,
  setCreateDocError,
  setCreateDocFeature,
  setCreateDocTitle,
  setCreateDocType,
  useCreateDocChrome,
} from "../../stores/view/createDocChrome";
import { openDocTab } from "../../stores/view/tabs";
import { Dialog } from "../chrome/Dialog";
import { Button } from "../kit";

export function CreateDocDialog() {
  const scope = useActiveScope();
  const create = useCreateDoc();
  const { open, docType, feature, title, error } = useCreateDocChrome();

  const submit = () => {
    const submission = deriveCreateDocSubmission({ docType, feature, title });
    if (!submission.ok) {
      setCreateDocError(submission.error);
      return;
    }
    setCreateDocError(null);
    create.mutate(
      {
        scope,
        docType: submission.docType,
        feature: submission.feature,
        title: submission.title,
      },
      {
        onSuccess: ({ result, nodeId }) => {
          if (result.kind === "created" && nodeId) {
            void openDocTab(nodeId, "markdown", scope);
            resetCreateDocChrome();
          } else {
            setCreateDocError("Create refused — check the feature/title");
          }
        },
        onError: () => setCreateDocError("Create failed"),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={resetCreateDocChrome}
      title="New document"
      description="Scaffold a .vault/ document from its template (vaultspec-core vault add)."
    >
      <form
        className="flex flex-col gap-fg-3 px-fg-4 pt-fg-3 pb-fg-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="flex flex-col gap-fg-1 text-label text-ink-muted">
          Type
          <select
            className="rounded-fg-1 border border-rule bg-paper px-fg-2 py-fg-1 text-body text-ink outline-none focus:border-accent"
            value={docType}
            onChange={(event) => {
              if (isCreateDocType(event.target.value)) {
                setCreateDocType(event.target.value);
              }
            }}
            aria-label="document type"
          >
            {CREATE_DOC_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-fg-1 text-label text-ink-muted">
          Feature
          <input
            className="rounded-fg-1 border border-rule bg-paper px-fg-2 py-fg-1 text-body text-ink outline-none focus:border-accent"
            value={feature}
            onChange={(event) => setCreateDocFeature(event.target.value)}
            placeholder="feature-tag"
            aria-label="feature"
          />
        </label>
        <label className="flex flex-col gap-fg-1 text-label text-ink-muted">
          Title
          <input
            className="rounded-fg-1 border border-rule bg-paper px-fg-2 py-fg-1 text-body text-ink outline-none focus:border-accent"
            value={title}
            onChange={(event) => setCreateDocTitle(event.target.value)}
            placeholder="Document title"
            aria-label="title"
          />
        </label>
        {error !== null && (
          <span className="text-label text-state-broken">{error}</span>
        )}
        <div className="flex justify-end gap-fg-2">
          <Button variant="ghost" type="button" onClick={resetCreateDocChrome}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={create.isPending}>
            Create
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
