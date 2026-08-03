// The closed vocabulary a REFUSED run is classified by, plus the tolerant reader
// that admits it from the wire.
//
// A run can be refused for reasons a person can act on: no route to the model,
// the model over capacity, a rejected credential, rate limiting, a spent
// allowance, no credit left, a self-imposed ceiling, a malformed request. That
// classification is the ONLY thing a surface may branch on. The human account
// served beside it is opaque prose and has been observed naming a retry step
// while the classification correctly named the refusal, so any presentation
// keyed off the prose would offer the wrong remedy.
//
// The list is closed and shared with the a2a plane. `unknown` is a full member —
// the floor a refusal falls to when nothing recorded a classification — and it
// carries its own presentation rather than reading as absence.

export const PROVIDER_CONDITIONS = [
  "network_unreachable",
  "provider_overloaded",
  "unauthenticated",
  "throttled",
  "usage_exhausted",
  "credits_exhausted",
  "budget_exhausted",
  "invalid_request",
  "unknown",
] as const;

export type ProviderCondition = (typeof PROVIDER_CONDITIONS)[number];

const MEMBERS: ReadonlySet<string> = new Set<string>(PROVIDER_CONDITIONS);

function isMember(value: string): value is ProviderCondition {
  return MEMBERS.has(value);
}

/** Read one served classification. This parses a network response, so the closed
 *  list cannot be assumed: absence stays absence, while anything PRESENT that the
 *  list does not contain degrades to the `unknown` member. Neither dropping it
 *  nor forwarding a served value a reader has no presentation for is honest. */
export function adaptProviderCondition(raw: unknown): ProviderCondition | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  return typeof raw === "string" && isMember(raw) ? raw : "unknown";
}
