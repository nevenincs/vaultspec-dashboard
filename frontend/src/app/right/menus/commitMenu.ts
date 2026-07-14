// Right-rail context menu: a recent commit row. A pure resolver over the
// CommitEntity descriptor and the injected ActionContext — it reads only the
// descriptor's own fields (id = full hash, shortHash, subject, ts) and
// `ctx.scope`, never a store, so it is unit-testable in isolation. The
// registration below contributes it for the "commit" entity kind at module load.
//
// The right-rail history is READ-ONLY of GIT (engine-read-and-infer), so the menu
// offers only non-mutating verbs — no checkout/cherry-pick/revert. The one
// non-copy verb, "View corpus at this commit" (TTR-005a), is a NAVIGATE verb: it
// writes the shared `timeline_mode` (dashboard state, not a git ref) so the graph
// scrubs as-of that commit's instant. It is not a git mutation and is not
// time-travel gated; the exit is the stage's "return to live" chip.

import { legacyActionPresentation } from "../../../platform/actions/action";
import { History } from "lucide-react";

import type { ActionDescriptor } from "../../../platform/actions/action";
import { copyAction } from "../../../platform/actions/clipboardActions";
import { normalizeEntityDescriptor } from "../../../platform/actions/entity";
import type { ActionContext, ActionResolver } from "../../../platform/actions/registry";
import { registerResolver } from "../../../platform/actions/registry";
import { movePlayhead } from "../../../stores/view/timelineIntent";

/**
 * The menu for a recent-commit row: view the corpus as-of this commit (time
 * travel), then copy the full hash, the short hash, and the subject line. All
 * read-only of git — the right rail surfaces history, it does not mutate refs. (A
 * commit hash is the row's identity, so it copies under the `id` shape.)
 *
 * The time-travel entry needs both the commit instant (`entity.ts`) and the active
 * scope (`ctx.scope`) to write the shared timeline_mode; when either is absent it
 * renders disabled-with-reason rather than silently missing (unified-action-plane's
 * honest-disable, never a lie).
 */
export function commitMenu(entity: unknown, ctx?: ActionContext): ActionDescriptor[] {
  const normalizedEntity = normalizeEntityDescriptor(entity);
  if (normalizedEntity?.kind !== "commit") return [];
  const actions: ActionDescriptor[] = [];

  const at = normalizedEntity.ts;
  const scope =
    typeof ctx?.scope === "string" && ctx.scope.length > 0 ? ctx.scope : null;
  // The code corpus has no git-history axis (present view only — the engine
  // rejects `as_of` on it), so the time-travel entry disables honestly in code
  // mode instead of scrubbing a VAULT historical slice under a code canvas
  // (code-timeline-range ADR).
  const codeCorpus = ctx?.corpus === "code";
  if (typeof at === "number" && Number.isFinite(at) && scope !== null && !codeCorpus) {
    actions.push({
      id: "commit:view-at-commit",
      label: legacyActionPresentation("View corpus at this commit"),
      section: "navigate",
      icon: History,
      run: () => movePlayhead(at, scope),
    });
  } else {
    actions.push({
      id: "commit:view-at-commit",
      label: legacyActionPresentation("View corpus at this commit"),
      section: "navigate",
      icon: History,
      disabled: true,
      disabledReason: legacyActionPresentation(
        codeCorpus
          ? "only the vault view has commit history"
          : at === undefined
            ? "no commit time"
            : "no active scope",
      ),
    });
  }

  actions.push(
    copyAction({
      id: "commit:copy-hash",
      label: { key: "common:actions.copy" },
      text: normalizedEntity.id,
      what: "id",
    }),
  );

  if (normalizedEntity.shortHash) {
    actions.push(
      copyAction({
        id: "commit:copy-short-hash",
        label: { key: "common:actions.copy" },
        text: normalizedEntity.shortHash,
        what: "id",
      }),
    );
  }

  if (normalizedEntity.subject) {
    actions.push(
      copyAction({
        id: "commit:copy-subject",
        label: { key: "common:actions.copyTitle" },
        text: normalizedEntity.subject,
        what: "title",
      }),
    );
  }

  return actions;
}

registerResolver("commit", commitMenu as ActionResolver);
