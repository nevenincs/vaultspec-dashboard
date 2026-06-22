// Right-rail context menu: a recent commit row. A pure resolver over the
// CommitEntity descriptor — it reads only the descriptor's own fields (id = full
// hash, shortHash, subject), never global state, so it is unit-testable in
// isolation. The registration below contributes it for the "commit" entity kind at
// module load.
//
// The right-rail history is READ-ONLY (engine-read-and-infer), so the commit menu
// offers only non-mutating copy verbs — no checkout/cherry-pick/revert. None is
// time-travel gated.

import type { ActionDescriptor } from "../../../platform/actions/action";
import { copyAction } from "../../../platform/actions/clipboardActions";
import { normalizeEntityDescriptor } from "../../../platform/actions/entity";
import type { ActionResolver } from "../../../platform/actions/registry";
import { registerResolver } from "../../../platform/actions/registry";

/**
 * The menu for a recent-commit row: copy the full hash, the short hash, and the
 * subject line. All read-only — the right rail surfaces history, it does not mutate
 * git refs. (A commit hash is the row's identity, so it copies under the `id` shape.)
 */
export function commitMenu(entity: unknown): ActionDescriptor[] {
  const normalizedEntity = normalizeEntityDescriptor(entity);
  if (normalizedEntity?.kind !== "commit") return [];
  const actions: ActionDescriptor[] = [];

  actions.push(
    copyAction({
      id: "commit:copy-hash",
      label: "Copy commit hash",
      text: normalizedEntity.id,
      what: "id",
    }),
  );

  if (normalizedEntity.shortHash) {
    actions.push(
      copyAction({
        id: "commit:copy-short-hash",
        label: "Copy short hash",
        text: normalizedEntity.shortHash,
        what: "id",
      }),
    );
  }

  if (normalizedEntity.subject) {
    actions.push(
      copyAction({
        id: "commit:copy-subject",
        label: "Copy subject",
        text: normalizedEntity.subject,
        what: "title",
      }),
    );
  }

  return actions;
}

registerResolver("commit", commitMenu as ActionResolver);
