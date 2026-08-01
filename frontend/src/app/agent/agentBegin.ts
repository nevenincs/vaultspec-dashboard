// The begin/continue posture of the Agent panel (agent-panel-shell-integration D2,
// research G1/G2/G4/G8/G11). Pure — the render tests drive it directly, and the
// panel body reads it to decide whether the composer centers under a headline or
// docks to the bottom of a transcript.
//
// G8 in one line: centered means "begin" (there is nothing to continue), bottom-
// docked means "continue". The posture is therefore a question about CONTENT, not
// about which view is selected: a session that exists but has no turns yet is still
// a beginning, and a live team run is a conversation even with no single-agent
// session behind it.
//
// Layer law: no wire, no React, no stores — plain functions over already-read state.

import type { MessageDescriptor } from "../../platform/localization/message";

export type AgentComposerPosture = "begin" | "continue";

export interface AgentPostureInput {
  /** The current single-agent session id, or null when none is current. */
  sessionId: string | null;
  /** Whether that session has any recorded turns. A fresh session with none is
   *  still a beginning — the user has not said anything yet. */
  hasTurns: boolean;
  /** The team run bound to the panel for the ACTIVE scope, or null. A team run is
   *  a conversation in progress even with no single-agent session. */
  teamRunId: string | null;
  /** True while the session snapshot is still loading or has faulted. An unknown
   *  transcript must not flash the begin idiom and then replace it — an honest
   *  unknown continues, so the composer keeps its docked position. */
  transcriptUnsettled?: boolean;
}

export function agentComposerPosture({
  sessionId,
  hasTurns,
  teamRunId,
  transcriptUnsettled = false,
}: AgentPostureInput): AgentComposerPosture {
  if (teamRunId !== null) return "continue";
  if (sessionId === null) return "begin";
  if (transcriptUnsettled) return "continue";
  return hasTurns ? "continue" : "begin";
}

/** The begin headline, personalized from the bound scope (G2 — the surface asks the
 *  user something and names the real context where it has any). With no resolved
 *  scope there is no context to name, so the unbound wording is used rather than an
 *  invented or empty workspace name. */
export function agentBeginHeadlineDescriptor(
  scopeName: string | null,
): MessageDescriptor<
  "common:agent.begin.headline" | "common:agent.begin.headlineUnbound"
> {
  return scopeName === null || scopeName.length === 0
    ? { key: "common:agent.begin.headlineUnbound" }
    : { key: "common:agent.begin.headline", values: { workspace: scopeName } };
}

/** One starter affordance: a user VERB (G4 — intent, never a feature name) that
 *  seeds the composer with a prompt opening rather than running anything. */
export interface AgentStarter {
  id: string;
  label: MessageDescriptor;
  /** The draft text the starter puts in the composer, ready to continue typing. */
  seed: MessageDescriptor;
}

/** The bounded starter set, in intent order. Deliberately small: starters are a
 *  cold-start scaffold, not a menu. */
export const AGENT_STARTERS: readonly AgentStarter[] = Object.freeze([
  Object.freeze({
    id: "explore",
    label: { key: "common:agent.begin.starters.explore" } as const,
    seed: { key: "common:agent.begin.seeds.explore" } as const,
  }),
  Object.freeze({
    id: "build",
    label: { key: "common:agent.begin.starters.build" } as const,
    seed: { key: "common:agent.begin.seeds.build" } as const,
  }),
  Object.freeze({
    id: "review",
    label: { key: "common:agent.begin.starters.review" } as const,
    seed: { key: "common:agent.begin.seeds.review" } as const,
  }),
] satisfies readonly AgentStarter[]);

/** How many recent sessions the begin state lists (G11 — recents are memory, always
 *  subordinate; the list is short by design, never a homepage). */
export const AGENT_BEGIN_RECENTS_CAP = 5;

/** G4/G11: starters seed a cold start and YIELD to recents once history exists.
 *  Both are never shown at once — that would make the begin state a dashboard,
 *  which is the one thing G1 forbids. */
export function agentBeginShowsRecents(recentCount: number): boolean {
  return recentCount > 0;
}
