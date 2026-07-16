// A non-modal, docked, resizable Agent panel beside the work surface.
//
// It is
// mounted once in `AppShell` (like `CreateDocDialog`/`ControlPanels`) as a normal
// in-flow grid child, so the stage's `1fr` column reflows to make room and the
// panel never overlays or modal-blocks the editor. It does not re-parent the
// pinned canvas (it is a sibling region, not inside the dock).
//
// Layer ownership (architecture-boundaries): a DUMB app-chrome view. It renders
// the `stores/server/agent` slice (session list + one session snapshot) and emits
// intent through the `stores/view/agentPanel` local chrome store; it fetches
// nothing itself and reads no raw `tiers`. Run/session STATE is read from the
// session snapshot (there is no run-status route on this plane).
//
import { useState } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import {
  useAgentLifecycleSubscription,
  useSession,
  useSessionList,
} from "../../stores/server/agent";
import {
  closeAgentPanel,
  setAgentCurrentSession,
  useAgentCurrentSessionId,
  useAgentPanelOpen,
} from "../../stores/view/agentPanel";
import { useAgentPanelWidth } from "../../stores/view/shellLayout";
import { agentNewSessionAction } from "../../stores/view/agentActions";
import {
  Divider,
  DropdownButton,
  IconButton,
  Popover,
  SectionLabel,
  Skeleton,
  SkeletonRow,
  StateBlock,
} from "../kit";
import { ShellResizeHandle } from "../chrome/ShellResizeHandle";
import { Composer } from "./Composer";

const AGENT = {
  region: "common:agent.panel.region",
  sessionsMenu: "common:agent.panel.sessionsMenu",
  newSession: "common:agent.panel.newSession",
  recentSessions: "common:agent.panel.recentSessions",
  untitledSession: "common:agent.panel.untitledSession",
  close: "common:agent.panel.close",
  loading: "common:agent.transcript.loading",
  empty: "common:agent.transcript.empty",
  noSession: "common:agent.transcript.noSession",
  error: "common:agent.transcript.error",
} as const;

function AgentPanelHeader({ currentSessionId }: { currentSessionId: string | null }) {
  const resolveMessage = useLocalizedMessageResolver();
  const list = useSessionList({ cap: 20 });
  const session = useSession(currentSessionId);
  const [menuOpen, setMenuOpen] = useState(false);

  const untitled = resolveMessage({ key: AGENT.untitledSession }).message;
  const agentLabel = resolveMessage({ key: AGENT.region }).message;
  const newSessionLabel = resolveMessage({ key: AGENT.newSession }).message;
  const sessionsMenuLabel = resolveMessage({ key: AGENT.sessionsMenu }).message;
  const recentsLabel = resolveMessage({ key: AGENT.recentSessions }).message;

  const title = currentSessionId ? session.data?.session.title || untitled : agentLabel;

  // New session routes through the shared `agent:new-session` descriptor,
  // so the header control and the Cmd+K command are one seam. It clears to a blank
  // composer; the durable session is created by the composer on the first prompt.
  const onNewSession = () => {
    setMenuOpen(false);
    agentNewSessionAction().run?.();
  };

  const recents = list.data?.items ?? [];

  return (
    <header className="flex items-center gap-fg-2 border-b border-rule px-fg-2 py-fg-1-5">
      <div className="relative min-w-0 flex-1">
        <DropdownButton
          label={title}
          open={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          ariaLabel={sessionsMenuLabel}
        />
        {menuOpen && (
          <Popover
            open
            onDismiss={() => setMenuOpen(false)}
            role="menu"
            aria-label={sessionsMenuLabel}
            className="absolute left-0 top-full z-40 mt-fg-1 flex max-h-80 w-64 flex-col gap-fg-1 overflow-y-auto rounded-fg-md border border-rule bg-paper-raised p-fg-1 shadow-fg-popover"
          >
            <button
              type="button"
              role="menuitem"
              onClick={onNewSession}
              data-agent-new-session
              className="rounded-fg-sm px-fg-2 py-fg-1 text-left text-label text-ink transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-50"
            >
              {newSessionLabel}
            </button>
            {recents.length > 0 && (
              <>
                <Divider />
                <SectionLabel>{recentsLabel}</SectionLabel>
                {recents.map((item) => (
                  <button
                    key={item.session_id}
                    type="button"
                    role="menuitem"
                    aria-current={item.session_id === currentSessionId}
                    onClick={() => {
                      setAgentCurrentSession(item.session_id);
                      setMenuOpen(false);
                    }}
                    className="truncate rounded-fg-sm px-fg-2 py-fg-1 text-left text-meta text-ink-muted transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus aria-[current=true]:bg-paper-sunken aria-[current=true]:text-ink"
                  >
                    {item.title || untitled}
                  </button>
                ))}
              </>
            )}
          </Popover>
        )}
      </div>
      <IconButton
        label={resolveMessage({ key: AGENT.close }).message}
        onClick={closeAgentPanel}
      >
        <X size={16} aria-hidden />
      </IconButton>
    </header>
  );
}

function AgentTranscriptContainer({
  currentSessionId,
}: {
  currentSessionId: string | null;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const session = useSession(currentSessionId);

  let body: ReactNode;
  if (currentSessionId === null) {
    body = (
      <StateBlock
        mode="empty"
        message={resolveMessage({ key: AGENT.noSession }).message}
      />
    );
  } else if (session.isLoading) {
    body = (
      <Skeleton label={resolveMessage({ key: AGENT.loading }).message}>
        <SkeletonRow width="w-3/4" boxed />
        <SkeletonRow width="w-2/3" boxed />
      </Skeleton>
    );
  } else if (session.isError) {
    // getSession FAULTS (422) on an unknown/expired id — surface it honestly,
    // never a fabricated empty snapshot.
    body = (
      <StateBlock
        mode="degraded"
        message={resolveMessage({ key: AGENT.error }).message}
      />
    );
  } else if ((session.data?.turns.length ?? 0) === 0) {
    body = (
      <StateBlock mode="empty" message={resolveMessage({ key: AGENT.empty }).message} />
    );
  } else {
    body = (
      <ol className="flex flex-col gap-fg-2" data-agent-transcript-entries>
        {session.data!.turns.map((turn) => (
          <li key={turn.turn_id} className="flex flex-col gap-fg-1">
            <p className="rounded-fg-md bg-paper-sunken px-fg-2 py-fg-1-5 text-body text-ink">
              {turn.prompt_text}
            </p>
            {turn.summary && (
              <p className="px-fg-2 text-body text-ink-muted">{turn.summary}</p>
            )}
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto px-fg-2 py-fg-2"
      data-agent-transcript
      aria-live="polite"
    >
      {body}
    </div>
  );
}

/** The bottom composer slot hosts the multiline composer. */
function AgentComposerSlot() {
  return (
    <div className="border-t border-rule px-fg-2 py-fg-2" data-agent-composer-slot>
      <Composer />
    </div>
  );
}

/**
 * The docked Agent panel. Renders nothing when collapsed (its only trace is the
 * footer `AgentChip`). Open, it occupies its OWN explicit right-most grid track
 * (the shell frame's `agentPanelClassName` pins it to `col-start-4`), so the
 * stage's `1fr` reflows beside it — it never overlays or wraps to a new row. The
 * column width IS the grid track (from the canonical shell-layout store); the
 * shared `ShellResizeHandle` on the panel's left edge drives it.
 */
export function AgentPanel({ className }: { className: string }) {
  useAgentLifecycleSubscription();
  const open = useAgentPanelOpen();
  const width = useAgentPanelWidth();
  const currentSessionId = useAgentCurrentSessionId();
  const resolveMessage = useLocalizedMessageResolver();
  if (!open) return null;
  return (
    <aside
      className={className}
      data-agent-panel
      role="complementary"
      aria-label={resolveMessage({ key: AGENT.region }).message}
    >
      <ShellResizeHandle side="agent" axis="agent" current={width} />
      <AgentPanelHeader currentSessionId={currentSessionId} />
      <AgentTranscriptContainer currentSessionId={currentSessionId} />
      <AgentComposerSlot />
    </aside>
  );
}
