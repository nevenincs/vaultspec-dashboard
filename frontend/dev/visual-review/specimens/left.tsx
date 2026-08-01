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
//
// Every surface that shows a FEATURE also reads the one feature roster, so the
// tree, the rail, and the suggestion dropdown are all seeded from the same
// authored roster below — the desk proves what a status mark, a decision date
// span, and a composition line LOOK like across all four rollup states.

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
  FeatureRosterEntry,
  FileTreeEntry,
  FileTreeResponse,
  FiltersVocabulary,
  FsListEntry,
  FsListResponse,
  MapResponse,
  SettingDef,
  SettingsSchema,
  SettingsState,
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
const GAMMA_FEATURE = "gamma-migration";
const DELTA_FEATURE = "delta-cleanup";

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
  // Gamma carries TWO decisions, which is what makes its feature row print a real
  // date SPAN rather than a single date, and a finished plan for the ✓ mark.
  {
    path: `.vault/adr/2026-06-14-${GAMMA_FEATURE}-adr.md`,
    doc_type: "adr",
    title: "Gamma migration approach",
    feature_tags: [GAMMA_FEATURE],
    dates: { created: "2026-06-14", modified: "2026-06-14" },
    status: "accepted",
    size: { bytes: 2400, words: 380 },
  },
  {
    path: `.vault/adr/2026-07-30-${GAMMA_FEATURE}-rollback-adr.md`,
    doc_type: "adr",
    title: "Gamma migration rollback",
    feature_tags: [GAMMA_FEATURE],
    dates: { created: "2026-07-30", modified: "2026-07-30" },
    status: "accepted",
    size: { bytes: 1900, words: 300 },
  },
  {
    path: `.vault/plan/2026-07-01-${GAMMA_FEATURE}-plan.md`,
    doc_type: "plan",
    title: "Gamma migration plan",
    feature_tags: [GAMMA_FEATURE],
    dates: { created: "2026-07-01", modified: "2026-07-29" },
    tier: "L1",
    progress: { done: 4, total: 4 },
    size: { bytes: 3300, words: 520 },
  },
  // Delta has a plan nobody has started and NO decision at all — the row that
  // proves a composition line renders without any date beside it.
  {
    path: `.vault/research/2026-07-28-${DELTA_FEATURE}-research.md`,
    doc_type: "research",
    title: "Delta cleanup research",
    feature_tags: [DELTA_FEATURE],
    dates: { created: "2026-07-28", modified: "2026-07-28" },
    size: { bytes: 2100, words: 340 },
  },
  {
    path: `.vault/plan/2026-07-29-${DELTA_FEATURE}-plan.md`,
    doc_type: "plan",
    title: "Delta cleanup plan",
    feature_tags: [DELTA_FEATURE],
    dates: { created: "2026-07-29", modified: "2026-07-29" },
    tier: "L1",
    progress: { done: 0, total: 3 },
    size: { bytes: 2700, words: 430 },
  },
];

/**
 * The served feature roster — the ONE read every feature surface joins its
 * metadata from (rail-feature-metadata ADR D5). Authored to cover every
 * presentation the rows can reach: a single-date span with an in-progress rollup
 * (alpha), a real multi-decision span with a finished rollup (gamma), a
 * composition with a not-started rollup and NO date (delta), and a feature the
 * engine can say nothing more about than its totals — no plan, no decision — so
 * its row keeps the plain feature glyph and prints no second line (beta).
 *
 * Counts here are authored to agree with the vault-tree fixture above: on the
 * live wire they are engine-computed over the full corpus, and no surface ever
 * re-derives them from the listing.
 */
const FEATURE_ROSTER: FeatureRosterEntry[] = [
  {
    feature: ALPHA_FEATURE,
    doc_count: 3,
    types_present: 3,
    type_counts: { research: 1, adr: 1, plan: 1 },
    plan_state: "in-progress",
    adr_dates: { first: "2026-07-30", last: "2026-07-30" },
  },
  {
    feature: BETA_FEATURE,
    doc_count: 1,
    types_present: 1,
  },
  {
    feature: GAMMA_FEATURE,
    doc_count: 3,
    types_present: 2,
    type_counts: { adr: 2, plan: 1 },
    plan_state: "finished",
    adr_dates: { first: "2026-06-14", last: "2026-07-30" },
  },
  {
    feature: DELTA_FEATURE,
    doc_count: 2,
    types_present: 2,
    type_counts: { research: 1, plan: 1 },
    plan_state: "not-started",
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

/** Seed the feature roster every feature surface joins its served status mark,
 *  decision span, and composition from. Degraded seeds a tiers-down envelope,
 *  which the stores view empties — so the degraded pane honestly shows feature
 *  rows WITHOUT metadata rather than stale marks, and `loading` leaves the read
 *  pending exactly as the tree beside it. */
function seedFeatureRoster(client: QueryClient, state: ReviewState): void {
  if (state === "loading") return;
  client.setQueryData(engineKeys.featureRoster(REVIEW_SCOPE), {
    roster: state === "empty" ? [] : FEATURE_ROSTER,
    tiers:
      state === "degraded" ? tiersDown(["structural"]) : tiersHealthy("structural"),
  });
}

// The code-tree row treatment composes THREE channels (code-tree-legibility ADR
// D6): a colored type icon, a git-state label tone plus one-letter badge, and
// ignored dimming. These entries author every one of them, and their
// combinations, so the desk proves what each state LOOKS like: a clean file, one
// file per served git token, an ignored directory, an ignored file that is ALSO
// modified (the composition case), and an unmapped extension falling back to the
// generic mark.
const CODE_TREE_ROOT_ENTRIES: FileTreeEntry[] = [
  { path: "src", kind: "dir", has_children: true, node_id: "code:src" },
  { path: "engine", kind: "dir", has_children: true, node_id: "code:engine" },
  {
    path: "target",
    kind: "dir",
    has_children: true,
    node_id: "code:target",
    ignored: "git",
  },
  { path: "README.md", kind: "file", has_children: false, node_id: "code:README.md" },
  {
    path: "package.json",
    kind: "file",
    has_children: false,
    node_id: "code:package.json",
    git_status: "modified",
  },
  {
    path: "Cargo.toml",
    kind: "file",
    has_children: false,
    node_id: "code:Cargo.toml",
    git_status: "added",
  },
  {
    path: "legacy.py",
    kind: "file",
    has_children: false,
    node_id: "code:legacy.py",
    git_status: "deleted",
  },
  {
    path: "styles.css",
    kind: "file",
    has_children: false,
    node_id: "code:styles.css",
    git_status: "renamed",
  },
  {
    path: "scratch.ts",
    kind: "file",
    has_children: false,
    node_id: "code:scratch.ts",
    git_status: "untracked",
  },
  {
    path: "merge.rs",
    kind: "file",
    has_children: false,
    node_id: "code:merge.rs",
    git_status: "conflicted",
  },
  {
    path: "notes.md",
    kind: "file",
    has_children: false,
    node_id: "code:notes.md",
    ignored: "rag",
    git_status: "modified",
  },
  {
    path: "fixture.unknownext",
    kind: "file",
    has_children: false,
    node_id: "code:fixture.unknownext",
  },
];

function fileTreeRootResponse(state: ReviewState): FileTreeResponse {
  if (state === "empty") {
    return {
      entries: [],
      path: "",
      truncated: null,
      status_truncated: false,
      tiers: tiersHealthy("structural"),
    };
  }
  return {
    entries: CODE_TREE_ROOT_ENTRIES,
    path: "",
    truncated: null,
    // The normal state also shows the capped-status-join note, since that
    // honesty line is otherwise unreachable on a static specimen.
    status_truncated: state === "normal",
    tiers:
      state === "degraded" ? tiersDown(["structural"]) : tiersHealthy("structural"),
  };
}

/** The engine-served icon setting (ADR D7) resolved for the desk. The rows read
 *  ONE boolean through the stores seam, so the specimen seeds the two real
 *  queries that seam reads rather than overriding anything on the component. */
const CODE_TREE_ICON_SETTING: SettingDef = {
  key: "code_tree.file_icons",
  value_type: { type: "bool" },
  default: "true",
  scope_eligible: false,
  control: "switch",
  display: {
    id: "appearance.codeTreeFileIcons",
    group: "appearance",
    enum_members: [],
  },
  order: 5,
};

function seedCodeTreeIconSetting(client: QueryClient): void {
  client.setQueryData(engineKeys.settingsSchema(), {
    settings: [CODE_TREE_ICON_SETTING],
    groups: ["appearance"],
    tiers: tiersHealthy("structural"),
  } satisfies SettingsSchema);
  // No persisted row: the effective value resolves from the schema default, which
  // is the state a fresh install is actually in.
  client.setQueryData(engineKeys.settings(), {
    global: {},
    scoped: {},
    tiers: tiersHealthy("structural"),
  } satisfies SettingsState);
}

function seedFileTree(client: QueryClient, state: ReviewState): void {
  if (state === "loading") return;
  seedCodeTreeIconSetting(client);
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
    feature_tags: [ALPHA_FEATURE, BETA_FEATURE, GAMMA_FEATURE, DELTA_FEATURE],
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
    note: "Container: seeds session + dashboardState (dashboardState is gated on a resolved session) for the canonical rail facets/selection, the vault-tree read, and the feature roster. The ADR row is pre-selected in every non-empty state so the accent highlight is visible. Sections start collapsed, matching a fresh load. Expand Features to see all four served rollups in the icon slot: alpha in-progress with a single decision date, gamma finished with a real decision span, delta not-started with no decision date at all, and beta with no readable plan state, which keeps the plain feature glyph. Degraded empties the roster, so the same rows render honestly without marks or dates.",
    seed: (client, state) => {
      seedSessionAndDashboardState(client, {
        selected_ids: state === "empty" ? [] : [SELECTED_DOC_NODE_ID],
      });
      seedVaultTree(client, state);
      seedFeatureRoster(client, state);
    },
    render: () => <TreeBrowser />,
  },

  "left-codetree": {
    note: "Container: seeds the root file-tree level and the served file-icon setting (schema default on). A static specimen never expands a directory, so deeper levels are never fetched. The authored entries cover all three row channels and their combinations: every git token with its tone and one-letter badge, a git-ignored directory and a rag-ignored file that is ALSO modified (dimming composes over the tone rather than replacing it), and an unmapped extension falling back to the generic mark. Normal also carries the capped-status-join note. Loading/empty/degraded read the same root-level tiers/entries the real worktree read would report.",
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
      seedFeatureRoster(client, state);
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
      seedFeatureRoster(client, state);
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
      seedFeatureRoster(client, state);
    },
    render: () => <RailFilterField />,
  },

  "left-featuresearchfield": {
    note: "Container: seeds session + dashboardState (the field echoes the canonical filters.feature_query), the /filters vocabulary (the autocomplete's feature-tag suggestions), and the feature roster the suggestion second line reads. Focus the field to open the dropdown: each row shows its name over its served composition and decision span, and beta — which the roster describes only by totals — shows its name alone. Same honest limitation as left-railfilterfield: the vocabulary's degraded tiers flag is not read by this component, so the FIELD renders like normal under degraded; the suggestion metadata does drop, because the roster view empties on a degraded read.",
    seed: (client, state) => {
      seedSessionAndDashboardState(client, {
        filters:
          state === "normal"
            ? { feature_query: { value: "alpha*", mode: "glob" } }
            : {},
      });
      seedFiltersVocabulary(client, state);
      seedFeatureRoster(client, state);
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
