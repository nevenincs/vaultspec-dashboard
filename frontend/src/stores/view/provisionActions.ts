// Shared provisioning ActionDescriptor builders (project-provisioning ADR D7 /
// actions-keymap-palette): the two operator-invoked provisioning verbs — the
// served single primary affordance, and the confirm-gated force reinstall —
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
import type { ProvisionRecommendation, ProvisionStatus } from "../server/engine";
import { forceInstallBody, recommendedRunBody } from "../server/provisionControl";
import { PROVISION_RUN_ACTION } from "../server/provisionActions";

export const PROVISION_RECOMMENDED_ACTION_ID = "provision:recommended";
export const PROVISION_FORCE_INSTALL_ACTION_ID = "provision:force-install";

/** Plain-language label per served recommendation (ui-labels-are-user-facing —
 *  never the raw `recommended` token on screen). Falls back to the token itself
 *  for a future value this map hasn't caught up to yet (tolerant-of-additive). */
const RECOMMENDATION_LABEL: Record<ProvisionRecommendation, string> = {
  "not-a-git-project": "Not a git repository",
  "acquire-uv": "Install uv to continue",
  "acquire-core": "Install vaultspec-core",
  "install-framework": "Install the framework",
  "run-migrations": "Run pending migrations",
  "upgrade-core": "Upgrade vaultspec-core",
  managed: "Already managed",
};

/** The two hard dead-ends the panel STATES rather than acts on (ADR
 *  Consequences: uv is never installed by us; a non-git target is never
 *  initialized by us) — the descriptor renders disabled-with-reason instead of
 *  a dispatch nothing would resolve. */
const RECOMMENDATION_DEAD_END_REASON: Partial<Record<ProvisionRecommendation, string>> =
  {
    "not-a-git-project": "initialize a git repository first, then retry",
    "acquire-uv": "install uv (docs.astral.sh/uv), then retry — uv is never installed",
  };

/**
 * "Fix it": the ONE primary affordance a `recommended` value maps to
 * (`recommendedRunBody`, the single served decision — ADR D2). Label reflects
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
      label: "Provision project",
      disabled: true,
      disabledReason: "reading status",
    };
  }
  const label = RECOMMENDATION_LABEL[status.recommended];
  const deadEndReason = RECOMMENDATION_DEAD_END_REASON[status.recommended];
  if (deadEndReason !== undefined) {
    return { ...base, label, disabled: true, disabledReason: deadEndReason };
  }
  const body = recommendedRunBody(status);
  if (body === null) {
    return { ...base, label, disabled: true, disabledReason: "nothing to provision" };
  }
  return {
    ...base,
    label,
    dispatch: { type: PROVISION_RUN_ACTION, payload: body },
  };
}

/**
 * "Reinstall (overwrite)": the confirm-gated force verb (ADR D5) — a second
 * lane the primary "Fix it" affordance never carries, since a force install is
 * destructive (prunes stale files, overwrites user-authored content). Carries
 * BOTH gates independently: the menu-level arm-to-confirm (`confirm: true`)
 * AND the engine-typed `PROVISION_FORCE_CONFIRM` token baked into the payload
 * by `forceInstallBody` — never hand-typed at a call site. Enabled once some
 * framework install exists to overwrite (a bare git root has nothing to
 * force-reinstall over).
 */
export function provisionForceInstallAction(
  status: ProvisionStatus | undefined,
): ActionDescriptor {
  const base = {
    id: PROVISION_FORCE_INSTALL_ACTION_ID,
    label: "Reinstall (overwrite)",
    section: "danger" as const,
    icon: RotateCcw,
    confirm: true,
    disabledInTimeTravel: true,
  };
  if (status === undefined || !status.framework.vaultspec_present) {
    return { ...base, disabled: true, disabledReason: "install the framework first" };
  }
  return {
    ...base,
    dispatch: { type: PROVISION_RUN_ACTION, payload: forceInstallBody("all") },
  };
}
