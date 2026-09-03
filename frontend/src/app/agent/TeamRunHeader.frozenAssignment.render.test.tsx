// @vitest-environment happy-dom
//
// Frozen assignment evidence comes from the authoritative run-status snapshot,
// never from the mutable provider catalog or the reduced roster projection.

import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import { createTestLocalizationRuntime } from "../../localization/testing";
import { adaptRunStatus, type RunProgress } from "../../stores/server/agent/a2aTeam";
import { TeamRunHeader } from "./TeamRunHeader";
import { TeamRunProgressContext } from "./TeamRunProgressContext";
import { deriveTeamRoster } from "./teamRun";

afterEach(cleanup);

function renderFrozenHeader() {
  // Feed the component through the production run-status adapter. The unsafe
  // provenance value therefore exercises the same admission boundary a real
  // brokered response uses, rather than a hand-typed view model.
  const status = adaptRunStatus({
    envelope: {
      run_id: "run-frozen-evidence",
      status: "running",
      roles: [{ agent_id: "writer-agent", state: "working" }],
      frozen_assignment: {
        schema_version: 1,
        digest:
          "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        assignments: [
          {
            role_id: "writer",
            agent_id: "writer-agent",
            provider_id: "provider-issued-id",
            provider_display_name: "Provider-issued display",
            execution_mode: "execution-lane-issued-id",
            catalog_revision: "catalog-revision-issued-id",
            entry_id: "entry-issued-id",
            model_name: "provider-issued-model-value",
            model_display_name: "Provider-issued model display",
            controls: [
              {
                control_id: "provider-native-control-issued-id",
                option_id: "provider-native-option-issued-id",
                provider_value: "provider-native-value",
                display_name: "Provider-native control",
                option_display_name: "Provider-native option",
              },
            ],
            fallbacks: [
              {
                provider_id: "fallback-provider-issued-id",
                execution_mode: "fallback-execution-lane-issued-id",
                catalog_revision: "fallback-catalog-revision-issued-id",
                entry_id: "fallback-entry-issued-id",
                model_name: "fallback-provider-issued-model-value",
                controls: [],
              },
            ],
            provenance: {
              selection_source: "team_selection",
              authorization: "must-never-render-from-provenance",
            },
          },
        ],
      },
    },
  });
  const progress: RunProgress = {
    frames: [],
    degraded: false,
    terminal: false,
    status,
  };
  const runtime = createTestLocalizationRuntime();
  return render(
    <I18nextProvider i18n={runtime}>
      <TeamRunProgressContext.Provider value={progress}>
        <TeamRunHeader roster={deriveTeamRoster([], status)} />
      </TeamRunProgressContext.Provider>
    </I18nextProvider>,
  );
}

describe("TeamRunHeader frozen assignment evidence", () => {
  it("renders exact frozen execution values, ordered fallback plan, and only admitted provenance", () => {
    const { container } = renderFrozenHeader();
    const frozen = container.querySelector("[data-frozen-assignment]");
    expect(frozen).not.toBeNull();
    expect(
      frozen?.querySelector("[data-frozen-schema-version]")?.textContent,
    ).toContain("1");
    expect(frozen?.querySelector("[data-frozen-digest]")?.textContent).toContain(
      "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    );
    expect(frozen?.textContent).toContain("Provider-issued display");
    expect(frozen?.textContent).toContain("provider-issued-id");
    expect(frozen?.textContent).toContain("provider-issued-model-value");
    expect(frozen?.textContent).toContain("entry-issued-id");
    expect(frozen?.querySelector("[data-frozen-control]")?.textContent).toContain(
      "provider-native-value",
    );
    expect(frozen?.querySelector("[data-frozen-control]")?.textContent).toContain(
      "Provider-native option",
    );
    expect(frozen?.querySelector("[data-frozen-fallback-plan]")?.textContent).toContain(
      "fallback-provider-issued-model-value",
    );
    expect(screen.getByText("Team selection")).toBeTruthy();
    expect(screen.queryByText("team_selection")).toBeNull();
    expect(container.textContent).not.toContain("must-never-render-from-provenance");
  });

  it("suppresses legacy bindings when a modern frozen field is present but invalid", () => {
    const status = adaptRunStatus({
      envelope: {
        run_id: "run-invalid-frozen-evidence",
        status: "running",
        roles: [{ agent_id: "writer-agent", state: "working" }],
        frozen_assignment: { schema_version: 2 },
        assignments: [
          {
            role_id: "writer",
            agent_id: "writer-agent",
            provider_id: "legacy-provider-must-not-render",
            model_name: "legacy-model-must-not-render",
          },
        ],
      },
    });
    const progress: RunProgress = {
      frames: [],
      degraded: false,
      terminal: false,
      status,
    };
    const runtime = createTestLocalizationRuntime();
    const { container } = render(
      <I18nextProvider i18n={runtime}>
        <TeamRunProgressContext.Provider value={progress}>
          <TeamRunHeader roster={deriveTeamRoster([], status)} />
        </TeamRunProgressContext.Provider>
      </I18nextProvider>,
    );

    expect(container.querySelector("[data-frozen-assignment-invalid]")).not.toBeNull();
    expect(
      screen.getByText("Frozen assignment evidence is incomplete and cannot be shown."),
    ).toBeTruthy();
    expect(container.textContent).not.toContain("legacy-provider-must-not-render");
    expect(container.textContent).not.toContain("legacy-model-must-not-render");
  });
});
