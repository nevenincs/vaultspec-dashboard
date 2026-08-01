import { createContext, useContext, type ReactNode } from "react";

import { useRunProgress, type RunProgress } from "../../stores/server/agent/a2aTeam";

const EMPTY_PROGRESS: RunProgress = {
  frames: [],
  degraded: false,
  terminal: false,
};

/** The run-progress context. `TeamRunProgressProvider` is the normal path — it owns
 *  the relay/status reads. The raw context is exported so a host that has ALREADY
 *  derived a progress value can supply it directly, which is also what lets the
 *  transcript's cross-transition coverage drive a parked-then-resumed run without a
 *  second wire client. */
export const TeamRunProgressContext = createContext<RunProgress>(EMPTY_PROGRESS);

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
