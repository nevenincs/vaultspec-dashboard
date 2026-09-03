/**
 * Private generation-aware cursor draining for complete engine listings.
 *
 * Listing callers supply their request shape and presentation policy. This
 * helper owns only the consistency mechanics common to every generation-keyed
 * cursor walk: one baseline generation per attempt, restart on a straddle,
 * bounded attempts/pages, latest page tiers, continuation, and settlement.
 */

export interface GenerationListingPage<TEntry, TTiers> {
  entries: readonly TEntry[];
  tiers?: TTiers;
  generation?: number;
  nextCursor?: string;
}

export interface GenerationListingDrainSnapshot<TEntry, TTiers> {
  entries: TEntry[];
  tiers: TTiers;
  generation: number | undefined;
  straddled: boolean;
  nextCursor: string | undefined;
  pageCapReached: boolean;
}

export interface GenerationListingDrainContinuation<
  TEntry,
  TTiers,
> extends GenerationListingDrainSnapshot<TEntry, TTiers> {
  attempt: number;
  page: number;
}

export interface GenerationListingDrainOptions<TEntry, TTiers> {
  initialTiers: TTiers;
  maxPages: number;
  maxRestarts: number;
  fetchPage: (request: {
    attempt: number;
    cursor: string | undefined;
    page: number;
  }) => Promise<GenerationListingPage<TEntry, TTiers>>;
  onContinuation?: (
    snapshot: GenerationListingDrainContinuation<TEntry, TTiers>,
  ) => void | Promise<void>;
  onSettle?: () => void;
}

/** Drain a paginated listing without ever returning a generation baseline for
 * a straddled attempt. `onContinuation` is optional so callers can attach
 * partial rendering, progress reporting, or a cooperative yield without
 * embedding those policies in the drain. */
export async function drainGenerationListing<TEntry, TTiers>(
  options: GenerationListingDrainOptions<TEntry, TTiers>,
): Promise<GenerationListingDrainSnapshot<TEntry, TTiers>> {
  try {
    for (let attempt = 0; ; attempt += 1) {
      const canRestart = attempt < options.maxRestarts;
      const entries: TEntry[] = [];
      let tiers = options.initialTiers;
      let generation: number | undefined;
      let straddled = false;
      let cursor: string | undefined;
      let restart = false;

      for (let page = 0; page < options.maxPages; page += 1) {
        const body = await options.fetchPage({ attempt, cursor, page });
        if (page === 0) {
          generation = body.generation;
        } else if (
          body.generation !== undefined &&
          generation !== undefined &&
          body.generation !== generation
        ) {
          if (canRestart) {
            restart = true;
            break;
          }
          straddled = true;
        }

        entries.push(...body.entries);
        if (body.tiers !== undefined) tiers = body.tiers;
        cursor = body.nextCursor;
        if (cursor === undefined) break;

        await options.onContinuation?.({
          attempt,
          page,
          entries: [...entries],
          tiers,
          generation,
          straddled,
          nextCursor: cursor,
          pageCapReached: false,
        });
      }

      if (restart) continue;
      return {
        entries,
        tiers,
        generation: straddled ? undefined : generation,
        straddled,
        nextCursor: cursor,
        pageCapReached: cursor !== undefined,
      };
    }
  } finally {
    options.onSettle?.();
  }
}
