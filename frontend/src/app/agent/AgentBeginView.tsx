// The begin idiom (agent-panel-shell-integration D2; research G1/G2/G4/G8/G11).
// With nothing to continue, the Agent panel's content IS the composer: a centered
// card under a headline that asks the user something and names the workspace the
// run will bind to, with starter verbs beneath it that yield to recents once any
// history exists.
//
// The headline names the SAME scope the wire already fences runs against
// (`expected_scope`), which is the point: the research found scope bound
// rigorously on the wire but invisibly at the input. Nothing here invents a
// workspace name — with no resolved scope it says so rather than guessing.
//
// Layer ownership: dumb app chrome. The scope comes from the served active scope,
// recents from the shipped session list; this file starts nothing and fetches
// nothing of its own. The composer it centers is the SAME `Composer` the continue
// posture bottom-docks — one composer, two placements, never a second build.

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import { deriveScopeShortName } from "../../stores/view/tabs";
import { useActiveScope } from "../../stores/server/queries";
import { useSessionList } from "../../stores/server/agent";
import { setAgentCurrentSession } from "../../stores/view/agentPanel";
import {
  AGENT_BEGIN_RECENTS_CAP,
  AGENT_STARTERS,
  agentBeginHeadlineDescriptor,
  agentBeginShowsRecents,
} from "./agentBegin";
import { Composer } from "./Composer";

const MSG = {
  starters: "common:agent.begin.startersLabel",
  recents: "common:agent.begin.recentsLabel",
  untitled: "common:agent.panel.untitledSession",
} as const;

/** The starter verbs (G4). Selecting one seeds the composer draft through the
 *  shared composer-draft seam; it never starts a run by itself — the user still
 *  writes and sends, because a starter is a scaffold, not a command. */
function AgentStarters({ onSeed }: { onSeed: (seed: string) => void }) {
  const resolveMessage = useLocalizedMessageResolver();
  const label = resolveMessage({ key: MSG.starters });
  if (label.usedFallback) return null;
  const starters = AGENT_STARTERS.map((starter) => ({
    id: starter.id,
    label: resolveMessage(starter.label),
    seed: resolveMessage(starter.seed),
  })).filter((starter) => !starter.label.usedFallback && !starter.seed.usedFallback);
  if (starters.length === 0) return null;
  return (
    <ul
      className="flex flex-wrap justify-center gap-fg-1-5"
      aria-label={label.message}
      data-agent-begin-starters
    >
      {starters.map((starter) => (
        <li key={starter.id}>
          <button
            type="button"
            onClick={() => onSeed(starter.seed.message)}
            data-agent-starter={starter.id}
            className="rounded-fg-pill border border-rule bg-paper-sunken px-fg-3 py-fg-1 text-label text-ink-muted transition-colors duration-ui-fast hover:bg-paper-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            {starter.label.message}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Recents (G11): memory, always subordinate to starting something new. Fed by the
 *  shipped session list — no new wire. Selecting one binds it as the current
 *  session, which flips the panel out of the begin posture on its own. */
function AgentRecents({
  items,
}: {
  items: readonly { session_id: string; title: string }[];
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const label = resolveMessage({ key: MSG.recents });
  const untitled = resolveMessage({ key: MSG.untitled });
  if (label.usedFallback || untitled.usedFallback) return null;
  return (
    <div className="flex flex-col items-center gap-fg-1" data-agent-begin-recents>
      <ul className="flex w-full flex-col gap-fg-0-5" aria-label={label.message}>
        {items.slice(0, AGENT_BEGIN_RECENTS_CAP).map((item) => (
          <li key={item.session_id}>
            <button
              type="button"
              onClick={() => setAgentCurrentSession(item.session_id)}
              data-agent-recent={item.session_id}
              className="w-full truncate rounded-fg-sm px-fg-2 py-fg-1 text-left text-meta text-ink-muted transition-colors duration-ui-fast hover:bg-paper-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
            >
              {item.title || untitled.message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The begin state. Vertically centered so the composer is the first thing the eye
 * and the first keystroke land on (G1), with the headline directly above it and
 * either starters or recents directly below.
 */
export function AgentBeginView({ onSeed }: { onSeed: (seed: string) => void }) {
  const resolveMessage = useLocalizedMessageResolver();
  const scope = useActiveScope();
  const list = useSessionList({ cap: AGENT_BEGIN_RECENTS_CAP });
  const recents = list.data?.items ?? [];
  const headline = resolveMessage(
    agentBeginHeadlineDescriptor(scope === null ? null : deriveScopeShortName(scope)),
  );
  return (
    <div
      className="flex min-h-0 flex-1 flex-col justify-center gap-fg-3 overflow-y-auto px-fg-3 py-fg-3"
      data-agent-begin
    >
      {!headline.usedFallback && (
        <h2
          className="text-center text-title text-ink"
          data-agent-begin-headline
          title={scope ?? undefined}
        >
          {headline.message}
        </h2>
      )}
      {/* The one composer, centered. The continue posture docks this same component
          at the panel bottom — placement encodes posture, nothing else differs. */}
      <div data-agent-composer-slot>
        <Composer />
      </div>
      {agentBeginShowsRecents(recents.length) ? (
        <AgentRecents items={recents} />
      ) : (
        <AgentStarters onSeed={onSeed} />
      )}
    </div>
  );
}
