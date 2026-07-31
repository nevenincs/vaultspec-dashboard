// Specimens: `timeline` area (the fixed two-handle date-range selector and its
// satellites — the diachronic lineage view was torn down; this is a bounds-fetching
// container, its self-scoped delegate, and the time-travel mode chip).

import type { QueryClient } from "@tanstack/react-query";

import { Timeline } from "@app/app/timeline/Timeline";
import { TimeTravelChip } from "@app/app/timeline/TimeTravelChip";
import { TimelineRange } from "@app/app/timeline/TimelineRangeSelector";
import { engineKeys } from "@app/stores/server/queries";
import type {
  DashboardState,
  FiltersVocabulary,
  MapResponse,
} from "@app/stores/server/engine";

import type { SpecimenDef } from "../registry";
import type { ReviewState } from "../state";
import {
  REVIEW_SCOPE,
  seedSessionAndDashboardState,
  tiersDown,
  tiersHealthy,
} from "./support";

/** A corpus with a believable multi-week span, so the range selector's fixed
 *  two-handle track has visible room to narrow. */
function filtersVocabulary(state: ReviewState): FiltersVocabulary {
  return {
    relations: [],
    tiers: [],
    doc_types: ["research", "adr", "plan"],
    feature_tags: ["alpha-initiative"],
    kinds: [],
    statuses: ["accepted"],
    plan_states: ["active"],
    health: [],
    // `empty` authors a corpus with no dated documents at all — the honest
    // "no dated documents" render, distinct from a degraded read.
    date_bounds:
      state === "empty" ? undefined : { from: "2026-07-01", to: "2026-07-24" },
    // useTimelineAvailability reads BOTH `structural` and `temporal` off this
    // block (TIMELINE_CONTENT_TIERS) and readTierAvailability treats a tier
    // ABSENT from a served block as unavailable — so every non-degraded state
    // must serve both tiers healthy, not just `structural`, or the range
    // selector falls into its "unavailable" branch even in Default/Empty.
    tiers_block:
      state === "degraded"
        ? tiersDown(["structural", "temporal"])
        : tiersHealthy("structural", "temporal"),
  };
}

function mapResponse(state: ReviewState): MapResponse {
  return {
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
}

/**
 * Seed the timeline's read chain: session + shared dashboard-state (gates every
 * consumer below), the `/filters` corpus-bounds vocabulary the range selector reads
 * for its span and its degraded/empty branches, and the `/map` read its
 * `useWorkspaceMapSurface` call always mounts (only load-bearing for a NULL scope,
 * which this desk never authors, but seeded anyway so the query never sits pending
 * for no visual reason). `loading` leaves the vocabulary and map unseeded so the
 * range selector's own `vocabulary.loading` branch renders its skeleton — the
 * container's honest loading state, not a fabricated one.
 */
export function seedTimeline(
  client: QueryClient,
  state: ReviewState,
  dashboardOverrides: Partial<DashboardState> = {},
): void {
  seedSessionAndDashboardState(client, dashboardOverrides);
  if (state === "loading") return;
  client.setQueryData(
    engineKeys.filters(REVIEW_SCOPE, "vault"),
    filtersVocabulary(state),
  );
  client.setQueryData(engineKeys.map(), mapResponse(state));
}

/** A constant epoch (2026-07-18T09:30) so the time-travel chip's rendered instant
 *  never drifts between reviews. */
const TIME_TRAVEL_AT_MS = Date.parse("2026-07-18T09:30:00.000Z");

export const timelineSpecimens: Readonly<Record<string, SpecimenDef>> = {
  "timeline-timelinerangeselector": {
    note: "Container: seeds session + dashboardState (gates every read below), the /filters corpus-bounds vocabulary (span, loading, and degraded truth), and /map (mounted unconditionally by useWorkspaceMapSurface, load-bearing only for a null scope — never authored here). Loading leaves the vocabulary unseeded so the component's own skeleton renders. Empty authors a vocabulary with no date bounds at all — the honest 'no dated documents' render, not a fabricated span.",
    seed: (client, state) => seedTimeline(client, state),
    render: () => <TimelineRange scope={REVIEW_SCOPE} variant="desktop" />,
  },

  "timeline-timeline": {
    host: "relative h-[8rem]",
    note: "Thin self-scoped delegate to TimelineRange (desktop variant) — reads the active scope itself via useActiveScope(), which the desk pins to REVIEW_SCOPE at boot. Same seed chain as timeline-timelinerangeselector.",
    seed: (client, state) => seedTimeline(client, state),
    render: () => <Timeline />,
  },

  "timeline-timetravelchip": {
    host: "relative h-[6rem]",
    note: "Renders null unless the shared dashboard timeline_mode is time-travel, so only Default seeds a time-travel mode (a constant epoch) to show the visible chip. Loading, Empty, and Degraded all seed (or leave unseeded) a live/pending mode — the chip's own honest condition for those states is rendering nothing, since it has no distinct loading/empty/degraded presentation of its own; this axis is largely inert for this surface.",
    seed: (client, state) => {
      if (state === "loading") return;
      seedSessionAndDashboardState(
        client,
        state === "normal"
          ? { timeline_mode: { kind: "time-travel", at: TIME_TRAVEL_AT_MS } }
          : { timeline_mode: { kind: "live" } },
      );
    },
    render: () => <TimeTravelChip scope={REVIEW_SCOPE} />,
  },
};
