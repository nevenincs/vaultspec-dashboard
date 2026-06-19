// The one global keymap dispatcher (keyboard-action-system ADR, decisions 1, 4).
//
// Exactly one window `keydown` listener owns Class-A command shortcuts. It
// replaces the three duplicated form-target guards and the scattered global key
// listeners (the palette opener, the `?` toggle, the arrow/bracket navigation)
// with one resolution path: normalize the event to a chord, resolve it against
// the keybinding registry in the currently active contexts, apply the
// cross-cutting gates (text-entry, time-travel), and fire the resolved
// `ActionDescriptor` through its existing run/dispatch lane.
//
// Layer: stores consumer of the platform keymap registry and the appDispatcher
// seam. The pure `handleKeymapEvent` takes its dependencies injected so it is
// unit-tested without a real window; the `useKeymapDispatcher` hook wires the
// production deps and owns the single listener.

import { useEffect } from "react";

import type { ActionDescriptor } from "../../platform/actions/action";
import { fireActionDescriptor, isRunnable } from "../../platform/actions/action";
import { type ChordEvent, defaultIsMac, parseChord } from "../../platform/keymap/chord";
import {
  type BindingContext,
  type KeybindingDef,
  type KeybindingOverrides,
  SURFACE_CONTEXTS,
  effectiveChord,
  listKeybindings,
  resolveKeybinding,
} from "../../platform/keymap/registry";

// --- action resolver registry ------------------------------------------------
//
// The registry maps a chord to an action id; this maps an id to the LIVE
// `ActionDescriptor` (which depends on store state). Surfaces register a thunk
// alongside their bindings during enrollment; until then resolution returns null
// and the inert dispatcher fires nothing.

const keyActions = new Map<string, () => ActionDescriptor | null>();

/** Register the live-descriptor resolver for an action id; returns a disposer. */
export function registerKeyAction(
  id: string,
  resolver: () => ActionDescriptor | null,
): () => void {
  keyActions.set(id, resolver);
  return () => {
    if (keyActions.get(id) === resolver) keyActions.delete(id);
  };
}

/** Resolve an action id to its live descriptor, or null when none is registered. */
export function resolveKeyAction(id: string): ActionDescriptor | null {
  return keyActions.get(id)?.() ?? null;
}

/** Test-only: drop all registered action resolvers. */
export function resetKeyActions(): void {
  keyActions.clear();
}

// --- cross-cutting helpers ---------------------------------------------------

/** Whether the target is a text-entry surface where unmodified keys are typing. */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement))
    return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

/**
 * The contexts active for a focused element: always `global`, plus the surface
 * named by the nearest `[data-keymap-context]` ancestor. Surfaces declare their
 * region with that attribute so context detection never reaches into their
 * internals.
 */
export function activeContextsFromElement(el: Element | null): Set<BindingContext> {
  const set = new Set<BindingContext>(["global"]);
  const host = el?.closest?.("[data-keymap-context]") ?? null;
  const ctx = host?.getAttribute("data-keymap-context") ?? null;
  if (ctx !== null && (SURFACE_CONTEXTS as readonly string[]).includes(ctx)) {
    set.add(ctx as BindingContext);
  }
  return set;
}

/** Fire a resolved descriptor through its existing lane (dispatch seam or run). */
export function fireKeyAction(action: ActionDescriptor): void {
  fireActionDescriptor(action);
}

// --- the pure handler --------------------------------------------------------

/** Injected dependencies for the keymap handler (production-wired by the hook). */
export interface KeymapDeps {
  getDefs: () => readonly KeybindingDef[];
  getOverrides: () => KeybindingOverrides;
  getActiveContexts: () => ReadonlySet<BindingContext>;
  isTextEntry: (target: EventTarget | null) => boolean;
  isTimeTravel: () => boolean;
  resolveAction: (id: string) => ActionDescriptor | null;
  fire: (action: ActionDescriptor) => void;
  isMac?: boolean;
}

/**
 * Resolve and fire the action a key event is bound to. Returns true when an
 * action fired (and the event was consumed). The gates, in order:
 *  - resolve the bound def in the active contexts; bail when unbound;
 *  - text-entry gate: while focus is in an input, only chords with a non-shift
 *    modifier (Mod/Ctrl/Alt) fire - an unmodified chord is the user typing;
 *  - the action must exist and be runnable;
 *  - time-travel gate: a mutating action marked `disabledInTimeTravel` is inert
 *    in historical mode (the same central gate the resolver registry applies).
 */
export function handleKeymapEvent(
  event:
    | KeyboardEvent
    | (ChordEvent & { target: EventTarget | null; preventDefault?: () => void }),
  deps: KeymapDeps,
): boolean {
  const def = resolveKeybinding(
    deps.getDefs(),
    deps.getOverrides(),
    deps.getActiveContexts(),
    event,
    deps.isMac,
  );
  if (def === null) return false;

  if (deps.isTextEntry(event.target)) {
    // While focus is in a text field, only a chord carrying a non-Shift modifier
    // (Mod/Ctrl/Alt) fires. Shift alone is excluded on purpose: Shift+letter is
    // capitalizing, and an UNMODIFIED named key (ArrowLeft, Enter, Home, Tab) is
    // a meaningful editing key in an input - so named keys are intentionally NOT
    // exempted here, even though they are "non-printable", or a global ArrowLeft
    // binding would hijack the caret. The chord is re-parsed (cheap; only on a
    // matched keystroke) because resolveKeybinding does not surface it.
    const chord = parseChord(effectiveChord(def, deps.getOverrides()));
    const modified = chord !== null && (chord.mod || chord.ctrl || chord.alt);
    if (!modified) return false;
  }

  const action = deps.resolveAction(def.id);
  if (action === null || !isRunnable(action)) return false;
  if (deps.isTimeTravel() && action.disabledInTimeTravel === true) return false;

  event.preventDefault?.();
  deps.fire(action);
  return true;
}

// --- production mount --------------------------------------------------------

/** Overridable readers wired by later waves (overrides + time-travel truth). */
let overridesReader: () => KeybindingOverrides = () => ({});
let timeTravelReader: () => boolean = () => false;

/** W02 wires the persisted-override selector here; defaults to no overrides. */
export function setKeymapOverridesReader(reader: () => KeybindingOverrides): void {
  overridesReader = reader;
}

/**
 * The current live override map, read through whatever reader W02 wired (defaults
 * to `{}` until the stores binding mounts). The synchronous read the keyboard-
 * shortcut legend uses to render effective chords — the same truth the dispatcher
 * resolves against, so the legend can never drift from what actually fires.
 */
export function getKeymapOverrides(): KeybindingOverrides {
  return overridesReader();
}

/** Enrollment wires the time-travel truth here; defaults to never-historical. */
export function setKeymapTimeTravelReader(reader: () => boolean): void {
  timeTravelReader = reader;
}

/** The production dependency bundle for the single global listener. */
export function productionKeymapDeps(): KeymapDeps {
  return {
    getDefs: listKeybindings,
    getOverrides: () => overridesReader(),
    getActiveContexts: () =>
      activeContextsFromElement(
        typeof document === "undefined" ? null : document.activeElement,
      ),
    isTextEntry: isTextEntryTarget,
    isTimeTravel: () => timeTravelReader(),
    resolveAction: resolveKeyAction,
    fire: fireKeyAction,
    isMac: defaultIsMac(),
  };
}

/**
 * Mount the one global keymap listener for the app's lifetime. Inert until
 * surfaces register bindings + action resolvers, so it is safe to mount before
 * enrollment converges the old handlers onto it.
 */
export function useKeymapDispatcher(): void {
  useEffect(() => {
    const deps = productionKeymapDeps();
    const onKey = (event: KeyboardEvent) => {
      handleKeymapEvent(event, deps);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
