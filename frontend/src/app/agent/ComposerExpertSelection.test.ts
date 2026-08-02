import { describe, expect, it } from "vitest";

import type {
  ProviderCatalogRecord,
  ProviderCatalogSelection,
} from "../../stores/server/agent/a2aTeam";
import {
  MAX_TEAM_FALLBACKS,
  MAX_TEAM_ROLE_OVERRIDES,
  reconcileExpertSelections,
  servedTeamRoleIds,
} from "./ComposerExpertSelection";

const currentSelection: ProviderCatalogSelection = {
  provider_id: "provider-issued-id",
  execution_mode: "execution-lane-issued-id",
  catalog_revision: "catalog-revision-issued-id",
  entry_id: "entry-issued-id",
  controls: {},
};

const currentProvider: ProviderCatalogRecord = {
  provider_id: "provider-issued-id",
  execution_mode: "execution-lane-issued-id",
  health: {
    configured: "available",
    transport: "available",
    authentication: "authenticated",
    catalog: "available",
    admission: "admitted",
    selectable: true,
    reasons: [],
  },
  catalog: {
    state: {
      status: "available",
      revision: "catalog-revision-issued-id",
      checked_at: "2026-08-02T09:00:00Z",
      expires_at: "2099-08-02T09:00:00Z",
    },
    models: [{ entry_id: "entry-issued-id", capabilities: [] }],
    native_controls: [],
  },
};

describe("Composer expert selection boundary", () => {
  it("keeps the role list to unique served role ids at the A2A request bound", () => {
    const served = [
      "served-role-0",
      "served-role-0",
      ...Array.from(
        { length: MAX_TEAM_ROLE_OVERRIDES + 2 },
        (_, index) => `served-role-${index + 1}`,
      ),
    ];

    const roles = servedTeamRoleIds(served);

    expect(roles).toHaveLength(MAX_TEAM_ROLE_OVERRIDES);
    expect(roles).toEqual([
      "served-role-0",
      ...Array.from(
        { length: MAX_TEAM_ROLE_OVERRIDES - 1 },
        (_, index) => `served-role-${index + 1}`,
      ),
    ]);
  });

  it("removes non-served and stale selections before a run can carry them", () => {
    const staleSelection: ProviderCatalogSelection = {
      ...currentSelection,
      catalog_revision: "retired-catalog-revision",
    };
    const reconciled = reconcileExpertSelections({
      requiredRoles: ["served-role"],
      providers: [currentProvider],
      overrides: {
        "served-role": currentSelection,
        "unserved-role": currentSelection,
        "stale-served-role": staleSelection,
      },
      fallbacks: [
        currentSelection,
        staleSelection,
        ...Array.from({ length: MAX_TEAM_FALLBACKS + 2 }, () => currentSelection),
      ],
    });

    expect(reconciled.roleIds).toEqual(["served-role"]);
    expect(reconciled.overrides).toEqual({ "served-role": currentSelection });
    expect(reconciled.fallbacks).toHaveLength(MAX_TEAM_FALLBACKS);
    expect(
      reconciled.fallbacks.every((selection) => selection === currentSelection),
    ).toBe(true);
  });
});
