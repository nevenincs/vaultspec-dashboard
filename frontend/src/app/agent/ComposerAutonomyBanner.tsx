// The elevated-autonomy warning banner (research C7; agent-panel-shell-integration
// D3). When the SERVED operation mode is `autonomous`, the agent applies changes
// without asking — a standing fact the user should not have to remember, so it
// renders as a warning-tinted strip directly above the composer.
//
// Three rules it must keep, all of them from C7 and the non-modal law:
//   - standing, not transient: it is a property of the current mode, not an event,
//     so it does not time out and it does not live in a toast lane;
//   - dismissible, but only for THIS mode session: dismissing hides the strip while
//     the mode stays autonomous, and a return to autonomous later re-arms it, so a
//     dismissal can never permanently silence the one warning that matters;
//   - never modal: it never blocks the prompt (G10).
//
// Layer ownership: dumb app chrome over the SERVED mode. It reads the review-station
// projection's `operationMode` — the same served value the AutonomyControl renders —
// and never infers autonomy from anything else.

import { useEffect, useState } from "react";
import { TriangleAlert, X } from "lucide-react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import type { OperationMode } from "../../stores/server/authoring";
import { useReviewStationView } from "../../stores/server/authoring";

const MSG = {
  warning: "common:agent.autonomyBanner.warning",
  dismiss: "common:agent.autonomyBanner.dismiss",
} as const;

/** Whether the banner belongs above the composer for a SERVED mode. Only the
 *  autonomous mode elevates: `manual` asks every time, and an unrecognized or
 *  absent mode is not a licence to warn about something we cannot name. Pure so
 *  the presence rules are driven directly by test. */
export function autonomyBannerVisible(
  mode: OperationMode | null,
  dismissed: boolean,
): boolean {
  return mode === "autonomous" && !dismissed;
}

/** The banner. Renders nothing unless the served mode is autonomous. */
export function ComposerAutonomyBanner() {
  const resolveMessage = useLocalizedMessageResolver();
  const view = useReviewStationView();
  const mode = view.operationMode;
  const [dismissed, setDismissed] = useState(false);

  // Re-arm on every LEAVE of autonomous, so switching back to apply-automatically
  // later shows the warning again. A dismissal is scoped to the elevation it was
  // shown for — never a permanent opt-out of the product's loudest safety notice.
  useEffect(() => {
    if (mode !== "autonomous") setDismissed(false);
  }, [mode]);

  const warning = resolveMessage({ key: MSG.warning });
  const dismiss = resolveMessage({ key: MSG.dismiss });
  if (!autonomyBannerVisible(mode, dismissed)) return null;
  if (warning.usedFallback || dismiss.usedFallback) return null;

  return (
    <div
      role="status"
      data-composer-autonomy-banner
      className="flex items-start gap-fg-1-5 rounded-fg-md border border-state-stale/40 bg-state-stale/10 px-fg-2 py-fg-1-5 text-meta text-ink"
    >
      <TriangleAlert size={14} aria-hidden className="mt-fg-0-5 shrink-0" />
      <span className="min-w-0 flex-1">{warning.message}</span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label={dismiss.message}
        data-composer-autonomy-dismiss
        className="inline-flex shrink-0 rounded-fg-xs text-ink-faint transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
      >
        <X size={12} aria-hidden />
      </button>
    </div>
  );
}
