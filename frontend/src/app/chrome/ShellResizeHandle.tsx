// The shared shell resize separator (keyboard + pointer). Extracted from AppShell
// so the rail handles AND the graph/timeline split inside the graph panel use ONE
// implementation: it derives its label/orientation/placement from the shell-layout
// view and drives the pointer + keyboard resize through the shellLayout seam (no
// bespoke math per call site).

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import {
  deriveShellResizeHandleView,
  resizeShellPanelByKey,
  startShellResizePointerSession,
  type ShellResizeAxis,
  type ShellResizeHandleSide,
} from "../../stores/view/shellLayout";

export function ShellResizeHandle({
  side,
  axis,
  current,
}: {
  /** Which edge of the panel the handle sits on (placement + label). */
  side: ShellResizeHandleSide;
  /** Which shell dimension this handle resizes. */
  axis: ShellResizeAxis;
  /** The current size of the resized panel (pixel basis for the drag/keys). */
  current: number;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const view = deriveShellResizeHandleView(side);
  if (view === null) return null;
  const label = resolveMessage(view.label);
  if (label.usedFallback) return null;
  return (
    <div
      aria-label={label.message}
      aria-orientation={view.orientation}
      className={view.className}
      role="separator"
      tabIndex={0}
      onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        startShellResizePointerSession({
          axis,
          startSize: current,
          startClientX: event.clientX,
          startClientY: event.clientY,
          target: event.currentTarget.ownerDocument,
        });
      }}
      onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) =>
        resizeShellPanelByKey({
          axis,
          current,
          key: event.key,
          preventDefault: () => event.preventDefault(),
        })
      }
    />
  );
}
