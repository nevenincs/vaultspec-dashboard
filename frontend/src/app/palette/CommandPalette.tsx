// The command palette (W03.P11.S43, ADR G2.a / G5.c): Ctrl/Cmd-K, the
// universal verb surface and the cheap escape hatch that keeps the chrome
// minimal. Fronts navigation (features by name), lenses (apply and save),
// and the whitelisted ops verbs — all on committed primitives; nothing
// here exists only in the palette.

import { useEffect, useMemo, useRef, useState } from "react";

import { useConfirmable } from "../../platform/dispatch/useAction";
import { useFiltersVocabulary } from "../../stores/server/queries";
import { BUILTIN_LENSES, useLensStore } from "../../stores/view/lenses";
import { selectNode } from "../../stores/view/selection";
import { useViewStore } from "../../stores/view/viewStore";
import { OPS_WHITELIST } from "../right/OpsPanel";
import { dispatchOps } from "../right/opsActions";
import { useActiveScope } from "../stage/Stage";

// --- pure command assembly (unit-tested) --------------------------------------------

export interface PaletteCommand {
  id: string;
  label: string;
  hint: string;
  run: () => void;
  /** Destructive verbs arm on first Enter, run on the second. */
  confirm?: boolean;
}

export interface PaletteSources {
  featureTags: readonly string[];
  lensNames: readonly string[];
  query: string;
  applyLens: (name: string) => void;
  saveLens: (name: string) => void;
  runOp: (target: "core" | "rag", verb: string) => void;
  navigate: (nodeId: string) => void;
}

export function buildCommands(sources: PaletteSources): PaletteCommand[] {
  const commands: PaletteCommand[] = [];
  for (const feature of sources.featureTags) {
    commands.push({
      id: `nav:${feature}`,
      label: `go to ${feature}`,
      hint: "navigate",
      run: () => sources.navigate(`feature:${feature}`),
    });
  }
  for (const name of sources.lensNames) {
    commands.push({
      id: `lens:${name}`,
      label: `lens: ${name}`,
      hint: "filters",
      run: () => sources.applyLens(name),
    });
  }
  for (const { target, verb, label } of OPS_WHITELIST) {
    commands.push({
      id: `ops:${target}:${verb}`,
      label: `ops: ${label}`,
      hint: target,
      confirm: true,
      run: () => sources.runOp(target, verb),
    });
  }
  const trimmed = sources.query.trim();
  if (trimmed.length > 0) {
    commands.push({
      id: `save-lens:${trimmed}`,
      label: `save current filters as lens "${trimmed}"`,
      hint: "filters",
      run: () => sources.saveLens(trimmed),
    });
  }
  return commands;
}

export function filterCommands(
  commands: readonly PaletteCommand[],
  query: string,
): PaletteCommand[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...commands];
  return commands.filter((c) => c.label.toLowerCase().includes(needle));
}

// --- the palette -----------------------------------------------------------------------

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  // Platform confirm guard for ops commands (W03.P04.S08 consolidation):
  // replaces the bespoke `armed: string | null` state. A single slot keyed
  // on "ops:run" is correct because only one cursor position can be active;
  // armedCommandId tracks which specific command is in confirm-mode for the
  // label display so navigating away re-arms the new command cleanly.
  const confirmable = useConfirmable<void>("ops:run");
  const [armedCommandId, setArmedCommandId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Focus restore (038): the palette returns focus to wherever the user
  // was when it opened.
  const previousFocus = useRef<HTMLElement | null>(null);
  const scope = useActiveScope();
  const vocabulary = useFiltersVocabulary(scope);
  // Select the stable slice and compose builtins memoized: a selector
  // returning a fresh array per snapshot loops useSyncExternalStore
  // (caught by the 032 interactive test).
  const saved = useLensStore((s) => s.saved);
  const lenses = useMemo(() => [...BUILTIN_LENSES, ...saved], [saved]);
  const timeTravel = useViewStore((s) => s.timelineMode.kind === "time-travel");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery("");
        setCursor(0);
        confirmable.cancel();
        setArmedCommandId(null);
      } else if (e.key === "Escape") {
        confirmable.cancel();
        setArmedCommandId(null);
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      previousFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      inputRef.current?.focus();
    } else {
      previousFocus.current?.focus();
      previousFocus.current = null;
    }
  }, [open]);

  const commands = useMemo(() => {
    const all = buildCommands({
      featureTags: vocabulary.data?.feature_tags ?? [],
      lensNames: lenses.map((l) => l.name),
      query,
      applyLens: (name) => useLensStore.getState().apply(name),
      saveLens: (name) => useLensStore.getState().saveCurrent(name),
      // Route through the platform dispatch seam (W03.P04.S08): dispatchOps
      // replaces the prior ad-hoc engineClient call (the seam bypass).
      runOp: (target, verb) => {
        void dispatchOps({ target, verb });
      },
      navigate: (nodeId) => selectNode(nodeId),
    });
    // Ops verbs disappear in time-travel (the G4.b gate applies everywhere).
    const gated = timeTravel ? all.filter((c) => !c.id.startsWith("ops:")) : all;
    return filterCommands(gated, query);
  }, [vocabulary.data, lenses, query, timeTravel]);

  if (!open) return null;

  const runAt = (index: number) => {
    const command = commands[index];
    if (!command) return;
    if (command.confirm) {
      if (!confirmable.armed || armedCommandId !== command.id) {
        // Arm (or re-arm after navigating to a different confirm command).
        if (confirmable.armed) confirmable.cancel();
        setArmedCommandId(command.id);
        confirmable.trigger();
        return;
      }
      // Second Enter on the same armed command: fire and reset.
      confirmable.cancel();
      setArmedCommandId(null);
    }
    command.run();
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/20 pt-24 animate-fade-in"
      role="dialog"
      aria-label="command palette"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-[28rem] overflow-hidden rounded-vs-lg border border-rule bg-paper-raised shadow-deep animate-slide-in-down"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // Focus trap (038): the modal owns Tab while open; arrows walk
          // the list, Escape closes (window handler), focus stays inside.
          if (e.key === "Tab") {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
            confirmable.cancel();
            setArmedCommandId(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(commands.length - 1, c + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            } else if (e.key === "Enter") {
              runAt(cursor);
            }
          }}
          placeholder="type a command, feature, or lens…"
          className="w-full border-b border-rule bg-transparent px-vs-4 py-vs-2 text-body text-ink outline-none placeholder:text-ink-faint"
        />
        <ul className="max-h-72 overflow-y-auto py-vs-1 text-body">
          {commands.length === 0 && (
            <li className="px-vs-4 py-vs-2 text-ink-faint">nothing matches</li>
          )}
          {commands.map((command, i) => (
            <li key={command.id}>
              <button
                type="button"
                onClick={() => runAt(i)}
                className={`flex w-full items-center justify-between rounded-vs-sm px-vs-4 py-vs-1-5 text-left transition-colors duration-ui-fast ease-settle ${
                  i === cursor
                    ? "bg-paper-sunken text-ink"
                    : "text-ink-muted hover:bg-paper-sunken hover:text-ink"
                }`}
              >
                <span>
                  {confirmable.armed && armedCommandId === command.id
                    ? `confirm: ${command.label}?`
                    : command.label}
                </span>
                <span className="text-label text-ink-faint">{command.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
