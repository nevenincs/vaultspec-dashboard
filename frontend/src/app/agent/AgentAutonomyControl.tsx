// The composer-adjacent autonomy control (review-surface-flow F2, landed; moved out
// of `AgentPanel` by agent-panel-shell-integration D3 so the composer can host it in
// its row-2 LEFT slot — the "what the agent is allowed to touch" side of the law).
//
// It lives in its own module because both `Composer` and the panel body would
// otherwise have to import each other. Fed exactly as before: the SERVED worktree
// mode (scope-level GET /v1/mode when the queue is empty, a proposal's policy when
// not) plus the mode-set seam, rendering only when a mode is observable — never a
// fabricated selection.

import {
  useReviewStationView,
  useSetOperationMode,
} from "../../stores/server/authoring";
import { AutonomyControl } from "../authoring/ReviewStation";

export function AgentAutonomyControl() {
  const view = useReviewStationView();
  const setMode = useSetOperationMode();
  if (view.operationMode === null) return null;
  return (
    <div data-agent-autonomy>
      <AutonomyControl
        mode={view.operationMode}
        onSelect={(mode) => setMode.mutateAsync(mode)}
      />
    </div>
  );
}
