import { describe, expect, it } from "vitest";

import {
  resolveActionPresentation,
  type ActionPresentation,
} from "../../platform/actions/action";
import { resolveMessageResult } from "../../platform/localization/fallback";
import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import type { ProvisionRecommendation, ProvisionStatus } from "../server/engine";
import {
  provisionForceInstallAction,
  provisionRecommendedAction,
} from "./provisionActions";

function status(recommended: ProvisionRecommendation): ProvisionStatus {
  return {
    target: "/repo",
    managed: recommended === "managed",
    recommended,
    git: { present: recommended !== "not-a-git-project" },
    uv: { present: true, version: "0.4.0" },
    core: { version: "0.1.0", floor: "0.1.30", meets_floor: true },
    rag: { tool_version: null, floor: "0.2.20", enrolled: null },
    framework: {
      vaultspec_present: recommended === "managed",
      vault_present: recommended === "managed",
      providers: recommended === "managed" ? ["all"] : [],
    },
    pending_migrations: null,
  };
}

function migratedPresentations(): readonly ActionPresentation[] {
  const recommendations: ProvisionRecommendation[] = [
    "not-a-git-project",
    "acquire-uv",
    "acquire-core",
    "install-framework",
    "run-migrations",
    "upgrade-core",
    "managed",
  ];
  const actions = [
    provisionRecommendedAction(undefined),
    ...recommendations.map((recommendation) =>
      provisionRecommendedAction(status(recommendation)),
    ),
  ];
  const force = provisionForceInstallAction(status("managed"));
  const confirmation = force.confirmation;
  if (confirmation === undefined) throw new Error("Missing force confirmation");

  return [
    ...actions.flatMap((action) =>
      action.disabledReason === undefined
        ? [action.label]
        : [action.label, action.disabledReason],
    ),
    force.label,
    confirmation.title,
    confirmation.body,
    confirmation.confirmLabel,
    confirmation.cancelLabel,
  ];
}

describe("localized provisioning actions", () => {
  it("resolves every migrated presentation through genuine English, French, and Arabic catalogs", () => {
    const runtimes = [
      createTestLocalizationRuntime(),
      createTestLocalizationRuntime(ltrTestLocale),
      createTestLocalizationRuntime(rtlTestLocale),
    ] as const;

    for (const presentation of migratedPresentations()) {
      const results = runtimes.map((runtime) =>
        resolveActionPresentation(presentation, (descriptor) =>
          resolveMessageResult(runtime, descriptor),
        ),
      );
      expect(results.every(({ usedFallback }) => usedFallback === false)).toBe(true);
      expect(new Set(results.map(({ message }) => message)).size).toBe(3);
      for (const { message } of results) {
        expect(message).not.toMatch(
          /vaultspec|framework|migration|repository|\b(?:uv|wire|token|status id)\b|\u2014/iu,
        );
      }
    }
  });
});
