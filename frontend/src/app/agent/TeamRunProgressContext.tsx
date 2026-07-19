import { createContext, useContext, type ReactNode } from "react";

import { useRunProgress, type RunProgress } from "../../stores/server/agent/a2aTeam";

const EMPTY_PROGRESS: RunProgress = {
  frames: [],
  degraded: false,
  terminal: false,
};

const TeamRunProgressContext = createContext<RunProgress>(EMPTY_PROGRESS);

/** One coordinator owns relay/status recovery for the panel's current run. */
export function TeamRunProgressProvider({
  runId,
  children,
}: {
  runId: string | null;
  children: ReactNode;
}) {
  const progress = useRunProgress(runId);
  return (
    <TeamRunProgressContext.Provider value={progress}>
      {children}
    </TeamRunProgressContext.Provider>
  );
}

export function useTeamRunProgress(): RunProgress {
  return useContext(TeamRunProgressContext);
}
