// The "New document" modal: creates a vault document through the authoring
// ledger's direct-write route (`useCreateDoc` → `directWrite({operation:
// "create_document"})`). Dumb `app/` chrome (dashboard-layer-ownership): it
// drives the stores create mutation (the sole wire client), reads its draft
// through the chrome view seam, and opens the created doc through the tab seam
// when its identity is known; it never touches the engine client, raw view
// store, raw `tiers`, or identity parsing. Reachable from the vault-tree
// context menu, the command palette, and the keymap under the one shared
// `left-rail:new-document` id — mounted once per shell branch beside the other
// app-wide dialogs so every entry point renders it (it previously anchored to
// the retired stage nav bar and went dark).

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
          // A `created` result IS success even on the rare `nodeId === null`
          // (W03.P09a: the apply receipt echoes the server-resolved
          // `result_node_id`/`result_stem` for a landed create — never
          // client-predicted — but the engine's re-resolve is fail-closed: if
          // the created stem somehow doesn't resolve despite `Applied`, it
          // reports no identity rather than forging one). Either way the
          // document exists, so this never renders a false "refused" for a
          // genuine success — auto-open the tab only when the identity is
          // actually known.
          if (result.kind === "created") {
            if (nodeId) void openDocTab(nodeId, "markdown", scope);
            resetCreateDocChrome();
          } else {
            setCreateDocError("Create refused — check the feature/title");
          }
        },
        onError: () => setCreateDocError("Create failed"),
      },
    );
  };

  const submitOnEnter = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={resetCreateDocChrome}
      title="New document"
      description="Create a vault document scaffolded from its template. The save is recorded in the change ledger."
    >
      <div className="flex flex-col gap-fg-3 px-fg-4 pt-fg-3 pb-fg-4">
        <label className="flex flex-col gap-fg-1 text-label text-ink-muted">
          Type
          <select
            className="rounded-fg-xs border border-rule bg-paper px-fg-2 py-fg-1 text-body text-ink outline-none focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
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
            className="rounded-fg-xs border border-rule bg-paper px-fg-2 py-fg-1 text-body text-ink outline-none focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
            value={feature}
            onChange={(event) => setCreateDocFeature(event.target.value)}
            onKeyDown={submitOnEnter}
            placeholder="feature-tag"
            aria-label="feature"
            spellCheck={false}
          />
        </label>
        <label className="flex flex-col gap-fg-1 text-label text-ink-muted">
          Title
          <input
            className="rounded-fg-xs border border-rule bg-paper px-fg-2 py-fg-1 text-body text-ink outline-none focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
            value={title}
            onChange={(event) => setCreateDocTitle(event.target.value)}
            onKeyDown={submitOnEnter}
            placeholder="Document title"
            aria-label="title"
          />
        </label>
        {error !== null && (
          <p role="alert" className="text-label text-state-broken">
            {error}
          </p>
        )}
        <div className="flex items-center justify-end gap-fg-2 border-t border-rule pt-fg-3">
          <Button variant="secondary" onClick={resetCreateDocChrome}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={create.isPending}>
            Create
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
