// Shared authoring support for specimens.
//
// Everything a specimen feeds a component is AUTHORED here or in its area module —
// typed against the application's own store/wire types, so a shape drift is a compile
// error, never a silently wrong cell. Nothing here fetches: the one QueryClient
// factory below never refetches, and the page's fetch is hermetically inert.

import { QueryClient } from "@tanstack/react-query";

import type {
  DashboardState,
  SessionState,
  TiersBlock,
} from "@app/stores/server/engine";
import { dashboardStateSessionIdentity, engineKeys } from "@app/stores/server/queries";
import type { ContentView } from "@app/stores/server/queries/document";

import type { ReviewState } from "../state";

/**
 * The one scope every specimen authors under. The desk pins the view-store scope to
 * this at boot, so `useActiveScope()` resolves engine-free and every seeded query
 * key lines up with what a mounted container asks for.
 */
export const REVIEW_SCOPE = "review-workspace";

/** A tiers block reporting every named tier healthy. */
export function tiersHealthy(...names: readonly string[]): TiersBlock {
  const block: Record<string, { available: boolean }> = {};
  for (const name of names.length > 0 ? names : ["structural"]) {
    block[name] = { available: true };
  }
  return block;
}

/** A tiers block reporting the named tiers down — the app's honest degraded mode. */
export function tiersDown(
  names: readonly string[],
  reason = "Authored review state: this backing tier is reported unavailable.",
): TiersBlock {
  const block: Record<string, { available: boolean; reason: string }> = {};
  for (const name of names) {
    block[name] = { available: false, reason };
  }
  return block;
}

/**
 * A per-cell QueryClient. Fresh per mounted cell so four states of one container
 * coexist on one page; seeded data is the cell's entire wire truth. Nothing
 * refetches: seeded entries stay fresh forever, and an UNSEEDED query falls
 * through to the page's inert fetch and pends — which is precisely the authored
 * `loading` state for a container.
 */
export function makeCellClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        gcTime: Infinity,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  });
}

// --- shared session + dashboard-state seed ---------------------------------------

/** The authored backend session every dashboard-state key derives from. */
export function authoredSession(): SessionState {
  return {
    workspace: REVIEW_SCOPE,
    active_scope: REVIEW_SCOPE,
    active_workspace: REVIEW_SCOPE,
    scope_context: { folder: null, feature_tags: [] },
    recents: [],
    tiers: tiersHealthy("structural"),
  };
}

/** An authored shared dashboard-state snapshot (engine defaults, empty filters). */
export function authoredDashboardState(
  overrides: Partial<DashboardState> = {},
): DashboardState {
  return {
    scope: REVIEW_SCOPE,
    selected_ids: [],
    hovered_id: null,
    filters: {},
    date_range: {},
    timeline_mode: { kind: "live" },
    graph_granularity: "feature",
    corpus: "vault",
    salience_lens: "status",
    salience_focus: null,
    representation_mode: "connectivity",
    graph_bounds: { shape: "free", size: 1 },
    panel_state: { left_collapsed: false, right_collapsed: false, right_tab: "status" },
    tiers: tiersHealthy("structural"),
    ...overrides,
  };
}

/**
 * Seed the session + shared dashboard-state pair most dashboard consumers gate on
 * (`useDashboardState` is enabled only once the session read succeeds, and its key
 * folds the session identity). Call from a specimen's `seed` for any non-loading
 * state, then seed the surface's own reads on top.
 */
export function seedSessionAndDashboardState(
  client: QueryClient,
  overrides: Partial<DashboardState> = {},
): void {
  const session = authoredSession();
  client.setQueryData(engineKeys.session(), session);
  client.setQueryData(
    engineKeys.dashboardState(REVIEW_SCOPE, dashboardStateSessionIdentity(session)),
    authoredDashboardState(overrides),
  );
}

// --- authored sample content -----------------------------------------------------

export const SAMPLE_MARKDOWN = `# Alpha research

Establishes the problem space for the alpha investigation, the constraints that
bound it, and the two options carried forward into the decision record.

## Scope

- The corpus is read-only; nothing here mutates a document.
- Bounded reads only — every listing walks its cursor to completion.

## Open questions

1. Does the projection stay memoized across a generation bump?
2. What is the honest ceiling for document-granularity nodes?
`;

export const SAMPLE_CODE = `export function fitScale(width: number, available: number): number {
  if (available <= 0 || width <= 0) return 1;
  return Math.min(1, available / width);
}
`;

/** Availability triple for a state, over the given tier names. */
function availability(state: ReviewState, tiers: readonly string[]) {
  return state === "degraded"
    ? {
        degraded: true,
        degradedTiers: [...tiers],
        reasons: Object.fromEntries(
          tiers.map((t) => [t, "Authored review state: tier unavailable."]),
        ),
      }
    : { degraded: false, degradedTiers: [], reasons: {} };
}

/**
 * A `ContentView` in one review state — the prop the viewer views take. The shape is
 * the application's own; only the values are authored. Empty is a real, servable
 * document with no body — not an error.
 */
export function contentView(
  state: ReviewState,
  kind: "markdown" | "code",
): ContentView {
  return {
    ...availability(state, ["structural"]),
    loading: state === "loading",
    errored: false,
    notFound: false,
    path:
      kind === "markdown" ? ".vault/research/alpha-research.md" : "src/lib/fitScale.ts",
    blobHash: "0f9c2a4e",
    languageHint: kind === "markdown" ? "markdown" : "typescript",
    text:
      state === "normal" ? (kind === "markdown" ? SAMPLE_MARKDOWN : SAMPLE_CODE) : "",
    truncated: null,
    available: state === "normal" || state === "empty",
  };
}
