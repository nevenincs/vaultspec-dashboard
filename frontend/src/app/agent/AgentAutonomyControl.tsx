// The composer-adjacent autonomy control (review-surface-flow F2, landed; moved out
// of `AgentPanel` by agent-panel-shell-integration D3 so the composer can host it in
// its row-2 LEFT slot — the "what the agent is allowed to touch" side of the law).
//
// It lives in its own module because both `Composer` and the panel body would
// otherwise have to import each other. Fed exactly as before: the SERVED worktree
// mode (scope-level GET /v1/mode when the queue is empty, a proposal's policy when
// not) plus the mode-set seam, rendering only when a mode is observable — never a
// fabricated selection.
//
// S45 — it presents as a PILL, not a labelled block. Row 2 is a row of pills, and
// the reference anatomy agrees: both products surveyed for C6 render the approval
// mode as a compact pill beside the model selector (Claude's "Skip", ChatGPT's
// "Full access"). The labelled vertical stack was never the reference shape, and at
// panel width it overlapped the row's right-hand cluster outright — so the pill is a
// correctness fix as much as a consistency one.
//
// The expanded two-option control is unchanged and simply moves into the pill's
// popover, so the served refusal feedback and the busy lockout still come from the
// one `AutonomyControl` the review station also hosts. The standing C7 warning
// banner is untouched: elevated autonomy still announces itself outside this pill.

import { useRef, useState } from "react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import { authoredDisplayText } from "../../platform/localization/displayText";
import {
  useReviewStationView,
  useSetOperationMode,
} from "../../stores/server/authoring";
import type { OperationMode } from "../../stores/server/authoring/wireTypes";
import { AutonomyControl } from "../authoring/ReviewStation";
import { DropdownButton, Popover } from "../kit";

const MSG = {
  selectorName: "common:agent.autonomy.label",
  reviewEach: "common:agent.autonomy.reviewEach",
  applyAutomatically: "common:agent.autonomy.applyAutomatically",
  menuAria: "common:agent.autonomy.menuAria",
  selectorValue: "common:agent.composer.selectorValue",
} as const;

/** The catalog key naming a served mode, or null for a mode the toggle does not
 *  offer (`assisted`). A mode we cannot name is rendered verbatim rather than mapped
 *  onto one of the two we can — the pill must never claim a posture the worktree is
 *  not actually in. */
export function autonomyModeMessageKey(
  mode: OperationMode,
): typeof MSG.reviewEach | typeof MSG.applyAutomatically | null {
  if (mode === "manual") return MSG.reviewEach;
  if (mode === "autonomous") return MSG.applyAutomatically;
  return null;
}

export function AgentAutonomyControl() {
  const resolveMessage = useLocalizedMessageResolver();
  const view = useReviewStationView();
  const setMode = useSetOperationMode();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const mode = view.operationMode;
  if (mode === null) return null;

  const selector = resolveMessage({ key: MSG.selectorName }).message;
  const valueKey = autonomyModeMessageKey(mode);
  const value =
    valueKey === null
      ? authoredDisplayText(mode)
      : resolveMessage({ key: valueKey }).message;
  const pill = resolveMessage({
    key: MSG.selectorValue,
    values: { selector, value },
  }).message;
  const menuAria = resolveMessage({ key: MSG.menuAria });

  return (
    <div className="relative" data-agent-autonomy data-autonomy-mode={mode}>
      <span ref={triggerRef} data-agent-autonomy-trigger>
        <DropdownButton
          label={pill}
          open={open}
          onClick={() => setOpen((current) => !current)}
          ariaLabel={pill}
        />
      </span>
      {open && !menuAria.usedFallback && (
        <Popover
          open
          onDismiss={() => setOpen(false)}
          returnFocusRef={triggerRef}
          ignoreSelector="[data-agent-autonomy-trigger]"
          role="dialog"
          aria-label={menuAria.message}
          data-agent-autonomy-menu
          className="absolute bottom-full left-0 z-40 mb-fg-1 min-w-64 rounded-fg-md border border-rule bg-paper-raised p-fg-2 shadow-fg-popover"
        >
          <AutonomyControl mode={mode} onSelect={(next) => setMode.mutateAsync(next)} />
        </Popover>
      )}
    </div>
  );
}
