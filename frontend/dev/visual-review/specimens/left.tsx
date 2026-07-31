// Specimens: `left` area (the left scope rail — worktree picker, canonical
// filter, and the Vault/Files browser trees).
//
// `FolderBrowser` is a wire-free VIEW (props: a resolved `FolderBrowserView` +
// controlled query/selection/hidden-toggle) — authored directly through its own
// exported `deriveFolderBrowserView` resolver. Every other specimen here mounts
// the real CONTAINER and seeds its queries: `TreeBrowser`/`CodeTree`/
// `BrowserRegion`/`LeftRail` read the vault/code trees plus `dashboardState`
// (which itself gates on a resolved `session`, so both are seeded together);
// `RailFilterField`/`FeatureSearchField` read the same `dashboardState` plus the
// served filter vocabulary; `CreateDocDialog` is closed-by-default and portals
// out, so it is `solo` and opened imperatively from a local wrapper.

import { useEffect, useMemo, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";

import { BrowserRegion } from "@app/app/left/BrowserRegion";
import { CodeTree } from "@app/app/left/CodeTree";
import { CreateDocDialog } from "@app/app/left/CreateDocDialog";
import { deriveFolderBrowserView, FolderBrowser } from "@app/app/left/FolderBrowser";
import { FeatureSearchField } from "@app/app/left/FeatureSearchField";
import { LeftRail } from "@app/app/left/LeftRail";
import { RailFilterField } from "@app/app/left/RailFilterField";
import { TreeBrowser } from "@app/app/left/TreeBrowser";
import { engineKeys } from "@app/stores/server/queries";
import { docNodeIdFromStem, stemFromPath } from "@app/stores/server/liveAdapters";
import {
  openCreateDocDialog,
  resetCreateDocChrome,
} from "@app/stores/view/createDocChrome";
import type {
  FeatureCoverage,
  FileTreeEntry,
  FileTreeResponse,
  FiltersVocabulary,
  FsListEntry,
  FsListResponse,
  MapResponse,
  VaultTreeEntry,
  VaultTreeResponse,
} from "@app/stores/server/engine";

import type { SpecimenDef } from "../registry";
import type { ReviewState } from "../state";
import {
  REVIEW_SCOPE,
  seedSessionAndDashboardState,
  tiersDown,
  tiersHealthy,
} from "./support";

// --- shared authored fixtures ------------------------------------------------------
//
// One small believable vault + one small believable worktree, reused across every
// container specimen below so the rail reads as one coherent corpus regardless of
// which surface is being reviewed.

const ALPHA_FEATURE = "alpha-initiative";
const BETA_FEATURE = "beta-rollout";

const VAULT_TREE_ENTRIES: VaultTreeEntry[] = [
  {
    path: `.vault/research/2026-07-30-${ALPHA_FEATURE}-research.md`,
    doc_type: "research",
    title: "Alpha initiative research",
    feature_tags: [ALPHA_FEATURE],
    dates: { created: "2026-07-30", modified: "2026-07-30" },
    size: { bytes: 4200, words: 640 },
  },
  {
    path: `.vault/adr/2026-07-30-${ALPHA_FEATURE}-adr.md`,
    doc_type: "adr",
    title: "Alpha initiative decision",
    feature_tags: [ALPHA_FEATURE],
    dates: { created: "2026-07-30", modified: "2026-07-30" },
    status: "accepted",
    size: { bytes: 2600, words: 410 },
  },
  {
    path: `.vault/plan/2026-07-30-${ALPHA_FEATURE}-plan.md`,
    doc_type: "plan",
    title: "Alpha initiative plan",
    feature_tags: [ALPHA_FEATURE],
    dates: { created: "2026-07-30", modified: "2026-07-30" },
    tier: "L2",
    progress: { done: 2, total: 5 },
    size: { bytes: 5100, words: 890 },
  },
  {
    path: `.vault/research/2026-07-30-${BETA_FEATURE}-research.md`,
    doc_type: "research",
    title: "Beta rollout research",
    feature_tags: [BETA_FEATURE],
    dates: { created: "2026-07-30", modified: "2026-07-30" },
    size: { bytes: 3100, words: 480 },
  },
  {
    path: ".vault/reference/2026-07-30-shared-glossary-reference.md",
    doc_type: "reference",
    title: "Shared glossary",
    feature_tags: [],
    dates: { created: "2026-07-30", modified: "2026-07-30" },
    size: { bytes: 1800, words: 260 },
  },
];

/** The ADR row's document node id (the shared `doc:{stem}` grammar) — used to
 *  author a realistic selection highlight for the "normal" state. */
const SELECTED_DOC_NODE_ID = docNodeIdFromStem(
  stemFromPath(VAULT_TREE_ENTRIES[1]!.path),
);

function vaultTreeResponse(state: ReviewState): VaultTreeResponse {
  if (state === "empty") {
    return { entries: [], tiers: tiersHealthy("structural"), complete: true };
  }
  return {
    entries: VAULT_TREE_ENTRIES,
    tiers:
      state === "degraded" ? tiersDown(["structural"]) : tiersHealthy("structural"),
    complete: true,
  };
}

/** Seed the vault-tree query alone; `loading` intentionally leaves it unseeded so
 *  the container's own read pends against the hermetic fetch. */
function seedVaultTree(client: QueryClient, state: ReviewState): void {
  if (state === "loading") return;
  client.setQueryData(engineKeys.vaultTree(REVIEW_SCOPE), vaultTreeResponse(state));
}

const CODE_TREE_ROOT_ENTRIES: FileTreeEntry[] = [
  { path: "src", kind: "dir", has_children: true, node_id: "code:src" },
  { path: "engine", kind: "dir", has_children: true, node_id: "code:engine" },
  { path: "README.md", kind: "file", has_children: false, node_id: "code:README.md" },
  {
    path: "package.json",
    kind: "file",
    has_children: false,
    node_id: "code:package.json",
  },
];

function fileTreeRootResponse(state: ReviewState): FileTreeResponse {
  if (state === "empty") {
    return {
      entries: [],
      path: "",
      truncated: null,
      tiers: tiersHealthy("structural"),
    };
  }
  return {
    entries: CODE_TREE_ROOT_ENTRIES,
    path: "",
    truncated: null,
    tiers:
      state === "degraded" ? tiersDown(["structural"]) : tiersHealthy("structural"),
  };
}

function seedFileTree(client: QueryClient, state: ReviewState): void {
  if (state === "loading") return;
  client.setQueryData(engineKeys.fileTree(REVIEW_SCOPE), fileTreeRootResponse(state));
}

function filtersVocabulary(state: ReviewState): FiltersVocabulary {
  if (state === "empty") {
    return {
      relations: [],
      tiers: [],
      doc_types: [],
      feature_tags: [],
      kinds: [],
      statuses: [],
      plan_states: [],
      health: [],
      tiers_block: tiersHealthy("structural"),
    };
  }
  return {
    relations: [],
    tiers: [],
    doc_types: ["research", "adr", "plan", "reference"],
    feature_tags: [ALPHA_FEATURE, BETA_FEATURE],
    kinds: [],
    statuses: ["accepted", "proposed"],
    plan_states: ["active", "complete"],
    health: [],
    tiers_block:
      state === "degraded" ? tiersDown(["structural"]) : tiersHealthy("structural"),
  };
}

/** Seed the `/filters` vocabulary (feature-tag suggestions, facet lists). Neither
 *  `RailFilterField` nor `FeatureSearchField` reads the vocabulary's `degraded`
 *  flag today — they only read the served arrays, which this fixture still
 *  populates under `degraded` — so the degraded pane renders identically to
 *  normal; the honest limitation is called out in each specimen's `note`. */
function seedFiltersVocabulary(client: QueryClient, state: ReviewState): void {
  if (state === "loading") return;
  client.setQueryData(
    engineKeys.filters(REVIEW_SCOPE, "vault"),
    filtersVocabulary(state),
  );
}

// --- left-folderbrowser -------------------------------------------------------------

const FOLDER_BROWSER_ENTRIES: FsListEntry[] = [
  {
    name: "vaultspec-dashboard",
    path: "/Users/dev/projects/vaultspec-dashboard",
    is_managed: true,
    is_git: true,
    is_hidden: false,
    is_registered: true,
  },
  {
    name: "atlas-notes",
    path: "/Users/dev/projects/atlas-notes",
    is_managed: false,
    is_git: true,
    is_hidden: false,
    is_registered: false,
  },
  {
    name: "scratch",
    path: "/Users/dev/projects/scratch",
    is_managed: false,
    is_git: false,
    is_hidden: false,
    is_registered: false,
  },
  {
    name: ".config",
    path: "/Users/dev/projects/.config",
    is_managed: false,
    is_git: false,
    is_hidden: true,
    is_registered: false,
  },
];

function folderBrowserData(state: ReviewState): FsListResponse | undefined {
  if (state === "loading") return undefined;
  if (state === "empty") {
    return {
      path: "/Users/dev/projects/empty-folder",
      parent: "/Users/dev/projects",
      is_registered: false,
      entries: [],
      places: [],
      truncated: false,
      tiers: tiersHealthy("structural"),
    };
  }
  return {
    path: "/Users/dev/projects",
    parent: "/Users/dev",
    is_registered: false,
    entries: FOLDER_BROWSER_ENTRIES,
    places: [],
    truncated: false,
    tiers: tiersHealthy("structural"),
  };
}

/** `FolderBrowser` has no tiers-based degraded distinction of its own (its view
 *  is `loading | error | ready`) — its "degraded" review state is authored as the
 *  honest read-failure it already renders for any backend error. */
function FolderBrowserSpecimen({ state }: { state: ReviewState }) {
  const [query, setQuery] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const view = useMemo(
    () =>
      deriveFolderBrowserView({
        data: folderBrowserData(state),
        loading: state === "loading",
        errored: state === "degraded",
        filtered: false,
      }),
    [state],
  );
  return (
    <FolderBrowser
      view={view}
      selectedPath={selectedPath}
      onSelect={setSelectedPath}
      onNavigate={() => undefined}
      query={query}
      onQueryChange={setQuery}
      showHidden={showHidden}
      onShowHiddenChange={setShowHidden}
    />
  );
}

// --- left-createdocdialog ------------------------------------------------------------

const NORMAL_FEATURE_COVERAGE: FeatureCoverage = {
  feature: ALPHA_FEATURE,
  types: [
    {
      doc_type: "research",
      present: true,
      count: 1,
      newest_stem: `2026-07-30-${ALPHA_FEATURE}-research`,
      eligible: true,
    },
    { doc_type: "reference", present: false, count: 0, eligible: true },
    {
      doc_type: "adr",
      present: true,
      count: 1,
      newest_stem: `2026-07-30-${ALPHA_FEATURE}-adr`,
      eligible: true,
    },
    { doc_type: "plan", present: false, count: 0, eligible: true },
    { doc_type: "exec", present: false, count: 0, eligible: false },
    {
      doc_type: "audit",
      present: false,
      count: 0,
      eligible: true,
      note: "no-upstream",
    },
  ],
  missing: ["reference", "plan", "exec", "audit"],
  next_step: "plan",
};

const EMPTY_FEATURE_COVERAGE: FeatureCoverage = {
  feature: ALPHA_FEATURE,
  types: [
    { doc_type: "research", present: false, count: 0, eligible: true },
    { doc_type: "reference", present: false, count: 0, eligible: true },
    {
      doc_type: "adr",
      present: false,
      count: 0,
      eligible: false,
      note: "requires-research-or-reference",
    },
    {
      doc_type: "plan",
      present: false,
      count: 0,
      eligible: false,
      note: "requires-adr",
    },
    { doc_type: "exec", present: false, count: 0, eligible: false },
    {
      doc_type: "audit",
      present: false,
      count: 0,
      eligible: false,
      note: "requires-adr",
    },
  ],
  missing: ["research", "reference", "adr", "plan", "exec", "audit"],
  next_step: "research",
};

/** Opens the real dialog on mount by firing the same store action a user click
 *  dispatches, and resets the (module-singleton) chrome store on unmount so a
 *  state switch — which remounts this wrapper — never leaks an open dialog or a
 *  stale draft into the next specimen visited on the desk. */
function CreateDocDialogSpecimen() {
  useEffect(() => {
    openCreateDocDialog(ALPHA_FEATURE);
    return () => resetCreateDocChrome();
  }, []);
  return <CreateDocDialog />;
}

// --- registry ------------------------------------------------------------------------

export const leftSpecimens: Readonly<Record<string, SpecimenDef>> = {
  "left-folderbrowser": {
    note: "Pure view over its own exported deriveFolderBrowserView resolver — no container, no seeded queries. The view has no tiers concept of its own, so degraded is authored as the honest read-failure state it already renders (errored: true), the same treatment a real backend error gets.",
    render: (state) => <FolderBrowserSpecimen state={state} />,
  },

  "left-treebrowser": {
    note: "Container: seeds session + dashboardState (dashboardState is gated on a resolved session) for the canonical rail facets/selection, plus the vault-tree read. The ADR row is pre-selected in every non-empty state so the accent highlight is visible. Sections start collapsed, matching a fresh load.",
    seed: (client, state) => {
      seedSessionAndDashboardState(client, {
        selected_ids: state === "empty" ? [] : [SELECTED_DOC_NODE_ID],
      });
      seedVaultTree(client, state);
    },
    render: () => <TreeBrowser />,
  },

  "left-codetree": {
    note: "Container: seeds the root file-tree level only (a static specimen never expands a directory, so deeper levels are never fetched). Loading/empty/degraded read the same root-level tiers/entries the real worktree read would report.",
    seed: (client, state) => {
      seedSessionAndDashboardState(client);
      seedFileTree(client, state);
    },
    render: () => <CodeTree />,
  },

  "left-browserregion": {
    note: "Container composing CodeTree + VaultBrowser (TreeBrowser) behind the Vault/Files tabs; defaults to the Vault tab (the app's own default), so both trees are seeded from the same shared vault/code fixtures used by left-treebrowser and left-codetree.",
    seed: (client, state) => {
      seedSessionAndDashboardState(client, {
        selected_ids: state === "empty" ? [] : [SELECTED_DOC_NODE_ID],
      });
      seedVaultTree(client, state);
      seedFileTree(client, state);
    },
    render: () => <BrowserRegion />,
  },

  "left-leftrail": {
    host: "relative h-[30rem] w-[20rem]",
    note: "Thin container: useWorkspaceMapSurface drives the degraded branch directly (a tiers-down /map reports scope resolution itself as failed, replacing the whole browser slot with the shared degraded rail message); otherwise it composes WorktreePicker + RailFilterField + BrowserRegion over the same shared vault/code/dashboard fixtures.",
    seed: (client, state) => {
      seedSessionAndDashboardState(client, {
        selected_ids: state === "empty" ? [] : [SELECTED_DOC_NODE_ID],
      });
      seedVaultTree(client, state);
      seedFileTree(client, state);
      if (state === "loading") return;
      const map: MapResponse =
        state === "empty"
          ? { repositories: [], tiers: tiersHealthy("structural") }
          : {
              repositories: [
                {
                  path: "/workspace/vaultspec-dashboard",
                  branches: [{ name: "main", kind: "default" }],
                  worktrees: [
                    {
                      id: REVIEW_SCOPE,
                      path: "/workspace/vaultspec-dashboard",
                      branch: "main",
                      has_vault: true,
                      is_default: true,
                      dirty: false,
                      ahead: 0,
                      behind: 0,
                    },
                  ],
                },
              ],
              tiers:
                state === "degraded"
                  ? tiersDown(["structural"])
                  : tiersHealthy("structural"),
            };
      client.setQueryData(engineKeys.map(), map);
    },
    render: () => <LeftRail />,
  },

  "left-railfilterfield": {
    note: "Container: seeds session + dashboardState (for the active-facet badge and the echoed feature query) plus the /filters vocabulary the embedded FeatureSearchField reads. Loading leaves both unseeded, so the field echoes blank and the badge stays hidden rather than showing a dedicated skeleton (the component has none). Degraded seeds a tiers-down vocabulary envelope, but neither this field nor FeatureSearchField reads that flag today, so the degraded pane is visually identical to normal — an honest limitation of the current component, not an omission here.",
    seed: (client, state) => {
      seedSessionAndDashboardState(client, {
        filters:
          state === "normal"
            ? {
                feature_query: { value: "alpha*", mode: "glob" },
                doc_types: ["adr"],
                statuses: ["accepted"],
              }
            : {},
      });
      seedFiltersVocabulary(client, state);
    },
    render: () => <RailFilterField />,
  },

  "left-featuresearchfield": {
    note: "Container: seeds session + dashboardState (the field echoes the canonical filters.feature_query) plus the /filters vocabulary (the autocomplete's feature-tag suggestions). Same honest limitation as left-railfilterfield: the vocabulary's degraded tiers flag is not read by this component, so degraded renders like normal.",
    seed: (client, state) => {
      seedSessionAndDashboardState(client, {
        filters:
          state === "normal"
            ? { feature_query: { value: "alpha*", mode: "glob" } }
            : {},
      });
      seedFiltersVocabulary(client, state);
    },
    render: () => <FeatureSearchField />,
  },

  "left-createdocdialog": {
    solo: true,
    note: "Closed-by-default dialog: a local wrapper opens it via the real openCreateDocDialog(feature) store action on mount (the exact action the Features-section Plus dispatches) and resets the chrome store on unmount. Stays on stage 1 (feature) for every state — the coverage card there already reaches all four honest conditions (checking / no feature yet / degraded / present vs. empty coverage), so stage 2 is never required. The vault-tree read backing the feature combobox is seeded once at its normal shape; only the feature-coverage read varies by state.",
    seed: (client, state) => {
      client.setQueryData(
        engineKeys.vaultTree(REVIEW_SCOPE),
        vaultTreeResponse("normal"),
      );
      if (state === "loading") return;
      client.setQueryData(engineKeys.featureCoverage(REVIEW_SCOPE, ALPHA_FEATURE), {
        coverage: state === "empty" ? EMPTY_FEATURE_COVERAGE : NORMAL_FEATURE_COVERAGE,
        tiers:
          state === "degraded" ? tiersDown(["structural"]) : tiersHealthy("structural"),
      });
    },
    render: () => <CreateDocDialogSpecimen />,
  },
};
