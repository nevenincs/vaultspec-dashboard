// Decomposed from engine.ts (module-decomposition mandate, 2026-07-12).

// --- cross-cutting contract shapes (§2) ----------------------------------------

/**
 * The component compatibility handshake the engine attaches to a tier
 * (dashboard-packaging D6): the sibling tool the tier rides on, the floor the
 * dashboard declares for it, the probed version (null when unknowable — rag
 * reports none), and the served floor verdict. All values are engine-served;
 * the client only maps them to presentation.
 */
export interface TierComponent {
  readonly name: string;
  readonly floor: string;
  readonly version: string | null;
  readonly meets_floor?: boolean | null;
}

/** Every response carries a per-tier degradation block — truthful absence. */
export type TiersBlock = Record<
  string,
  { available: boolean; reason?: string; component?: TierComponent }
>;

/**
 * The canonical, ordered tier-name vocabulary (contract §2). The single source
 * of truth for the four provenance tiers and their order — both the membership a
 * `*Availability` reader inspects and the tie-break ordering a dominant-tier pick
 * resolves by (liveAdapters `dominantTier`). Defined once here beside `TiersBlock`
 * (its owning type) and imported everywhere; per-surface single-tier subsets
 * (e.g. `["semantic"]`) stay local — this is the full ordered set, not a subset.
 */
export const CANONICAL_TIERS = [
  "declared",
  "structural",
  "temporal",
  "semantic",
] as const;

export class EngineError extends Error {
  readonly status: number;
  readonly path: string;
  /**
   * The per-tier degradation block the engine attaches to its error envelope
   * (contract §2; the every-wire-response-carries-the-tiers-block rule).
   * Preserved through the error path so a backend-DOWN condition (e.g. a
   * rag-down 502) surfaces as degradation truth the GUI can render, never a
   * tiers-less bare error. Undefined only when the failure carried no
   * structured envelope (a genuine transport fault).
   */
  readonly tiers?: TiersBlock;
  /** The unwrapped error envelope body, when the engine served one. */
  readonly body?: unknown;

  /** The machine-readable `error_kind` the engine attaches to a typed error
   *  envelope (dashboard-settings: unknown_key / scope_not_allowed /
   *  invalid_value), when present. Lets a consumer distinguish WHY a write was
   *  rejected without parsing the human message. Undefined for untyped errors. */
  get errorKind(): string | undefined {
    if (this.body && typeof this.body === "object" && "error_kind" in this.body) {
      const kind = (this.body as { error_kind?: unknown }).error_kind;
      return typeof kind === "string" ? kind : undefined;
    }
    return undefined;
  }

  /** The human-facing `error` message the engine served, when present. */
  get errorMessage(): string | undefined {
    if (this.body && typeof this.body === "object" && "error" in this.body) {
      const msg = (this.body as { error?: unknown }).error;
      return typeof msg === "string" ? msg : undefined;
    }
    return undefined;
  }
  constructor(
    path: string,
    status: number,
    detail?: { tiers?: TiersBlock; body?: unknown },
  ) {
    super(`engine ${path} responded ${status}`);
    this.path = path;
    this.status = status;
    this.tiers = detail?.tiers;
    this.body = detail?.body;
  }
}

// --- the single per-tier degradation read (contract §2) -------------------------
//
// One reader for the whole stores layer, encoding the degradation honesty law
// (degradation-is-read-from-tiers-not-guessed-from-errors) exactly once. Every
// `*Availability` surface was previously re-declaring this same triplet and
// re-walking the same loop by hand; collapsing them here means a new tier or a
// precedence fix touches one place, not 8+.

/**
 * The interpreted per-tier degradation a stores reader hands to chrome — never
 * the raw `tiers` block (dashboard-layer-ownership). The one shape the seven
 * former `*Availability` interfaces re-declared. Surfaces that carry extra
 * fields (loading, lens, items, artifacts) compose this triplet.
 */
export interface TierAvailability {
  /** At least one of the inspected tiers is unavailable or absent from the block. */
  degraded: boolean;
  /** Names of the inspected tiers reporting unavailable (or absent from the block). */
  degradedTiers: string[];
  /** Per-tier human reason the engine supplied, keyed by tier name. */
  reasons: Record<string, string>;
  /** The served component handshake per inspected tier, when the engine
   *  attached one (dashboard-packaging D6): advisory floor/version data for
   *  status surfaces. Never folded into `degraded` — the engine's served
   *  eligibility is the authority on what a below-floor component blocks.
   *  Optional so composed availability shapes need not carry it. */
  components?: Record<string, TierComponent>;
}

/**
 * The single per-tier degradation loop. For each requested tier name, a tier
 * that is absent from the served block OR reports `available:false` is degraded
 * (contract §2: absence is degradation, not availability), recording the
 * engine's reason for copy-tone rendering. A wholly absent block (`undefined` —
 * a tiers-less transport fault) is NOT treated as degraded: that is the query's
 * error state, which each surface renders distinctly. Degradation is reported
 * only from a block the engine actually served.
 */
export function readTierAvailability(
  tiers: TiersBlock | undefined,
  tierNames: readonly string[],
): TierAvailability {
  if (!tiers)
    return { degraded: false, degradedTiers: [], reasons: {}, components: {} };
  const degradedTiers: string[] = [];
  const reasons: Record<string, string> = {};
  const components: Record<string, TierComponent> = {};
  for (const tier of tierNames) {
    const state = tiers[tier];
    // The component handshake (dashboard-packaging D6) is exposed as served
    // data, NOT folded into `degraded`: a below-floor core still reads fine —
    // the engine's own served eligibility blocks the authoring verbs it
    // cannot honor, and inventing a whole-tier client-side degradation would
    // grey working read surfaces (P02 review). Surfaces that want to render
    // component staleness (status chrome, settings) read `components`.
    if (state?.component) components[tier] = state.component;
    if (state === undefined || state.available === false) {
      degradedTiers.push(tier);
      if (state?.reason) reasons[tier] = state.reason;
    }
  }
  return { degraded: degradedTiers.length > 0, degradedTiers, reasons, components };
}

/**
 * Pick the freshest tiers block out of a query's success data + error state,
 * encoding the precedence the wire honesty law mandates in ONE place: a FRESH
 * error envelope's tiers win over a STALE held-success block
 * (degradation-is-read-from-tiers-not-guessed-from-errors). When the latest
 * request errored with a tiers-bearing `EngineError`, that error's tiers are the
 * freshest availability truth and override the previously held success snapshot;
 * a tiers-less transport fault contributes nothing, falling back to the held
 * success block. Every former per-site `errTiers ?? data?.tiers` (and the one
 * BACKWARDS `fromData ?? fromError`) is replaced by this.
 */
export function tiersFromQuery(query: {
  data?: { tiers?: TiersBlock } | undefined;
  error?: unknown;
}): TiersBlock | undefined {
  const fromError = query.error instanceof EngineError ? query.error.tiers : undefined;
  return fromError ?? query.data?.tiers;
}
