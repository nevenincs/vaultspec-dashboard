// Shared provisioning ActionDescriptor builders (project-provisioning ADR D7 /
// actions-keymap-palette): the two operator-invoked provisioning verbs: the
// served single primary affordance and the confirmation-gated replacement action,
// authored ONCE here so the not-managed empty-state panel (the one plane this
// verb is eligible for today: it targets a project-level state, not an entity,
// and has no natural keymap chord) composes the same descriptor the dispatch
// seam fires. Both dispatch through `PROVISION_RUN_ACTION`
// (`stores/server/provisionActions.ts`), never a bespoke per-panel handler.
//
// Global (non-entity) chrome-style verbs live in stores/view alongside
// `chromeActions.ts`/`graphCommands.ts`; this depends on stores/server
// provisioning types + the run-body derivation already owned there
// (`recommendedRunBody`/`forceInstallBody`, provisionControl.ts), so it stays
// out of that file to keep its escape-hatch charter unmixed.

import { Download, RotateCcw } from "lucide-react";

import type { ActionDescriptor } from "../../platform/actions/action";
import type { MessageDescriptor } from "../../platform/localization/message";
import type { ProvisionRecommendation, ProvisionStatus } from "../server/engine";
import { forceInstallBody, recommendedRunBody } from "../server/provisionControl";
import { PROVISION_RUN_ACTION } from "../server/provisionActions";

export const PROVISION_RECOMMENDED_ACTION_ID = "provision:recommended";
export const PROVISION_FORCE_INSTALL_ACTION_ID = "provision:force-install";

/** Plain-language action per served recommendation, never the raw wire token. */
const RECOMMENDATION_LABEL: Record<ProvisionRecommendation, MessageDescriptor> = {
  "not-a-git-project": { key: "projects:actions.prepareProjectTools" },
  "acquire-uv": { key: "projects:actions.prepareProjectTools" },
  "acquire-core": { key: "projects:actions.setUpProject" },
  "install-framework": { key: "projects:actions.setUpProject" },
  "run-migrations": { key: "projects:actions.updateProject" },
  "upgrade-core": { key: "projects:actions.updateProjectTools" },
  managed: { key: "projects:actions.setUpProject" },
};

/** Recommendations that need a user prerequisite render with an actionable
 * reason instead of dispatching an operation that cannot succeed. */
const RECOMMENDATION_DEAD_END_REASON: Partial<
  Record<ProvisionRecommendation, MessageDescriptor>
> = {
  "not-a-git-project": {
    key: "projects:disabledReasons.prepareFolderAsGitProject",
  },
  "acquire-uv": { key: "projects:disabledReasons.installRequiredProjectTools" },
};

/**
 * The primary affordance a `recommended` value maps to
 * (`recommendedRunBody`, the single served decision in ADR D2). Its label reflects
 * the current recommendation so the button reads the resulting action, like
 * `toggleGraphAction`. Disabled-with-reason on a hard dead-end or once already
 * managed (nothing left to dispatch); loading renders disabled with a neutral
 * label rather than a stale verb.
 */
export function provisionRecommendedAction(
  status: ProvisionStatus | undefined,
): ActionDescriptor {
  const base = {
    id: PROVISION_RECOMMENDED_ACTION_ID,
    section: "transform" as const,
    icon: Download,
    disabledInTimeTravel: true,
  };
  if (status === undefined) {
    return {
      ...base,
      label: { key: "projects:actions.setUpProject" },
      disabled: true,
      disabledReason: { key: "projects:disabledReasons.waitForProjectStatus" },
    };
  }
  const label = RECOMMENDATION_LABEL[status.recommended] ?? {
    key: "projects:actions.setUpProject",
  };
  const deadEndReason = RECOMMENDATION_DEAD_END_REASON[status.recommended];
  if (deadEndReason !== undefined) {
    return {
      ...base,
      label,
      disabled: true,
      disabledReason: deadEndReason,
    };
  }
  const body = recommendedRunBody(status);
  if (body === null || body === undefined) {
    return {
      ...base,
      label,
      disabled: true,
      disabledReason: { key: "projects:disabledReasons.noSetupChangesNeeded" },
    };
  }
  return {
    ...base,
    label,
    dispatch: { type: PROVISION_RUN_ACTION, payload: body },
  };
}

/**
 * The confirmation-gated replacement verb (ADR D5) is a second lane the
 * primary affordance never carries. A forced setup is destructive because it
 * prunes stale files and can overwrite user-authored content.
 * The typed confirmation explains the destructive change before dispatch, and
 * `forceInstallBody` carries the engine-required confirmation token. It is
 * enabled only when an existing setup can be replaced.
 */
export function provisionForceInstallAction(
  status: ProvisionStatus | undefined,
): ActionDescriptor {
  const base = {
    id: PROVISION_FORCE_INSTALL_ACTION_ID,
    label: { key: "projects:destructiveActions.replaceSetup" } as const,
    section: "danger" as const,
    icon: RotateCcw,
    disabledInTimeTravel: true,
  };
  if (status === undefined || !status.framework.vaultspec_present) {
    return {
      ...base,
      disabled: true,
      disabledReason: { key: "projects:disabledReasons.setUpProjectFirst" },
    };
  }
  return {
    ...base,
    confirmation: {
      kind: "destructive",
      title: { key: "projects:confirmations.replaceSetup.title" },
      body: { key: "projects:confirmations.replaceSetup.body" },
      confirmLabel: { key: "projects:destructiveActions.replaceSetup" },
      cancelLabel: { key: "common:actions.cancel" },
    } as const,
    dispatch: { type: PROVISION_RUN_ACTION, payload: forceInstallBody("all") },
  };
}
