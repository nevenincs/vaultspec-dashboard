// Live-origin adapters (W03.P12.S49): the anti-corruption layer between
// the live serve wire and the client's internal contract types. The
// contract is binding at capability level with shapes illustrative; the
// live engine settled several shapes differently (the `{data, tiers}`
// envelope, a flat workspace map, a vocabulary wrapper, stem-keyed vault
// trees, an index-rollup status). Each adapter is TOLERANT: a body already
// in the internal shape (the mock) passes through unchanged, so one client
// code path serves both origins — the S49 verification property.
//
// Capability-level divergences that an adapter cannot honestly paper over
// are NOT absorbed here; they are flagged in the S49 record and to the
// engine owners (loose-scoping stance).

import type {
  EngineStatus,
  FiltersVocabulary,
  MapResponse,
  TiersBlock,
  VaultTreeResponse,
} from "./engine";

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null;

/**
 * Unwrap the live `{data, tiers}` envelope (and the events family's extra
 * `{payload}` nesting) onto the internal flat-with-tiers shape. Flat
 * bodies pass through.
 */
export function unwrapEnvelope(body: unknown): unknown {
  if (!isRec(body) || !isRec(body.data) || !("tiers" in body)) return body;
  let data = body.data;
  if (isRec(data.payload) && Object.keys(data).length <= 2) {
    // events: {data: {payload: {...}, shape}} → payload
    data = data.payload;
  }
  return { ...data, tiers: body.tiers as TiersBlock };
}

/** Live workspace map → the internal repositories shape. */
export function adaptMap(body: unknown): MapResponse {
  if (!isRec(body)) return body as MapResponse;
  if ("repositories" in body) return body as unknown as MapResponse;
  const worktrees = Array.isArray(body.worktrees) ? (body.worktrees as Rec[]) : [];
  const branches = Array.isArray(body.branches) ? (body.branches as Rec[]) : [];
  return {
    repositories: [
      {
        path: String(body.workspace ?? ""),
        branches: branches.map((b) => ({
          name: String(b.name ?? ""),
          kind: (b.class === "default"
            ? "default"
            : b.class === "feature"
              ? "feature"
              : "other") as "default" | "feature" | "other",
        })),
        worktrees: worktrees.map((w) => ({
          // Scope tokens are normalized worktree paths on the live origin.
          id: String(w.path ?? ""),
          path: String(w.path ?? ""),
          branch: String(w.head_ref ?? "").replace(/^refs\/heads\//, ""),
          has_vault: Boolean(w.has_vault),
          is_default: Boolean(w.is_main),
          degraded: Array.isArray(w.degraded) ? (w.degraded as string[]) : undefined,
        })),
      },
    ],
    tiers: (body.tiers ?? {}) as TiersBlock,
  };
}

/** Live status rollup → the internal status shape (no git block served). */
export function adaptStatus(body: unknown): EngineStatus {
  if (!isRec(body)) return body as EngineStatus;
  if ("nodes" in body && "degradations" in body) return body as unknown as EngineStatus;
  const tiers = (body.tiers ?? {}) as TiersBlock;
  const index = isRec(body.index) ? body.index : {};
  const backends = isRec(body.backends) ? body.backends : {};
  const rag = isRec(backends.rag) ? backends.rag : {};
  return {
    ok: Boolean(body.ok),
    nodes: Number(index.nodes ?? 0),
    edges: Number(index.edges ?? 0),
    degradations: Object.entries(tiers)
      .filter(([, state]) => state.available === false)
      .map(([tier]) => tier),
    tiers,
    core: { reachable: isRec(backends.core) },
    rag: { service: rag.available === true ? "running" : "stopped" },
    // git: not served by the live status — the now strip renders the
    // honest down state; flagged as a capability divergence.
  };
}

/** Live `{vocabulary: {...}}` → the internal filters vocabulary. */
export function adaptFilters(body: unknown): FiltersVocabulary {
  if (!isRec(body)) return body as FiltersVocabulary;
  if (!isRec(body.vocabulary)) return body as unknown as FiltersVocabulary;
  const v = body.vocabulary;
  const list = (key: string): string[] =>
    Array.isArray(v[key]) ? (v[key] as string[]) : [];
  return {
    relations: list("relations"),
    tiers: list("tiers"),
    // The live vocabulary does not enumerate doc types or date bounds yet;
    // empty stays honest (the facet rows hide on empty vocabularies).
    doc_types: list("doc_types"),
    feature_tags: list("feature_tags"),
    kinds: list("kinds"),
    tiers_block: (body.tiers ?? undefined) as TiersBlock | undefined,
  };
}

/** Stem-suffix doc-type derivation (matches the vault naming convention). */
export function docTypeFromStem(stem: string): string {
  if (/-W\d+-P\d+-S\d+$|-P\d+-S\d+$|-S\d+$|-summary$/.test(stem)) return "exec";
  const match = /-(research|adr|plan|exec|audit|reference)$/.exec(stem);
  if (match) return match[1];
  if (/\.index$/.test(stem)) return "index";
  return "document";
}

/** Live stem/node_id tree entries → the internal path-bearing entries. */
export function adaptVaultTree(body: unknown): VaultTreeResponse {
  if (!isRec(body) || !Array.isArray(body.entries)) {
    return body as VaultTreeResponse;
  }
  const entries = (body.entries as Rec[]).map((entry) => {
    if (typeof entry.path === "string") return entry as never;
    const stem = String(entry.stem ?? "");
    const docType = docTypeFromStem(stem);
    return {
      path: `.vault/${docType === "document" ? "doc" : docType}/${stem}.md`,
      doc_type: docType,
      feature_tags: Array.isArray(entry.feature_tags)
        ? (entry.feature_tags as string[])
        : [],
      dates: {},
    };
  });
  return { entries, tiers: (body.tiers ?? {}) as TiersBlock };
}
