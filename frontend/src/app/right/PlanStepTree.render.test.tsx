// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createElement } from "react";
import { I18nextProvider } from "react-i18next";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import type { PlanInteriorView } from "../../stores/server/queries";
import { engineKeys, usePlanInteriorView } from "../../stores/server/queries";
import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import { sourceLocale } from "../../locales/en";
import { authoringClient, setActorToken } from "../../stores/server/authoring";
import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { createLiveClient, liveScope } from "../../testing/liveClient";
import { ENGINE_WAIT } from "../../testing/timing";
import { PlanStepTree } from "./PlanStepTree";

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Render helper: PlanStepTree now calls useNodeContent at its root (to fetch
// the plan's blob_hash for the tick fence), so ALL renders need a QueryClient.
// ---------------------------------------------------------------------------

function renderPure(view: PlanInteriorView, extraProps: Record<string, unknown> = {}) {
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(PlanStepTree, { view, ...extraProps }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Static unit tests (no live engine): shape and state-mode correctness.
// ---------------------------------------------------------------------------

const emptyView: PlanInteriorView = {
  loading: false,
  served: true,
  empty: true,
  waves: [],
  phases: [],
  steps: [],
  hasUngroupedSteps: false,
  rollup: { done: 0, total: 0 },
  summary: {
    wave_count: 0,
    phase_count: 0,
    step_count: 0,
    done_count: 0,
    plan_state: null,
  },
  truncated: null,
  loadingMessage: { key: "common:finalWave.planInterior.loading" },
  placeholderMessage: { key: "common:finalWave.planInterior.notServed" },
  emptyMessage: { key: "common:finalWave.planInterior.empty" },
  listAriaLabel: { key: "common:finalWave.planInterior.list" },
  truncatedMessage: null,
};

describe("PlanStepTree", () => {
  afterEach(() => {
    queryClient.clear();
  });

  it("renders a UI-only skeleton while the bounded interior is pending (no on-screen text)", () => {
    const { container } = renderPure({ ...emptyView, loading: true });

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    // The message is the screen-reader label ONLY — never visible body copy (ADR D2).
    const srOnly = container.querySelector(".sr-only");
    expect(srOnly?.textContent).toContain("loading steps");
    const visible = (status.textContent ?? "")
      .replace(srOnly?.textContent ?? "", "")
      .trim();
    expect(visible).toBe("");
    // Pure shape: skeleton rows.
    expect(container.querySelectorAll(".bg-rule-strong").length).toBeGreaterThan(2);
  });

  it("renders an empty designed state for plans without interior steps", () => {
    renderPure(emptyView);

    expect(screen.getByText("no steps in this plan yet.")).toBeTruthy();
  });

  it("renders the honest bounded-truncation message", () => {
    renderPure({
      ...emptyView,
      empty: false,
      phases: [
        {
          node_id: "phase:one",
          id: "P1",
          steps: [],
          rollup: { done: 0, total: 0 },
        },
      ],
      truncated: { returned_nodes: 40, total_nodes: 90, reason: "node ceiling" },
      truncatedMessage: {
        key: "common:finalWave.planInterior.truncated",
        values: { returned: 40, total: 90 },
      },
    });

    expect(screen.getByRole("status").textContent).toContain("showing 40 of 90");
  });

  it("keeps hostile plan identities out of same-node localized presentation", async () => {
    const hostileId = "S01-SUPER-SECRET";
    const hostileExecId = "doc:exec-SUPER-SECRET";
    const runtime = createTestLocalizationRuntime();
    const view: PlanInteriorView = {
      ...emptyView,
      empty: false,
      hasUngroupedSteps: true,
      steps: [
        {
          node_id: `step:${hostileId}`,
          id: hostileId,
          done: false,
          exec_node_id: hostileExecId,
          targetNodeId: hostileExecId,
          selectable: true,
          headingLabel: { key: "common:finalWave.planSteps.generic" },
          rowAriaLabel: {
            key: "common:finalWave.planSteps.openGenericRecord",
          },
          rowClassName: "",
        },
      ],
    };

    render(
      <I18nextProvider i18n={runtime}>
        <QueryClientProvider client={queryClient}>
          <PlanStepTree view={view} />
        </QueryClientProvider>
      </I18nextProvider>,
    );

    const checkbox = screen.getByRole("checkbox", { name: "Plan step" });
    const openButton = screen.getByRole("button", {
      name: "Open record for this plan step",
    });
    const assertNoIdentityLeak = () => {
      expect(document.body.textContent).not.toContain(hostileId);
      expect(document.body.textContent).not.toContain(hostileExecId);
      for (const node of [checkbox, openButton]) {
        expect(node.getAttribute("aria-label")).not.toContain(hostileId);
        expect(node.getAttribute("aria-label")).not.toContain(hostileExecId);
        expect(node.getAttribute("title") ?? "").not.toContain(hostileId);
        expect(node.getAttribute("title") ?? "").not.toContain(hostileExecId);
      }
    };

    assertNoIdentityLeak();
    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(checkbox.getAttribute("aria-label")).toBe("Étape du plan");
    expect(openButton.getAttribute("aria-label")).toBe(
      "Ouvrir l’enregistrement de cette étape du plan",
    );
    assertNoIdentityLeak();
    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(checkbox.getAttribute("aria-label")).toBe("خطوة في الخطة");
    expect(openButton.getAttribute("aria-label")).toBe("فتح سجل هذه الخطوة في الخطة");
    assertNoIdentityLeak();
    await act(async () => runtime.changeLanguage(sourceLocale));
  });
});

// ---------------------------------------------------------------------------
// Live-engine tests: tick S02 through the UI, assert in-flight and reconciled
// served state, restore in finally (authoring-surface ADR D1 / S13).
// ---------------------------------------------------------------------------

/** The fixture plan stem (canonicalized in W02.P03 S11). */
const ALPHA_PLAN_STEM = "2026-01-03-alpha-plan";
const ALPHA_PLAN_NODE_ID = `doc:${ALPHA_PLAN_STEM}`;

/** S01 has a fixture exec record at .vault/exec/2026-01-03-alpha/2026-01-03-alpha-S01.md,
 *  so the engine serves exec_node_id for S01 → selectable=true, targetNodeId set. */
const ALPHA_S01_EXEC_NODE_ID = "doc:2026-01-03-alpha-S01";

/** Mount PlanStepTree with a live QueryClientProvider, bound to the fixture
 *  plan. The interior view is fetched by the component through the hook. */
function LivePlanStepTree({
  planNodeId,
  scope,
  isTimeTravel,
}: {
  planNodeId: string;
  scope: string;
  isTimeTravel: boolean;
}) {
  const interior = usePlanInteriorView(planNodeId, scope);
  return (
    <PlanStepTree
      view={interior}
      planNodeId={planNodeId}
      scope={scope}
      isTimeTravel={isTimeTravel}
    />
  );
}

function renderLivePlanStepTree(scope: string, isTimeTravel: boolean) {
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(LivePlanStepTree, {
        planNodeId: ALPHA_PLAN_NODE_ID,
        scope,
        isTimeTravel,
      }),
    ),
  );
}

let scope: string;
let sessionActorRawToken: string;

beforeAll(async () => {
  scope = await liveScope();
  // Bootstrap an actor token for the session so usePlanStepTick can call
  // requireActorToken() inside the render test (mirrors comments.live.test.ts).
  const issued = await authoringClient.issueActorToken({
    actor: { id: `human:plansurface-render-${Date.now()}`, kind: "human" },
  });
  sessionActorRawToken = issued.raw_token;
  setActorToken(sessionActorRawToken);
});

afterAll(() => {
  setActorToken(null);
  useViewStore.getState().setScope(null);
});

beforeEach(() => {
  queryClient.clear();
  useViewStore.getState().setScope(scope);
});

afterEach(() => {
  queryClient.clear();
});

describe("PlanStepTree live: plan-step checkbox (authoring-surface D1)", () => {
  it(
    "ticks S02 through the checkbox, shows in-flight state, then reconciles to the served done state",
    async () => {
      renderLivePlanStepTree(scope, false);

      // Wait for both checkboxes from the live engine: S01 done=true, S02 done=false,
      // and the plan's blob_hash loaded so S02 is enabled (canTick=true).
      // aria-label now includes the heading text — use regex for prefix matching.
      await waitFor(() => {
        const s01 = screen.getByRole("checkbox", {
          name: /scaffold the alpha module/,
        }) as HTMLInputElement;
        const s02 = screen.getByRole("checkbox", {
          name: /wire the alpha reader/,
        }) as HTMLInputElement;
        expect(s01).toBeTruthy();
        expect(s02).toBeTruthy();
        // S01 is done in the fixture.
        expect(s01.checked).toBe(true);
        // S02 is open in the fixture.
        expect(s02.checked).toBe(false);
        // S02 must be enabled — blob_hash loaded, not time-travel.
        expect(s02.disabled).toBe(false);
      }, ENGINE_WAIT);

      const s02 = screen.getByRole("checkbox", {
        name: /wire the alpha reader/,
      }) as HTMLInputElement;

      try {
        // Tick S02 via the UI — fires usePlanStepTick through the checkbox onChange.
        fireEvent.click(s02);

        // IN-FLIGHT STATE: optimistically checked + disabled while the mutation is
        // pending or the served state hasn't reconciled (pendingDone !== null).
        expect(s02.checked).toBe(true);
        expect(s02.disabled).toBe(true);

        // SETTLED STATE: wait until the tick mutation HTTP round-trip completes
        // (tick.isPending → false) and the checkbox re-enables. The plan-interior
        // watcher re-ingest follows asynchronously; pendingDone holds the "checked"
        // visual until step.done reconciles, but the checkbox re-enables the moment
        // the server acknowledges the tick — so this assertion is bounded by the
        // HTTP round-trip, not the watcher latency.
        await waitFor(() => {
          expect(s02.checked).toBe(true);
          expect(s02.disabled).toBe(false);
        }, ENGINE_WAIT);
      } finally {
        // RESTORE: re-open S02 so all other suites see the canonical [x]/[ ] fixture.
        // Use authoringClient directly — a clean non-UI restore, mirroring how
        // comments.live.test.ts restores the comment fixture.
        const restored = await createLiveClient().content(ALPHA_PLAN_NODE_ID, scope);
        await authoringClient.directWrite(
          {
            operation: "set_plan_step_state",
            ref: ALPHA_PLAN_STEM,
            planStep: { stepId: "S02", state: "unchecked" },
            expected_blob_hash: restored.blob_hash,
            scope,
          },
          { actorToken: sessionActorRawToken },
        );
        queryClient.clear();
      }
    },
    // ENGINE_WAIT for initial load + ENGINE_WAIT for mutation HTTP round-trip + restore headroom.
    ENGINE_WAIT.timeout * 2 + 5000,
  );

  it(
    "ArrowRight on a selectable step checkbox opens its exec record (keyboard-preview parity)",
    async () => {
      // S01 has a fixture exec record, so it is selectable (targetNodeId set).
      // The preview button renders as "step S01, open exec record" — getByRole
      // confirms selectability and fails clearly if the exec record is missing.
      renderLivePlanStepTree(scope, false);

      await waitFor(() => {
        // Confirm S01 is selectable: its preview button says "open exec record".
        expect(
          screen.getByRole("button", {
            name: /open record for scaffold the alpha module/i,
          }),
        ).toBeTruthy();
        // S01's checkbox must be present.
        expect(
          screen.getByRole("checkbox", { name: /scaffold the alpha module/ }),
        ).toBeTruthy();
      }, ENGINE_WAIT);

      const s01 = screen.getByRole("checkbox", {
        name: /scaffold the alpha module/,
      }) as HTMLInputElement;

      // Fire ArrowRight — the focus-zone cross-axis (onCrossNext) calls
      // selectDashboardNode(step.targetNodeId), which is the same action as clicking
      // the preview button. The keyboard path is a symmetry requirement, not a new
      // capability; this test asserts parity.
      fireEvent.keyDown(s01, { key: "ArrowRight" });

      // patchDashboardState() is fire-and-forget (void). Wait for it to land in the
      // query cache: updateDashboardStateCache calls queryClient.setQueryData on any
      // ["engine", ...] key that contains the response. Scan the full engine subtree
      // for any dashboardState entry with the target exec node selected.
      await waitFor(() => {
        const allEngineData = queryClient.getQueriesData<{
          selected_ids?: string[];
        }>({ queryKey: engineKeys.all, exact: false });
        const isSelected = allEngineData.some(
          ([, data]) =>
            Array.isArray(data?.selected_ids) &&
            data.selected_ids.includes(ALPHA_S01_EXEC_NODE_ID),
        );
        expect(isSelected).toBe(true);
      }, ENGINE_WAIT);
    },
    ENGINE_WAIT.timeout * 2 + 5000,
  );

  it("disables checkboxes when isTimeTravel is true and explains why via the label title", async () => {
    renderLivePlanStepTree(scope, true);

    // Wait for the step tree to arrive (interior served from the live engine).
    // aria-label now includes heading text — use regex.
    await waitFor(() => {
      expect(
        screen.getByRole("checkbox", { name: /wire the alpha reader/ }),
      ).toBeTruthy();
    }, ENGINE_WAIT);

    const s02 = screen.getByRole("checkbox", {
      name: /wire the alpha reader/,
    }) as HTMLInputElement;
    // In time-travel mode canTick=false, so the checkbox is always disabled.
    expect(s02.disabled).toBe(true);
    // The wrapping <label> carries the explaining title attribute.
    const label = s02.closest("label");
    expect(label?.getAttribute("title")).toContain("viewing history");
  });
});
