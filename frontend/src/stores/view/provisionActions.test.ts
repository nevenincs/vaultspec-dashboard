// Provisioning ActionDescriptor builders (project-provisioning ADR D7): pure
// function tests over a served ProvisionStatus fixture, mirroring
// `degradedBannerCopy`'s pure+testable precedent. The wire-routed dispatch
// effect itself is covered live in `stores/server/provisionActions.test.ts`.

import { describe, expect, it } from "vitest";

import type { ProvisionRecommendation, ProvisionStatus } from "../server/engine";
import { PROVISION_FORCE_CONFIRM } from "../server/provisionControl";
import { PROVISION_RUN_ACTION } from "../server/provisionActions";
import {
  PROVISION_FORCE_INSTALL_ACTION_ID,
  PROVISION_RECOMMENDED_ACTION_ID,
  provisionForceInstallAction,
  provisionRecommendedAction,
} from "./provisionActions";

function status(
  recommended: ProvisionRecommendation,
  overrides: Partial<ProvisionStatus> = {},
): ProvisionStatus {
  return {
    target: "/repo",
    managed: recommended === "managed",
    recommended,
    git: { present: recommended !== "not-a-git-project" },
    uv: { present: true, version: "0.4.0" },
    core: { version: "0.1.0", floor: "0.1.30", meets_floor: true },
    rag: { tool_version: null, floor: "0.2.20", enrolled: null },
    framework: { vaultspec_present: false, vault_present: false, providers: [] },
    pending_migrations: null,
    ...overrides,
  };
}

describe("provisionRecommendedAction", () => {
  it("is disabled while status is loading, never a stale verb", () => {
    const action = provisionRecommendedAction(undefined);
    expect(action.id).toBe(PROVISION_RECOMMENDED_ACTION_ID);
    expect(action.label).toEqual({ key: "projects:actions.setUpProject" });
    expect(action.disabled).toBe(true);
    expect(action.disabledReason).toEqual({
      key: "projects:disabledReasons.waitForProjectStatus",
    });
    expect(action.dispatch).toBeUndefined();
  });

  it("dispatches the served single recommended action, never a client-invented one", () => {
    const action = provisionRecommendedAction(status("install-framework"));
    expect(action.disabled).toBeUndefined();
    expect(action.dispatch).toEqual({
      type: PROVISION_RUN_ACTION,
      payload: { action: "install", provider: "all", workspace: undefined },
    });
    expect(action.label).toEqual({ key: "projects:actions.setUpProject" });
  });

  it("states the two hard dead-ends rather than dispatching a no-op", () => {
    const gitless = provisionRecommendedAction(status("not-a-git-project"));
    expect(gitless.label).toEqual({ key: "projects:actions.prepareProjectTools" });
    expect(gitless.disabled).toBe(true);
    expect(gitless.disabledReason).toEqual({
      key: "projects:disabledReasons.prepareFolderAsGitProject",
    });
    expect(gitless.dispatch).toBeUndefined();

    const noUv = provisionRecommendedAction(status("acquire-uv"));
    expect(noUv.label).toEqual({ key: "projects:actions.prepareProjectTools" });
    expect(noUv.disabled).toBe(true);
    expect(noUv.disabledReason).toEqual({
      key: "projects:disabledReasons.installRequiredProjectTools",
    });
    expect(noUv.dispatch).toBeUndefined();
  });

  it("is disabled with a reason once already managed (nothing left to fix)", () => {
    const action = provisionRecommendedAction(status("managed"));
    expect(action.label).toEqual({ key: "projects:actions.setUpProject" });
    expect(action.disabled).toBe(true);
    expect(action.disabledReason).toEqual({
      key: "projects:disabledReasons.noSetupChangesNeeded",
    });
    expect(action.dispatch).toBeUndefined();
  });

  it("maps each actionable recommendation to the canonical project action", () => {
    expect(provisionRecommendedAction(status("acquire-core")).label).toEqual({
      key: "projects:actions.setUpProject",
    });
    expect(provisionRecommendedAction(status("install-framework")).label).toEqual({
      key: "projects:actions.setUpProject",
    });
    expect(provisionRecommendedAction(status("run-migrations")).label).toEqual({
      key: "projects:actions.updateProject",
    });
    expect(provisionRecommendedAction(status("upgrade-core")).label).toEqual({
      key: "projects:actions.updateProjectTools",
    });
  });

  it("fails closed without exposing an unknown recommendation", () => {
    const unknownStatus = {
      ...status("managed"),
      recommended: "future-internal-recommendation",
      managed: false,
    } as unknown as ProvisionStatus;
    const action = provisionRecommendedAction(unknownStatus);

    expect(action.label).toEqual({ key: "projects:actions.setUpProject" });
    expect(action.disabled).toBe(true);
    expect(action.disabledReason).toEqual({
      key: "projects:disabledReasons.noSetupChangesNeeded",
    });
    expect(action.dispatch).toBeUndefined();
  });

  it("always carries the SAME id across recommendations (one shared verb)", () => {
    expect(provisionRecommendedAction(status("acquire-core")).id).toBe(
      PROVISION_RECOMMENDED_ACTION_ID,
    );
    expect(provisionRecommendedAction(status("run-migrations")).id).toBe(
      PROVISION_RECOMMENDED_ACTION_ID,
    );
  });
});

describe("provisionForceInstallAction", () => {
  it("is disabled with a reason when nothing is installed to overwrite", () => {
    const action = provisionForceInstallAction(status("not-a-git-project"));
    expect(action.id).toBe(PROVISION_FORCE_INSTALL_ACTION_ID);
    expect(action.label).toEqual({
      key: "projects:destructiveActions.replaceSetup",
    });
    expect(action.disabled).toBe(true);
    expect(action.disabledReason).toEqual({
      key: "projects:disabledReasons.setUpProjectFirst",
    });
    expect(action.dispatch).toBeUndefined();
  });

  it("is disabled while status is loading", () => {
    const action = provisionForceInstallAction(undefined);
    expect(action.disabled).toBe(true);
  });

  it("carries typed confirmation copy and the engine-required confirmation token", () => {
    const action = provisionForceInstallAction(
      status("run-migrations", {
        framework: { vaultspec_present: true, vault_present: true, providers: ["all"] },
      }),
    );
    expect(action.confirm).toBeUndefined();
    expect(action.confirmation).toEqual({
      kind: "destructive",
      title: { key: "projects:confirmations.replaceSetup.title" },
      body: { key: "projects:confirmations.replaceSetup.body" },
      confirmLabel: { key: "projects:destructiveActions.replaceSetup" },
      cancelLabel: { key: "common:actions.cancel" },
    });
    expect(action.dispatch).toEqual({
      type: PROVISION_RUN_ACTION,
      payload: {
        action: "install",
        provider: "all",
        force: true,
        confirm: PROVISION_FORCE_CONFIRM,
        workspace: undefined,
        worktree: undefined,
      },
    });
  });

  it("always includes the engine-required confirmation token", () => {
    const action = provisionForceInstallAction(
      status("acquire-core", {
        framework: { vaultspec_present: true, vault_present: false, providers: [] },
      }),
    );
    const payload = action.dispatch?.payload as { confirm?: string } | undefined;
    expect(payload?.confirm).toBe(PROVISION_FORCE_CONFIRM);
  });
});
