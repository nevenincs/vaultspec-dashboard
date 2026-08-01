// The ONE transcript kit (agent-panel-shell-integration D4; owner notes
// msatvw0t/msatwk38): the shared turn primitives BOTH transcripts render, so the
// single-agent and team conversations cannot drift apart again. TeamRunTranscript's
// accepted visual style is the baseline; the speaker cue is C1's — the user turn is
// a right-aligned accent bubble, the agent side is full-width open text — and it is
// identical in both because it is authored once, here.
//
// Layer ownership: dumb presentational parts. No wire, no stores — text in,
// markup out.

import { authoredDisplayText } from "../../platform/localization/displayText";

/** A small agent-attribution eyebrow (`mock-planner` → "Mock Planner"). Genuine
 *  metadata, so it stays at the meta tier. Renders nothing for a team-scoped
 *  entry that carries no agent id, and for the single-agent plane (no id). */
export function AgentTag({ agentId }: { agentId?: string }) {
  if (agentId === undefined || agentId.length === 0) return null;
  return (
    <span className="shrink-0 text-meta tracking-[0.025rem] text-ink-faint">
      {authoredDisplayText(agentId)}
    </span>
  );
}

/** C1: the USER turn — a right-aligned accent bubble at the body tier. The
 *  bubble-vs-open-text contrast plus alignment is the ONLY speaker cue; there
 *  are no name labels. One treatment for both transcripts. */
export function UserTurnBubble({ text }: { text: string }) {
  if (text.length === 0) return null;
  return (
    <div className="flex justify-end" data-transcript-prompt>
      <p className="max-w-[85%] whitespace-pre-wrap rounded-fg-md bg-accent/12 px-fg-3 py-fg-2 text-body text-ink">
        {text}
      </p>
    </div>
  );
}

/** C1: the AGENT side — full-width, unbubbled, open text at the body tier, with
 *  the optional per-agent attribution eyebrow (team runs name their agents;
 *  the single-agent plane passes none). */
export function AgentMessageBlock({
  agentId,
  text,
  data,
}: {
  agentId?: string;
  text: string;
  /** The consumer's own data-attribute value (kept so existing hooks/tests keep
   *  their handles: `data-team-message` for the team plane, `data-transcript-assistant`
   *  for the single-agent plane). */
  data?: { attribute: string; value?: string };
}) {
  if (text.length === 0) return null;
  const dataProps = data === undefined ? {} : { [data.attribute]: data.value ?? "" };
  return (
    <div className="flex flex-col gap-fg-1" {...dataProps}>
      <AgentTag {...(agentId === undefined ? {} : { agentId })} />
      <p className="whitespace-pre-wrap text-body text-ink">{text}</p>
    </div>
  );
}
