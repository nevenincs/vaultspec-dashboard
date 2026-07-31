// Specimens: `shell` area (`src/app/shell/`, excluding `CompactAppShell` — reviewed
// elsewhere). Compact-viewport chrome: the bottom tab bar, the collapsed left-rail
// icon strip, the mobile top bar, the sliding document reader, the compact timeline
// delegate, and the merged Status+Browse home pane.

import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";

import { BottomTabBar } from "@app/app/shell/BottomTabBar";
import { CompactDocReader } from "@app/app/shell/CompactDocReader";
import { CompactTimeline } from "@app/app/shell/CompactTimeline";
import { CompactUnifiedRail } from "@app/app/shell/CompactUnifiedRail";
import { IconRail, type CollapsedRailMode } from "@app/app/shell/IconRail";
import { MobileTopBar, type MobileTopBarAction } from "@app/app/shell/MobileTopBar";
import type { CompactSurface } from "@app/stores/view/compactSurface";
import { closeDocTab, previewDocTab } from "@app/stores/view/tabs";
import { docNodeIdFromStem, stemFromPath } from "@app/stores/server/liveAdapters";
import {
  LEFT_RAIL_TOGGLE_FACETS_ACTION_ID,
  LEFT_RAIL_TOGGLE_FACETS_LABEL,
} from "@app/stores/view/leftRailKeybindings";
import {
  SEARCH_PALETTE_ACTION_ID,
  SEARCH_PALETTE_SHORTCUT_LABEL,
} from "@app/stores/view/commandPalette";
import { Funnel, MagnifyingGlass } from "@app/app/kit/glyphs";
import { engineKeys } from "@app/stores/server/queries";
import type {
  ContentResponse,
  FileTreeEntry,
  FileTreeResponse,
  MapResponse,
  VaultTreeEntry,
  VaultTreeResponse,
} from "@app/stores/server/engine";

import type { SpecimenDef } from "../registry";
import type { ReviewState } from "../state";
import {
  REVIEW_SCOPE,
  SAMPLE_MARKDOWN,
  seedSessionAndDashboardState,
  tiersDown,
  tiersHealthy,
} from "./support";
import { seedTimeline } from "./timeline";

// --- shell-bottomtabbar / shell-iconrail --------------------------------------------
//
// Both are pure dumb chrome (dashboard-layer-ownership: no fetch, no state, no
// `tiers`) — the STATE axis has no distinct visual for either, so `active` is varied
// per state instead so all four cells are scannable rather than four copies of the
// same thing.

const BOTTOM_TAB_ACTIVE_BY_STATE: Record<ReviewState, CompactSurface> = {
  normal: "home",
  loading: "timeline",
  empty: "search",
  degraded: "home",
};

const ICON_RAIL_ACTIVE_BY_STATE: Record<ReviewState, CollapsedRailMode> = {
  normal: "vault",
  loading: "code",
  empty: "vault",
  degraded: "code",
};

// --- shell-mobiletopbar ---------------------------------------------------------------
//
// Dumb chrome with no data-bearing condition of its own, so the four states author
// four different REAL prop combinations the production top bar actually renders
// (title-as-trigger, back control, action set, pressed action) rather than four
// identical cells — never a fabricated loading/degraded look, since it has none.

const SEARCH_ACTION: MobileTopBarAction = {
  id: SEARCH_PALETTE_ACTION_ID,
  label: SEARCH_PALETTE_SHORTCUT_LABEL,
  Glyph: MagnifyingGlass,
  onClick: () => undefined,
};

function filterAction(active: boolean): MobileTopBarAction {
  return {
    id: LEFT_RAIL_TOGGLE_FACETS_ACTION_ID,
    label: LEFT_RAIL_TOGGLE_FACETS_LABEL,
    Glyph: Funnel,
    onClick: () => undefined,
    active,
  };
}

function mobileTopBarProps(state: ReviewState) {
  switch (state) {
    case "normal":
      return {
        title: "main",
        onTitleActivate: () => undefined,
        actions: [SEARCH_ACTION, filterAction(false)],
      };
    case "loading":
      return { title: "Timeline", actions: [] };
    case "empty":
      return { title: "Alpha research", onBack: () => undefined };
    case "degraded":
      return {
        title: "main",
        onTitleActivate: () => undefined,
        actions: [SEARCH_ACTION, filterAction(true)],
      };
  }
}

// --- shell-compactdocreader ------------------------------------------------------------

const DOC_PATH = ".vault/research/2026-07-30-mobile-preview-research.md";
const DOC_NODE_ID = docNodeIdFromStem(stemFromPath(DOC_PATH));

function docContentResponse(state: ReviewState): ContentResponse {
  const text = state === "empty" ? "" : SAMPLE_MARKDOWN;
  return {
    path: DOC_PATH,
    blob_hash: "6cf1a0e9",
    byte_len: text.length,
    language_hint: "markdown",
    text,
    truncated: null,
    tiers:
      state === "degraded" ? tiersDown(["structural"]) : tiersHealthy("structural"),
  };
}

/** Opens the doc reader's one document via the same store action a tap on a search
 *  result or a rail row dispatches (`previewDocTab`), and closes it on unmount so a
 *  state switch — which remounts this wrapper — never leaves the (module-singleton)
 *  view store's active doc pointed at a specimen's fixture. `solo` because the
 *  active document is a singleton: four instances would fight over one pointer. */
function CompactDocReaderSpecimen() {
  useEffect(() => {
    void previewDocTab(DOC_NODE_ID, "markdown", REVIEW_SCOPE);
    return () => closeDocTab(DOC_NODE_ID);
  }, []);
  return <CompactDocReader />;
}

// --- shell-compactunifiedrail -----------------------------------------------------------
//
// A thin container composing StatusTab + BrowserRegion (Vault/Files) + the pinned
// FrameworkStatusCluster + the canonical filter sheet, all behind their own stores
// hooks. Each of those is reviewed as its own surface elsewhere on the desk; this
// specimen seeds only the shared session/dashboardState + vault/code tree reads the
// Browse fold needs to render something believable, and leaves the Status fold's
// plan/PR/issue/git reads unseeded (their own honest loading condition — the same
// treatment those surfaces get on their own specimen).

const RAIL_VAULT_ENTRIES: VaultTreeEntry[] = [
  {
    path: `.vault/research/2026-07-30-alpha-initiative-research.md`,
    doc_type: "research",
    title: "Alpha initiative research",
    feature_tags: ["alpha-initiative"],
    dates: { created: "2026-07-30", modified: "2026-07-30" },
    size: { bytes: 4200, words: 640 },
  },
  {
    path: `.vault/adr/2026-07-30-alpha-initiative-adr.md`,
    doc_type: "adr",
    title: "Alpha initiative decision",
    feature_tags: ["alpha-initiative"],
    dates: { created: "2026-07-30", modified: "2026-07-30" },
    status: "accepted",
    size: { bytes: 2600, words: 410 },
  },
];

const RAIL_CODE_ENTRIES: FileTreeEntry[] = [
  { path: "src", kind: "dir", has_children: true, node_id: "code:src" },
  { path: "README.md", kind: "file", has_children: false, node_id: "code:README.md" },
];

function railVaultTree(state: ReviewState): VaultTreeResponse {
  if (state === "empty")
    return { entries: [], tiers: tiersHealthy("structural"), complete: true };
  return {
    entries: RAIL_VAULT_ENTRIES,
    tiers:
      state === "degraded" ? tiersDown(["structural"]) : tiersHealthy("structural"),
    complete: true,
  };
}

function railFileTree(state: ReviewState): FileTreeResponse {
  if (state === "empty") {
    return {
      entries: [],
      path: "",
      truncated: null,
      tiers: tiersHealthy("structural"),
    };
  }
  return {
    entries: RAIL_CODE_ENTRIES,
    path: "",
    truncated: null,
    tiers:
      state === "degraded" ? tiersDown(["structural"]) : tiersHealthy("structural"),
  };
}

function seedCompactUnifiedRail(client: QueryClient, state: ReviewState): void {
  seedSessionAndDashboardState(client);
  if (state === "loading") return;
  client.setQueryData(engineKeys.vaultTree(REVIEW_SCOPE), railVaultTree(state));
  client.setQueryData(engineKeys.fileTree(REVIEW_SCOPE), railFileTree(state));
  const map: MapResponse = {
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
      state === "degraded" ? tiersDown(["structural"]) : tiersHealthy("structural"),
  };
  client.setQueryData(engineKeys.map(), map);
}

// --- registry ---------------------------------------------------------------------------

export const shellSpecimens: Readonly<Record<string, SpecimenDef>> = {
  "shell-bottomtabbar": {
    note: "Pure dumb chrome (no fetch, no state, no tiers) — the review-state axis has no distinct visual, so `active` is varied per state (Home/Timeline/Search) to keep the four cells scannable rather than four identical bars.",
    render: (state) => (
      <BottomTabBar
        active={BOTTOM_TAB_ACTIVE_BY_STATE[state]}
        onSelect={() => undefined}
      />
    ),
  },

  "shell-iconrail": {
    note: "Pure dumb chrome, same inert-axis treatment as shell-bottomtabbar: `active` alternates Vault/Files across the four states.",
    render: (state) => (
      <IconRail active={ICON_RAIL_ACTIVE_BY_STATE[state]} onSelect={() => undefined} />
    ),
  },

  "shell-mobiletopbar": {
    note: "Pure dumb chrome with no loading/empty/degraded condition of its own, so each state authors a distinct REAL prop combination the production bar renders (title-as-trigger, a back control, an action pair, a pressed filter action) instead of four copies of one look.",
    render: (state) => <MobileTopBar {...mobileTopBarProps(state)} />,
  },

  "shell-compactdocreader": {
    solo: true,
    host: "relative h-[32rem] w-[22rem]",
    note: "Container: renders nothing without an active doc, so a local wrapper opens one on mount via the real previewDocTab(nodeId, 'markdown', scope) store action (the same action a rail/search tap dispatches) and closes it on unmount. Seeds the raw content query at engineKeys.content(scope, nodeId) — the reader's own useDockDocPanelView/useContentView chain derives loading/degraded from it. Empty authors a real, servable document with no body (an honest empty document, not an error).",
    seed: (client, state) => {
      if (state === "loading") return;
      client.setQueryData(
        engineKeys.content(REVIEW_SCOPE, DOC_NODE_ID),
        docContentResponse(state),
      );
    },
    render: (state) => <CompactDocReaderSpecimen key={state} />,
  },

  "shell-compacttimeline": {
    host: "relative h-[6rem]",
    note: "Thin delegate to TimelineRange (compact variant) — same seed chain as the timeline area's own TimelineRangeSelector specimen (session + dashboardState + /filters bounds + /map).",
    seed: (client, state) => seedTimeline(client, state),
    render: () => <CompactTimeline scope={REVIEW_SCOPE} />,
  },

  "shell-compactunifiedrail": {
    host: "relative h-[36rem] w-[24rem]",
    note: "Thin container composing StatusTab + BrowserRegion + the pinned FrameworkStatusCluster + the canonical filter sheet behind their own stores hooks. Seeds only the shared session/dashboardState and the vault/code tree reads the Browse fold needs; the Status fold's plan/PR/issue/git reads are left unseeded on purpose — each of those surfaces is reviewed on its own specimen elsewhere on the desk, so this composite only proves the shell renders around them.",
    seed: (client, state) => seedCompactUnifiedRail(client, state),
    render: () => <CompactUnifiedRail />,
  },
};
