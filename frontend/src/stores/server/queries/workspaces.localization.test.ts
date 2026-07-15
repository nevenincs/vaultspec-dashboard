import { describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../../localization/testing";
import { resolveMessageResult } from "../../../platform/localization/fallback";
import {
  deriveWorkspaceMapAvailability,
  deriveWorkspaceMapPickerPresentationView,
  deriveWorktreePickerProjectRows,
  workspaceAheadMessage,
  workspaceBehindMessage,
} from "./workspaces";

describe("workspace identity localization", () => {
  it("resolves status and count messages in English, French, and Arabic", () => {
    const runtimes = [
      createTestLocalizationRuntime(),
      createTestLocalizationRuntime(ltrTestLocale),
      createTestLocalizationRuntime(rtlTestLocale),
    ];
    const expectedAhead = [
      ["0 commits ahead", "1 commit ahead", "2 commits ahead", "11 commits ahead"],
      [
        "0 validation en avance",
        "1 validation en avance",
        "2 validations en avance",
        "11 validations en avance",
      ],
      [
        "لا توجد التزامات متقدمة (0)",
        "متقدم بمقدار التزام واحد (1)",
        "متقدم بمقدار التزامين (2)",
        "متقدم بمقدار 11 التزامًا",
      ],
    ];

    for (const [runtimeIndex, runtime] of runtimes.entries()) {
      expect(
        [0, 1, 2, 11].map(
          (count) =>
            resolveMessageResult(runtime, workspaceAheadMessage(count)!).message,
        ),
      ).toEqual(expectedAhead[runtimeIndex]);
      expect(
        resolveMessageResult(runtime, workspaceBehindMessage(2)!).usedFallback,
      ).toBe(false);
    }
    expect(workspaceAheadMessage(Number.NaN)).toBeNull();
    expect(workspaceBehindMessage(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("preserves authored labels and branches while excluding transport details", () => {
    const authoredProject = " Projet Étoile ";
    const authoredBranch = " Feature/İ18N ";
    const path = "/private/builds/internal-token";
    const reason = "internal diagnostic unavailable";
    const availability = deriveWorkspaceMapAvailability({
      structural: { available: false, reason },
    });
    const view = deriveWorkspaceMapPickerPresentationView({
      map: {
        repositories: [
          {
            path,
            branches: [],
            worktrees: [
              {
                id: "action-only-id",
                path,
                branch: authoredBranch,
                has_vault: true,
              },
            ],
          },
        ],
        tiers: {},
      },
      activeScope: "action-only-id",
      pendingId: null,
      availability,
      projectLabel: authoredProject,
    });

    expect(view.projectLabel).toBe(authoredProject);
    expect(view.triggerLabel).toBe(authoredBranch);
    expect(view.rows[0]?.branch).toBe(authoredBranch);
    const presentation = JSON.stringify({
      triggerLabel: view.triggerLabel,
      triggerAriaLabel: view.triggerAriaLabel,
      degradedLabel: view.degradedLabel,
      row: {
        nameLabel: view.rows[0]?.nameLabel,
        title: view.rows[0]?.title,
        ariaLabel: view.rows[0]?.ariaLabel,
        degradedTitle: view.rows[0]?.degradedTitle,
      },
    });
    expect(presentation).not.toContain(path);
    expect(presentation).not.toContain(reason);
    expect(presentation).not.toContain("action-only-id");

    const projectRows = deriveWorktreePickerProjectRows(
      [
        {
          id: "workspace-internal-id",
          label: authoredProject,
          path,
          is_launch: true,
          reachable: false,
          unreachable_reason: reason,
        },
      ],
      null,
    );
    expect(projectRows[0]?.label).toBe(authoredProject);
    expect(JSON.stringify(projectRows)).not.toContain(path);
    expect(JSON.stringify(projectRows)).not.toContain(reason);
  });
});
