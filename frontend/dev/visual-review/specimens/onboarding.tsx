// Specimens: `onboarding` area (the first-run empty-registry takeover).
//
// `FirstRunOnboardingBody` is the wire-free presentation; `resolveFirstRunOnboardingState`
// is the pure resolver the wired `FirstRunOnboarding` container runs over `useWorkspaces()`.
// The surface is binary — visible ("onboarding") or hidden — with hidden covering three
// distinct honest causes (in-flight registry read, a non-empty registry, a hard read
// failure). Rather than mount the container and fabricate a query state to reach each
// cause, every non-normal state runs the SAME pure resolver directly over authored inputs
// mirroring the real query shapes, so the "renders nothing" claim is verified against the
// production resolver rather than merely asserted in a note.

import {
  FirstRunOnboardingBody,
  resolveFirstRunOnboardingState,
} from "@app/app/onboarding/FirstRunOnboarding";
import type { WorkspacesState } from "@app/stores/server/engine";

import type { SpecimenDef } from "../registry";
import type { ReviewState } from "../state";
import { tiersHealthy } from "./support";

/** The authored `useWorkspaces()` shape resolveFirstRunOnboardingState reads, for
 *  each non-normal review state. `normal` is handled separately by rendering the
 *  body directly, so it has no entry here. */
function workspacesReadInputs(state: Exclude<ReviewState, "normal">): {
  isPending: boolean;
  isError: boolean;
  data: WorkspacesState | undefined;
} {
  switch (state) {
    case "loading":
      return { isPending: true, isError: false, data: undefined };
    case "degraded":
      return { isPending: false, isError: true, data: undefined };
    case "empty":
      // A non-empty registry is what makes this surface go away — the honest
      // "empty" condition for a takeover surface is that it has nothing to take
      // over, because a project is already registered.
      return {
        isPending: false,
        isError: false,
        data: {
          workspaces: [
            {
              id: "review-workspace",
              label: "vaultspec-dashboard",
              path: "/workspace/vaultspec-dashboard",
              is_launch: true,
              reachable: true,
              unreachable_reason: null,
            },
          ],
          active_workspace: "review-workspace",
          tiers: tiersHealthy("structural"),
        },
      };
  }
}

/** Renders the honest "hidden" outcome for a non-normal state, verified against the
 *  real pure resolver rather than asserted by note alone: a resolver drift that
 *  stopped returning `hidden` for these inputs throws here instead of silently
 *  showing a stale claim. */
function HiddenOutcome({ state }: { state: Exclude<ReviewState, "normal"> }) {
  const resolved = resolveFirstRunOnboardingState(workspacesReadInputs(state));
  if (resolved.kind !== "hidden") {
    throw new Error(
      `onboarding-firstrunonboarding: expected the ${state} inputs to resolve hidden, got ${resolved.kind}`,
    );
  }
  return null;
}

export const onboardingSpecimens: Readonly<Record<string, SpecimenDef>> = {
  "onboarding-firstrunonboarding": {
    note: "Prefers the wire-free FirstRunOnboardingBody for the one visible condition (Default). The surface is binary in production — visible or hidden — so Loading/Empty/Degraded all resolve to the real 'renders nothing' outcome; each is verified by re-running the production resolveFirstRunOnboardingState over authored inputs mirroring an in-flight read, a non-empty registry, and a hard read failure, rather than a bare claim.",
    render: (state) =>
      state === "normal" ? (
        <FirstRunOnboardingBody onAddProject={() => undefined} />
      ) : (
        <HiddenOutcome state={state} />
      ),
  },
};
