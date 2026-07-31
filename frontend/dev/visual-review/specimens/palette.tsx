// Specimens: `palette` area (`src/app/palette/`). All three surfaces are
// closed-by-default `document.body` overlays lifted by the ONE command-palette view
// store (`stores/view/commandPalette.ts`), opened here through the exact same store
// actions a Mod+K / Mod+Alt+S / Mod+Alt+F keypress dispatches — never a bespoke open
// path. Every specimen is `solo` (the store is a module singleton; four open overlays
// would fight over it) and closes the palette on unmount so switching review states —
// which remounts the wrapper — never leaks an open overlay or a stale query into the
// next specimen visited on the desk.

import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";

// Side-effect import: the command-provider registry (`resolveCommands` reads) is
// populated only by each provider module's own registration on import. The real app
// enrolls the full set exactly once from `AppShell` via this same module
// (`app/menus/registerAllCommands`); the hermetic desk never mounts `AppShell`, so
// without this import `palette-commandpalette` would open onto a genuinely empty
// registry — not a fabricated "no results" but a starved one. Importing the app's own
// registration module here enrolls the REAL providers, never a duplicate/bespoke set.
import "@app/app/menus/registerAllCommands";

import { CommandPalette } from "@app/app/palette/CommandPalette";
import { DocumentSearchSurface } from "@app/app/palette/DocumentSearchSurface";
import { SearchPaletteSurface } from "@app/app/palette/SearchPaletteSurface";
import {
  closeCommandPalette,
  openCommandPalette,
  openDocumentSearchPalette,
  openSearchPalette,
  setCommandPaletteQuery,
} from "@app/stores/view/commandPalette";
import { engineKeys } from "@app/stores/server/queries";
import type {
  CodeFilesResponse,
  FiltersVocabulary,
  SearchResponse,
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

// --- shared fixtures ----------------------------------------------------------------

const ALPHA_DOC_PATH = ".vault/research/2026-07-30-alpha-initiative-research.md";

const VAULT_ENTRIES: VaultTreeEntry[] = [
  {
    path: ALPHA_DOC_PATH,
    doc_type: "research",
    title: "Alpha initiative research",
    feature_tags: ["alpha-initiative"],
    dates: { created: "2026-07-30", modified: "2026-07-30" },
    size: { bytes: 4200, words: 640 },
  },
];

/** An empty-but-healthy vault tree — used wherever a provider needs its backing
 *  read settled (not pending) but contributing no hits of its own. */
function emptyVaultTree(down: boolean): VaultTreeResponse {
  return {
    entries: [],
    tiers: down ? tiersDown(["structural"]) : tiersHealthy("structural"),
    complete: true,
  };
}

function emptyCodeFiles(down: boolean): CodeFilesResponse {
  return {
    entries: [],
    tiers: down ? tiersDown(["structural"]) : tiersHealthy("structural"),
    truncated: null,
  };
}

// --- palette-commandpalette -----------------------------------------------------------
//
// The command list itself is assembled from stores/view state, not the engine — it
// renders regardless of what's seeded. `navLoading` is driven by the SAME
// `/filters` vocabulary read the timeline area's specimens seed
// (`useFiltersVocabularyView` inside `useCommandPaletteCommandView`), so it gets the
// identical loading/degraded treatment here.

function commandPaletteVocabulary(down: boolean): FiltersVocabulary {
  return {
    relations: [],
    tiers: [],
    doc_types: ["research", "adr"],
    feature_tags: ["alpha-initiative"],
    kinds: [],
    statuses: ["accepted"],
    plan_states: [],
    health: [],
    // Degraded authors NO date bounds too — a structural-tier outage leaves the
    // corpus span unreliable, which disables the palette's "fit timeline to
    // corpus" command, a real (if narrow) degraded difference.
    date_bounds: down ? undefined : { from: "2026-07-01", to: "2026-07-24" },
    tiers_block: down ? tiersDown(["structural"]) : tiersHealthy("structural"),
  };
}

const NO_MATCH_QUERY = "zzz-no-command-matches-this-query";

function CommandPaletteSpecimen({ state }: { state: ReviewState }) {
  useEffect(() => {
    openCommandPalette();
    if (state === "empty") setCommandPaletteQuery(NO_MATCH_QUERY);
    return () => closeCommandPalette();
  }, [state]);
  return <CommandPalette />;
}

// --- palette-documentsearchsurface -----------------------------------------------------
//
// `useDocumentSearchController` is a thin consumer of the files(vault) provider,
// which reads the complete cached vault tree (`useVaultTree`) and matches literally —
// no debounce, no separate search endpoint.

const DOC_SEARCH_QUERY = "alpha";
const DOC_SEARCH_NO_MATCH_QUERY = "zzz-nothing-named-this";

function documentSearchVaultTree(state: ReviewState): VaultTreeResponse {
  return {
    entries: VAULT_ENTRIES,
    tiers:
      state === "degraded" ? tiersDown(["structural"]) : tiersHealthy("structural"),
    complete: true,
  };
}

function DocumentSearchSpecimen({ state }: { state: ReviewState }) {
  useEffect(() => {
    openDocumentSearchPalette();
    setCommandPaletteQuery(
      state === "empty" ? DOC_SEARCH_NO_MATCH_QUERY : DOC_SEARCH_QUERY,
    );
    return () => closeCommandPalette();
  }, [state]);
  return <DocumentSearchSurface />;
}

// --- palette-searchpalettesurface -------------------------------------------------------
//
// `useSearchProviders` merges three sources: the semantic `/search` pair (vault +
// code targets), and the two literal files providers (vault tree, code-file
// listing). Results-first short-circuiting means seeding ONE source with hits is
// enough for Default; Degraded needs the literal providers settled too (empty but
// NOT pending), or their own in-flight state would mask the semantic-offline
// condition behind a loading skeleton instead.

const SEARCH_QUERY = "alpha";
const SEARCH_NO_MATCH_QUERY = "zzz-nothing-found-anywhere";

function semanticHits(): SearchResponse {
  return {
    results: [
      {
        score: 0.91,
        source: "vault",
        title: "Alpha initiative research",
        excerpt: "Establishes the problem space for the alpha investigation…",
        doc_type: "research",
        feature: "alpha-initiative",
        node_id: "doc:2026-07-30-alpha-initiative-research",
      },
      {
        score: 0.74,
        source: "vault",
        title: "Alpha initiative decision",
        excerpt: "Records the accepted approach for the alpha initiative…",
        doc_type: "adr",
        feature: "alpha-initiative",
        node_id: "doc:2026-07-30-alpha-initiative-adr",
      },
    ],
    tiers: tiersHealthy("structural", "semantic"),
  };
}

function emptySemanticResponse(down: boolean): SearchResponse {
  return {
    results: [],
    tiers: down ? tiersDown(["semantic"]) : tiersHealthy("structural", "semantic"),
  };
}

function seedSearchPalette(client: QueryClient, state: ReviewState): void {
  if (state === "loading") return;
  const query = state === "empty" ? SEARCH_NO_MATCH_QUERY : SEARCH_QUERY;
  const down = state === "degraded";
  client.setQueryData(
    engineKeys.search(REVIEW_SCOPE, query, "vault"),
    state === "normal" ? semanticHits() : emptySemanticResponse(down),
  );
  client.setQueryData(
    engineKeys.search(REVIEW_SCOPE, query, "code"),
    emptySemanticResponse(down),
  );
  // Settle the two literal providers too (empty, but not pending) so a Degraded
  // semantic outage isn't masked by an unrelated loading skeleton from them.
  client.setQueryData(engineKeys.vaultTree(REVIEW_SCOPE), emptyVaultTree(down));
  client.setQueryData(engineKeys.codeFiles(REVIEW_SCOPE), emptyCodeFiles(down));
}

function SearchPaletteSpecimen({ state }: { state: ReviewState }) {
  useEffect(() => {
    openSearchPalette();
    setCommandPaletteQuery(state === "empty" ? SEARCH_NO_MATCH_QUERY : SEARCH_QUERY);
    return () => closeCommandPalette();
  }, [state]);
  return <SearchPaletteSurface />;
}

// --- registry ---------------------------------------------------------------------------

export const paletteSpecimens: Readonly<Record<string, SpecimenDef>> = {
  "palette-commandpalette": {
    solo: true,
    note: "Closed-by-default overlay: the wrapper fires the real openCommandPalette() store action on mount (the exact Mod+K dispatch) and closeCommandPalette() on unmount. The command list itself derives from stores/view state, not the engine, so it renders regardless of seeding; navLoading is the same /filters vocabulary read the timeline specimens seed, so Loading leaves it unseeded (skeleton) and Degraded seeds it tiers-down with no date bounds (disabling the one command that needs a corpus span — a narrow but real degraded difference). Empty sets the query to a string no command label matches.",
    seed: (client, state) => {
      seedSessionAndDashboardState(client);
      if (state === "loading") return;
      client.setQueryData(
        engineKeys.filters(REVIEW_SCOPE, "vault"),
        commandPaletteVocabulary(state === "degraded"),
      );
    },
    render: (state) => <CommandPaletteSpecimen key={state} state={state} />,
  },

  "palette-documentsearchsurface": {
    solo: true,
    note: "Closed-by-default overlay: the wrapper fires openDocumentSearchPalette() on mount and sets the query via the real setCommandPaletteQuery store setter (the same path typing into the input takes). useDocumentSearchController is a thin consumer of the files(vault) literal-match provider over the cached vault tree, so seeding is just that tree. Loading leaves it unseeded with a non-empty query (the provider's own in-flight state). Empty seeds a real tree but a query nothing matches.",
    seed: (client, state) => {
      if (state === "loading") return;
      client.setQueryData(
        engineKeys.vaultTree(REVIEW_SCOPE),
        documentSearchVaultTree(state),
      );
    },
    render: (state) => <DocumentSearchSpecimen key={state} state={state} />,
  },

  "palette-searchpalettesurface": {
    solo: true,
    note: "Closed-by-default overlay: the wrapper fires openSearchPalette() on mount and sets the query via the real store setter. useSearchProviders merges the semantic /search pair with the two literal files providers; Default seeds a couple of semantic hits (entries-first short-circuit means the literal providers' own state doesn't matter once there are results). Degraded seeds the semantic tier down on both search targets AND settles the literal providers to an empty-but-ready state, so the semantic-offline condition is visible rather than masked by an unrelated loading skeleton. Empty seeds every source ready with zero matches. Loading leaves everything unseeded.",
    seed: (client, state) => seedSearchPalette(client, state),
    render: (state) => <SearchPaletteSpecimen key={state} state={state} />,
  },
};
