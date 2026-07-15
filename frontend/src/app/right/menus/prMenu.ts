// Right-rail context menu: a pull-request row (action-surface-mapping W03.P21). A pure
// resolver over the PullRequestEntity descriptor — it reads only the descriptor's own
// fields (id = PR number, title, url), never global state, so it is unit-testable in
// isolation. The registration below contributes it for the "pull-request" entity kind
// at module load.
//
// The right rail surfaces PRs read-only (engine-read-and-infer): the one navigate verb
// opens the PR on its remote (a non-mutating external navigation), and the rest are
// copy verbs. None mutates a git ref, so none is time-travel gated.

import { ExternalLink } from "lucide-react";

import type { ActionDescriptor } from "../../../platform/actions/action";
import { copyAction } from "../../../platform/actions/clipboardActions";
import { normalizeEntityDescriptor } from "../../../platform/actions/entity";
import type { ActionResolver } from "../../../platform/actions/registry";
import { registerResolver } from "../../../platform/actions/registry";

/**
 * The menu for a pull-request row: open the PR on its remote (disabled-with-reason when
 * the row carries no url), then copy the url and the PR number. Read-only — the rail
 * surfaces PRs, it does not mutate them.
 */
export function prMenu(entity: unknown): ActionDescriptor[] {
  const normalizedEntity = normalizeEntityDescriptor(entity);
  if (normalizedEntity?.kind !== "pull-request") return [];
  const actions: ActionDescriptor[] = [];

  const url = normalizedEntity.url;
  if (url) {
    actions.push({
      id: "pull-request:open",
      label: { key: "projects:actions.openPullRequest" },
      section: "navigate",
      icon: ExternalLink,
      run: () => {
        if (typeof window !== "undefined") {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      },
    });
    actions.push(
      copyAction({
        id: "pull-request:copy-url",
        label: { key: "common:actions.copyPullRequestLink" },
        text: url,
        what: "path",
      }),
    );
  } else {
    actions.push({
      id: "pull-request:open",
      label: { key: "projects:actions.openPullRequest" },
      section: "navigate",
      icon: ExternalLink,
      disabled: true,
      disabledReason: {
        key: "projects:disabledReasons.refreshProjectForPullRequest",
      },
    });
  }

  actions.push(
    copyAction({
      id: "pull-request:copy-number",
      label: { key: "common:actions.copyPullRequestNumber" },
      text: normalizedEntity.id,
      what: "id",
    }),
  );

  return actions;
}

registerResolver("pull-request", prMenu as ActionResolver);
