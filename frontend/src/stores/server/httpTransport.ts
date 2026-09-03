import { EngineError, type TiersBlock } from "./engine/tiers";
import { isRec, unwrapEnvelope } from "./liveAdapters/internal";

/** The narrow fetch shape shared by stores-owned wire clients. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** The per-principal authoring credential the server resolves from the request
 * header; the command envelope deliberately carries no actor identity. */
export const AUTHORING_ACTOR_TOKEN_HEADER = "x-authoring-actor-token";

/** Read the engine-injected browser bearer without coupling clients to a peer. */
export function machineBearerToken(): string | null {
  if (typeof document === "undefined") return null;
  return (
    document.querySelector('meta[name="vaultspec-token"]')?.getAttribute("content") ??
    null
  );
}

/**
 * Add the injected machine bearer only when the caller has not supplied an
 * authorization header. Client-specific actor credentials stay at the caller.
 */
export function machineBearerFetch(
  readBearer: () => string | null,
  fetchImpl: FetchLike = fetch,
): FetchLike {
  return (input, init) => {
    const bearer = readBearer();
    if (!bearer) return fetchImpl(input, init);
    const headers = new Headers(init?.headers);
    if (!headers.has("authorization")) {
      headers.set("Authorization", `Bearer ${bearer}`);
    }
    return fetchImpl(input, { ...init, headers });
  };
}

/**
 * Layer an authoring actor credential onto an existing transport without
 * replacing caller-supplied Authorization. An absent actor leaves the injected
 * transport untouched, so principal-permissive reads retain their current wire
 * behavior.
 */
export function authoringActorFetch(
  fetchImpl: FetchLike,
  actorToken?: string,
): FetchLike {
  return (input, init) => {
    if (!actorToken) return fetchImpl(input, init);
    const headers = new Headers(init?.headers);
    headers.set(AUTHORING_ACTOR_TOKEN_HEADER, actorToken);
    return fetchImpl(input, { ...init, headers });
  };
}

/**
 * Preserve a served error envelope exactly where every stores client turns a
 * non-success response into an `EngineError`. Non-JSON faults remain typed by
 * status but have no invented body or degradation data.
 */
export async function engineErrorFromResponse(
  path: string,
  response: Response,
): Promise<EngineError> {
  let body: unknown;
  let tiers: TiersBlock | undefined;
  try {
    body = unwrapEnvelope(await response.json());
    if (isRec(body) && isRec(body.tiers)) {
      tiers = body.tiers as TiersBlock;
    }
  } catch {
    // A gateway or proxy can return a non-JSON error response.
  }
  return new EngineError(path, response.status, { tiers, body });
}
