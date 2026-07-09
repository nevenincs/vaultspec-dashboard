// The "New document" create affordance: maps a UI action onto the authoring
// ledger's direct-write route (`useCreateDoc` → `directWrite({operation:
// "create_document"})`). Layer law: dumb `app/` chrome — it drives the stores
// create mutation (the sole wire client), reads chrome draft through a view
// seam, and opens the created doc through the tab seam when its identity is
// known; it never touches the engine client, raw view store, raw `tiers`, or
// identity parsing.

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
  toggleCreateDocDialog,
  useCreateDocChrome,
} from "../../stores/view/createDocChrome";
import { openDocTab } from "../../stores/view/tabs";
import { Button } from "../kit";

export function CreateDocButton() {
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
          // A `created` result IS success even when `nodeId` is null (the
          // direct-write route does not echo `vault add`'s server-computed
          // stem back — a known backend gap, tracked separately): the
          // document exists either way, so this never renders a false
          // "refused" for a genuine success. Only auto-open the tab when the
          // identity is actually known.
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

  return (
    <div className="relative">
      <Button variant="ghost" onClick={toggleCreateDocDialog} aria-label="new document">
        + New
      </Button>
      {open && (
        <div
          className="absolute right-0 z-50 mt-fg-1 flex w-72 flex-col gap-fg-2 rounded-fg-2 border border-rule bg-paper p-fg-3 shadow-floating"
          aria-label="create document"
        >
          <label className="flex flex-col gap-px text-label text-ink-muted">
            Type
            <select
              className="rounded-fg-1 border border-rule bg-paper px-fg-2 py-px text-body text-ink outline-none focus:border-accent"
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
          <label className="flex flex-col gap-px text-label text-ink-muted">
            Feature
            <input
              className="rounded-fg-1 border border-rule bg-paper px-fg-2 py-px text-body text-ink outline-none focus:border-accent"
              value={feature}
              onChange={(event) => setCreateDocFeature(event.target.value)}
              placeholder="feature-tag"
              aria-label="feature"
            />
          </label>
          <label className="flex flex-col gap-px text-label text-ink-muted">
            Title
            <input
              className="rounded-fg-1 border border-rule bg-paper px-fg-2 py-px text-body text-ink outline-none focus:border-accent"
              value={title}
              onChange={(event) => setCreateDocTitle(event.target.value)}
              placeholder="Document title"
              aria-label="title"
            />
          </label>
          {error !== null && (
            <span className="text-label text-state-broken">{error}</span>
          )}
          <Button variant="primary" onClick={submit} disabled={create.isPending}>
            Create
          </Button>
        </div>
      )}
    </div>
  );
}
