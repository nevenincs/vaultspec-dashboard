// Specimens: `stage` area.
//
// CanvasStateOverlay, FilterMenu, and ProvisionPanelBody are wire-free views, driven
// directly by authored view-model inputs. FilterSidebar, CategoryLegend, and DocPanel
// are containers, so each cell seeds its own queries at the real `engineKeys`.
// WorkspaceGhost takes no props and reads no query at all.
//
// stage-stage, stage-dockworkspace, stage-graphcontrols, stage-graphpanel, and
// stage-minimapwidget are authored elsewhere.

import {
  CanvasStateOverlay,
  resolveCanvasState,
  type CanvasStateInputs,
} from "@app/app/stage/CanvasStateOverlay";
import { CategoryLegend } from "@app/app/stage/CategoryLegend";
import { DocPanel, type DocPanelParams } from "@app/app/stage/DocPanel";
import {
  FilterMenu,
  type FilterFacetOption,
  type FilterMenuSection,
} from "@app/app/stage/FilterMenu";
import { FilterSidebar } from "@app/app/stage/FilterSidebar";
import {
  ProvisionPanelBody,
  type ProvisionPanelBodyProps,
} from "@app/app/stage/ProvisionPanel";
import { WorkspaceGhost } from "@app/app/stage/WorkspaceGhost";

import { dashboardGraphQueryVariables } from "@app/stores/server/dashboardState";
import type {
  ContentResponse,
  DashboardState,
  EngineNode,
  FiltersVocabulary,
  GraphSlice,
  ProvisionJob,
  ProvisionStatus,
  TiersBlock,
} from "@app/stores/server/engine";
import {
  engineKeys,
  normalizeGraphSliceRequestIdentity,
  type GraphSliceAvailability,
} from "@app/stores/server/queries";
import {
  authoredFilterLabel,
  filterMessageLabel,
  FILTER_MESSAGES,
} from "@app/stores/view/filterPresentation";
import { DEFAULT_RENDER_CAPABILITY } from "@app/stores/view/renderCapability";

import type { IDockviewPanelProps } from "dockview";

import type { SpecimenDef } from "../registry";
import type { ReviewState } from "../state";
import {
  authoredDashboardState,
  REVIEW_SCOPE,
  SAMPLE_MARKDOWN,
  seedSessionAndDashboardState,
  tiersDown,
  tiersHealthy,
} from "./support";

// --- stage-canvasstateoverlay ------------------------------------------------------
//
// Pure view: `CanvasStateOverlay({ state })` renders `resolveCanvasState(inputs)`.
// The primary/annotation split means "degraded" is not a distinct primary card here
// (there is no such CanvasPrimary kind) — it is the annotation chip layered over an
// otherwise-`ok` slice, so that is what's authored for the degraded cell.

function canvasSlice(): GraphSlice {
  return {
    nodes: [
      { id: "doc:alpha-research", kind: "doc", doc_type: "research" },
      { id: "doc:alpha-adr", kind: "doc", doc_type: "adr" },
    ],
    edges: [],
    tiers: tiersHealthy("structural"),
  };
}

function canvasAvailability(
  overrides: Partial<GraphSliceAvailability> = {},
): GraphSliceAvailability {
  return {
    degraded: false,
    degradedTiers: [],
    reasons: {},
    loading: false,
    refreshing: false,
    ...overrides,
  };
}

const CANVAS_STATE_INPUTS: Record<ReviewState, CanvasStateInputs> = {
  normal: {
    scope: REVIEW_SCOPE,
    granularity: "feature",
    stageSurface: "normal",
    slice: canvasSlice(),
    queriedScope: REVIEW_SCOPE,
    // A quiet, non-blocking "refreshing" caption is the one visible thing an
    // otherwise-healthy (`ok`) slice can show — the overlay is error/loading chrome
    // only, so a fully idle-healthy slice renders nothing at all (see note below).
    availability: canvasAvailability({ refreshing: true }),
    renderCapability: DEFAULT_RENDER_CAPABILITY,
    scopeResolutionFailed: false,
  },
  loading: {
    scope: REVIEW_SCOPE,
    granularity: "feature",
    stageSurface: "normal",
    slice: null,
    queriedScope: null,
    availability: canvasAvailability({ loading: true }),
    renderCapability: DEFAULT_RENDER_CAPABILITY,
    scopeResolutionFailed: false,
  },
  empty: {
    scope: REVIEW_SCOPE,
    granularity: "feature",
    // The ONLY path to the `empty` primary (Folder / "no filter matches" card) is
    // this surface flag — resolvePrimary never inspects node count directly.
    stageSurface: "empty-invitation",
    slice: { nodes: [], edges: [], tiers: tiersHealthy("structural") },
    queriedScope: REVIEW_SCOPE,
    availability: canvasAvailability(),
    renderCapability: DEFAULT_RENDER_CAPABILITY,
    scopeResolutionFailed: false,
  },
  degraded: {
    scope: REVIEW_SCOPE,
    granularity: "feature",
    stageSurface: "normal",
    slice: canvasSlice(),
    queriedScope: REVIEW_SCOPE,
    availability: canvasAvailability({
      degraded: true,
      degradedTiers: ["structural"],
      reasons: {
        structural: "Authored review state: structural links are rebuilding.",
      },
    }),
    renderCapability: DEFAULT_RENDER_CAPABILITY,
    scopeResolutionFailed: false,
  },
};

// --- stage-filtermenu ---------------------------------------------------------------
//
// Pure view: hand-authored `FilterMenuSection[]` (a checkbox KIND section, a checkbox
// TOPIC section with its own search field, and a radio EDITED section), mirroring the
// section families `FilterSidebar` composes from served vocabulary.

function filterMenuSections(state: ReviewState): FilterMenuSection[] {
  const loading = state === "loading";
  const populated = state === "normal" || state === "degraded";
  const kindOptions: FilterFacetOption[] = populated
    ? [
        {
          value: "research",
          label: filterMessageLabel(FILTER_MESSAGES.options.research),
          count: 12,
        },
        {
          value: "adr",
          label: filterMessageLabel(FILTER_MESSAGES.options.adr),
          count: 4,
          dot: "complete",
        },
        {
          value: "plan",
          label: filterMessageLabel(FILTER_MESSAGES.options.plan),
          count: 3,
          dot: "active",
        },
      ]
    : [];
  const topicOptions: FilterFacetOption[] = populated
    ? [
        { value: "graph-legend", label: authoredFilterLabel("graph-legend"), count: 6 },
        {
          value: "filter-controls",
          label: authoredFilterLabel("filter-controls"),
          count: 3,
        },
      ]
    : [];
  return [
    {
      type: "checkbox",
      key: "kind",
      label: FILTER_MESSAGES.sections.kind,
      options: kindOptions,
      selected: populated ? ["adr"] : [],
      onToggle: () => undefined,
      loading,
      emptyLabel: FILTER_MESSAGES.empty,
    },
    {
      type: "checkbox",
      key: "feature",
      label: FILTER_MESSAGES.sections.feature,
      options: topicOptions,
      selected: [],
      onToggle: () => undefined,
      search: {
        value: "",
        onChange: () => undefined,
        placeholder: FILTER_MESSAGES.searchFeatures,
      },
      loading,
      emptyLabel: FILTER_MESSAGES.empty,
    },
    {
      type: "radio",
      key: "edited",
      label: FILTER_MESSAGES.sections.edited,
      options: [
        { value: "any", label: FILTER_MESSAGES.edited.any },
        { value: "7d", label: FILTER_MESSAGES.edited["7d"] },
        { value: "30d", label: FILTER_MESSAGES.edited["30d"] },
        { value: "year", label: FILTER_MESSAGES.edited.year },
      ],
      value: "any",
      onSelect: () => undefined,
    },
  ];
}

// --- stage-filtersidebar -------------------------------------------------------------
//
// Container: portals to `document.body` and anchors to `[data-rail-filter-trigger]`,
// so the harness renders a small local stub trigger carrying that attribute alongside
// the panel (open=true, onClose a no-op). Seeds `session` (the `dashboardState` key
// folds the session identity), `dashboardState` (the STATUS / PLAN STATUS / HEALTH
// facets — KIND and EDITED are NOT sectioned here; they live on the graph legend and
// the timeline respectively, filtering-has-one-canonical-surface), and the `/filters`
// vocabulary.

function filterSidebarVocabulary(
  populated: boolean,
  tiers: TiersBlock,
): FiltersVocabulary {
  return {
    relations: [],
    tiers: ["structural"],
    doc_types: [],
    feature_tags: [],
    kinds: [],
    statuses: populated ? ["proposed", "accepted", "rejected"] : [],
    plan_tiers: [],
    plan_states: populated ? ["not-started", "in-progress", "finished"] : [],
    health: populated ? ["dangling", "orphaned"] : [],
    date_bounds: {},
    tiers_block: tiers,
  };
}

function FilterSidebarHarness() {
  return (
    <div className="relative inline-flex">
      <button
        type="button"
        data-rail-filter-trigger
        className="rounded-fg-sm border border-rule bg-paper px-fg-3 py-fg-1-5 text-label text-ink"
      >
        Filters
      </button>
      <FilterSidebar
        open
        onClose={() => undefined}
        scope={REVIEW_SCOPE}
        hidden={{ nodes: 0, edges: 0 }}
      />
    </div>
  );
}

// --- stage-provisionpanel -------------------------------------------------------------
//
// Wire-free view: `ProvisionPanelBody` (the not-a-vaultspec-project card), driven by
// authored `ProvisionStatus`/`ProvisionJob` — never `ProvisionPanel` itself, which
// additionally reads `useProvisionPanelState`/`useProvisionRun`/`useProvisionJob`
// against the wire and owns the container-level `hidden`/`unavailable` branches this
// Body does not render.

function provisionStatus(overrides: Partial<ProvisionStatus> = {}): ProvisionStatus {
  return {
    target: REVIEW_SCOPE,
    managed: false,
    recommended: "install-framework",
    git: { present: true },
    uv: { present: true, version: "0.4.18" },
    core: { version: "0.3.2", floor: "0.3.0", meets_floor: true },
    rag: { tool_version: null, floor: "0.2.0", enrolled: false },
    framework: { vaultspec_present: false, vault_present: false, providers: [] },
    pending_migrations: null,
    ...overrides,
  };
}

const PROVISION_JOB_RUNNING: ProvisionJob = {
  id: "job-review-1",
  label: "install",
  target: REVIEW_SCOPE,
  state: "running",
  outcome: null,
};

function provisionPanelProps(state: ReviewState): ProvisionPanelBodyProps {
  const base = {
    onPrimary: () => undefined,
    onForce: () => undefined,
  };
  switch (state) {
    case "loading":
      return {
        ...base,
        data: provisionStatus(),
        job: PROVISION_JOB_RUNNING,
        busy: true,
        runError: false,
      };
    case "empty":
      return {
        ...base,
        data: provisionStatus({
          recommended: "acquire-uv",
          uv: { present: false, version: null },
        }),
        job: undefined,
        busy: false,
        runError: false,
      };
    case "degraded":
      return {
        ...base,
        data: provisionStatus(),
        job: undefined,
        busy: false,
        runError: true,
      };
    case "normal":
    default:
      return {
        ...base,
        data: provisionStatus({
          framework: {
            vaultspec_present: true,
            vault_present: false,
            providers: ["claude"],
          },
        }),
        job: undefined,
        busy: false,
        runError: false,
      };
  }
}

// --- stage-categorylegend -------------------------------------------------------------
//
// Container: `useCodeModuleLegend` (session → dashboardState → graph slice) and
// `useVaultRailFacets` (dashboardState). The graph-slice key is computed with the
// REAL `dashboardGraphQueryVariables` + `normalizeGraphSliceRequestIdentity` the
// production hooks use, so the seeded entry lands at exactly the key
// `useCodeModuleLegend`'s `useGraphSlice` call requests.

function categoryLegendGraphSliceKey(dashboardState: DashboardState) {
  const variables = dashboardGraphQueryVariables(dashboardState);
  const identity = normalizeGraphSliceRequestIdentity(
    variables.scope,
    variables.filter,
    variables.asOf,
    variables.granularity,
    variables.lens,
    variables.focus,
    variables.corpus,
  );
  return engineKeys.graph(
    identity.scope ?? "",
    identity.filter,
    identity.asOf,
    identity.granularity,
    identity.lens,
    identity.focus,
    identity.corpus,
  );
}

function vaultSampleNodes(): EngineNode[] {
  return [
    { id: "doc:alpha-research", kind: "doc", doc_type: "research" },
    { id: "doc:alpha-adr", kind: "doc", doc_type: "adr" },
    { id: "doc:alpha-plan", kind: "doc", doc_type: "plan" },
  ];
}

function codeModuleNodes(): EngineNode[] {
  const modules = ["app", "stores", "scene", "engine"];
  return modules.flatMap((module, moduleHue) =>
    Array.from({ length: 3 }, (_, i) => ({
      id: `code:src/${module}/file-${i}.ts`,
      kind: "file",
      module,
      module_hue: moduleHue,
    })),
  );
}

// --- stage-docpanel -------------------------------------------------------------------
//
// Container: seeds the read-only content read (`engineKeys.content`) that
// `useDockDocPanelView` reads through `useContentView`. Mounted with the dockview
// plumbing (`api`, `containerApi`, …) cast away since `DocPanel` only ever reads
// `props.params`. Markdown surface only — the wire-free `MarkdownReader`/`CodeViewer`
// halves are already reviewed standalone under the `viewer` area; this specimen's
// value is the dockview `DocPanelParams` wiring + `MarkdownDocView` composition.

const DOC_PANEL_NODE_ID = "doc:alpha-research";

function docPanelContent(state: ReviewState): ContentResponse {
  return {
    path: ".vault/research/alpha-research.md",
    blob_hash: "0f9c2a4e",
    byte_len: SAMPLE_MARKDOWN.length,
    language_hint: "markdown",
    text: state === "normal" ? SAMPLE_MARKDOWN : "",
    truncated: null,
    tiers:
      state === "degraded" ? tiersDown(["structural"]) : tiersHealthy("structural"),
  };
}

function DocPanelHarness() {
  const params: DocPanelParams = {
    nodeId: DOC_PANEL_NODE_ID,
    surface: "markdown",
    scope: REVIEW_SCOPE,
  };
  // DocPanel only ever reads `props.params`; the rest of the dockview panel props
  // (api, containerApi, …) are unused plumbing this specimen has no reason to fake.
  const props = { params } as unknown as IDockviewPanelProps<DocPanelParams>;
  return <DocPanel {...props} />;
}

// --- registry entries -----------------------------------------------------------------

export const stageSpecimens: Readonly<Record<string, SpecimenDef>> = {
  "stage-canvasstateoverlay": {
    note: "Pure view: CanvasStateOverlay renders resolveCanvasState(authored CanvasStateInputs). 'normal' is an ok slice with a non-blocking 'refreshing' caption — a fully idle-healthy slice renders NOTHING (the overlay is error/loading chrome layered over the canvas, not decoration), so refreshing is the one honest way to show something for a healthy state. 'empty' is reached only via stageSurface: 'empty-invitation' (resolvePrimary never inspects node count itself). 'degraded' has no distinct CanvasPrimary kind — it is the annotation chip over an otherwise-ok slice.",
    host: "relative h-[20rem]",
    render: (state) => (
      <CanvasStateOverlay state={resolveCanvasState(CANVAS_STATE_INPUTS[state])} />
    ),
  },
  "stage-filtermenu": {
    note: "Pure view: hand-authored FilterMenuSection[] (checkbox KIND + TOPIC-with-search, radio EDITED). 'loading' sets each checkbox section's own `loading` flag (the skeleton rows FilterMenu renders directly) with zero options; 'empty' renders the same empty-options sections with `loading` false (the 'none in corpus' sentence); 'degraded' holds the SAME populated sections as 'normal' but sets the top-level `degraded` prop, which renders the caution notice above the still-held (possibly stale) sections — matching the component's own documented contract.",
    render: (state) => (
      <FilterMenu
        sections={filterMenuSections(state)}
        anyActive={state === "normal" || state === "degraded"}
        degraded={state === "degraded"}
        onClearAll={() => undefined}
      />
    ),
  },
  "stage-filtersidebar": {
    solo: true,
    note: "Container, portalled to document.body: the harness renders a local stub trigger (data-rail-filter-trigger) beside <FilterSidebar open onClose={noop} scope={REVIEW_SCOPE} .../>, without which the panel renders null. Seeds session + dashboardState (STATUS/PLAN STATUS/HEALTH facets only — KIND and EDITED live elsewhere) + the /filters vocabulary. 'loading' leaves every query unseeded and genuinely pends; deriveFilterSidebarMenuSections carries no per-section loading flag of its own, so a pending read and 'empty' (a resolved read with zero vocabulary facets) render IDENTICALLY — no sections at all — which is the honest truth of this container, not an authoring gap. 'degraded' seeds the SAME populated vocabulary as 'normal' but with tiers_block reporting the structural tier down, rendering the DegradedNotice above the still-held sections.",
    seed: (client, state) => {
      if (state === "loading") return;
      const populated = state !== "empty";
      const tiers =
        state === "degraded" ? tiersDown(["structural"]) : tiersHealthy("structural");
      seedSessionAndDashboardState(client, {
        filters: populated
          ? {
              statuses: ["accepted"],
              plan_states: ["in-progress"],
              health: ["dangling"],
            }
          : {},
        tiers,
      });
      client.setQueryData(
        engineKeys.filters(REVIEW_SCOPE, "vault"),
        filterSidebarVocabulary(populated, tiers),
      );
    },
    render: () => <FilterSidebarHarness />,
  },
  "stage-provisionpanel": {
    note: "Wire-free view: ProvisionPanelBody (the not-a-vaultspec-project card) driven by authored ProvisionStatus/ProvisionJob, never ProvisionPanel itself — which additionally reads useProvisionPanelState/useProvisionRun/useProvisionJob against the wire and owns the container-level 'hidden' (scope already resolved, or the status read still pending) and 'unavailable' (a hard status-read failure) branches this Body does not render; those two are structurally out of reach from the Body alone. 'loading' is the Body's OWN busy render (a running job: disabled buttons + the progress skeleton). 'empty' is the leanest affordance set (uv absent, no Force option, no job outcome). 'degraded' is the dispatch-failure caption (runError) — the only error affordance this Body designs for, since ProvisionStatus itself carries no tiers block.",
    host: "relative h-[20rem]",
    render: (state) => <ProvisionPanelBody {...provisionPanelProps(state)} />,
  },
  "stage-workspaceghost": {
    note: "Pure view with no props at all — a static invitation card. Its four states are visually identical: the component reads nothing from the wire or the review state, so there is nothing to vary. Its two buttons dispatch real view-store actions (setShellGraphVisible, the shared new-document action) on click, which the specimen contract accepts.",
    host: "relative h-[20rem]",
    render: () => <WorkspaceGhost />,
  },
  "stage-categorylegend": {
    note: "Container: seeds session (the dashboardState key folds the session identity), dashboardState (feeds useVaultRailFacets AND, via useDashboardStageSceneView, the graph-query variables useCodeModuleLegend's useGraphSlice call requests), and that graph slice — its key computed with the REAL dashboardGraphQueryVariables/normalizeGraphSliceRequestIdentity so it lands exactly where the hook reads. 'normal' is a VAULT corpus with active doc-type filters (the toolbar's highlighted-selection + 'Clear' affordance). 'empty' is the SAME vault toolbar with zero active filters (the DOC_TYPE_ORDER list is a static constant, never server data, so there is no 'no data' rendering to show here). 'degraded' switches to a CODE corpus with module_hue'd nodes so the alternate module-color-legend branch gets covered at least once, paired with the structural tier reported down on both the dashboardState and the graph slice — but CategoryLegend reads neither tiers block anywhere, so it is tier-blind by design and cannot show a visually distinct degraded treatment; this pairing only proves a truthfully degraded served envelope alongside that branch. The recency-scale branch (nodeColorMode: 'recency') is a view-store-only axis this desk does not toggle and is left uncovered. 'loading' leaves every query unseeded and renders the same baseline unfiltered toolbar as 'empty', for the same tier-blind reason.",
    host: "h-[3.5rem]",
    seed: (client, state) => {
      if (state === "loading") return;
      const showCodeModules = state === "degraded";
      const tiers =
        state === "degraded" ? tiersDown(["structural"]) : tiersHealthy("structural");
      const overrides: Partial<DashboardState> = {
        corpus: showCodeModules ? "code" : "vault",
        filters:
          showCodeModules || state === "empty" ? {} : { doc_types: ["adr", "plan"] },
        tiers,
      };
      seedSessionAndDashboardState(client, overrides);
      client.setQueryData(
        categoryLegendGraphSliceKey(authoredDashboardState(overrides)),
        {
          nodes: showCodeModules ? codeModuleNodes() : vaultSampleNodes(),
          edges: [],
          tiers,
        } satisfies GraphSlice,
      );
    },
    render: () => <CategoryLegend />,
  },
  "stage-docpanel": {
    note: "Container: seeds the read-only content query (engineKeys.content) useDockDocPanelView reads through useContentView. Mounted as <DocPanel {...props} /> where `props = ({ params } as unknown as IDockviewPanelProps<DocPanelParams>)`, since DocPanel takes the full dockview IDockviewPanelProps and only ever reads props.params — the cast bypasses the unused dockview plumbing (api, containerApi, …), never the params shape itself, which stays typed against DocPanelParams. Markdown surface only (scope is threaded per-tab, per-tab-scope-binding, so the active-scope fallback is never exercised); the code surface's git-diff gutter read self-disables without a seeded engine-status query, so it fetches nothing either way. 'empty' is a real zero-body document (available, no content); 'degraded' reports the structural tier down on the served content envelope.",
    host: "h-[24rem]",
    seed: (client, state) => {
      if (state === "loading") return;
      client.setQueryData(
        engineKeys.content(REVIEW_SCOPE, DOC_PANEL_NODE_ID),
        docPanelContent(state),
      );
    },
    render: () => <DocPanelHarness />,
  },
};
