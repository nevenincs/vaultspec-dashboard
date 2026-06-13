// React face of the dispatch seam (ADR D2). Components dispatch typed intents
// through the app-wide dispatcher so every intent is logged, traced, and
// guardable in one place. `useConfirmable` packages the arm-to-confirm flow -
// the right rail's ops pattern - as a reusable hook so surfaces stop
// reimplementing the two-click guard by hand.

import { useCallback, useState } from "react";

import type { Action, ActionMeta } from "./dispatch";
import { appConfirmGuard, appDispatcher, isArmedResult } from "./middleware";

/** The raw dispatch bound to the app dispatcher, stable across renders. */
export function useDispatch(): (action: Action) => unknown {
  return useCallback((action: Action) => appDispatcher.dispatch(action), []);
}

/**
 * A typed dispatcher for one action type: call it with the payload (and
 * optional meta) to fire the intent. A guarded type returns an ArmedResult on
 * the first call - prefer `useConfirmable` for that flow.
 */
export function useAction<P = void>(
  type: string,
): (payload?: P, meta?: ActionMeta) => unknown {
  return useCallback(
    (payload?: P, meta?: ActionMeta) => appDispatcher.dispatch({ type, payload, meta }),
    [type],
  );
}

export interface Confirmable<P> {
  /** True after the first (arming) trigger, false once it fires or resets. */
  armed: boolean;
  /** Fire the intent: first call arms, second call within the arm runs it. */
  trigger: (payload?: P) => void;
  /** Drop the armed state without firing (a cancel affordance). */
  cancel: () => void;
}

/**
 * Arm-to-confirm as a hook: the first `trigger()` arms (the effect does not
 * run and `armed` flips true), the second runs the effect (and `armed` flips
 * back). Generalizes the ops rail's two-step guard for any surface.
 */
export function useConfirmable<P = void>(type: string): Confirmable<P> {
  const [armed, setArmed] = useState(false);
  const trigger = useCallback(
    (payload?: P) => {
      const result = appDispatcher.dispatch({
        type,
        payload,
        meta: { guard: "confirm" },
      });
      setArmed(isArmedResult(result));
    },
    [type],
  );
  const cancel = useCallback(() => {
    appConfirmGuard.disarm(type);
    setArmed(false);
  }, [type]);
  return { armed, trigger, cancel };
}
