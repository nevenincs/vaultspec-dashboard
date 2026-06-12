// The command palette (W03.P11.S43, ADR G2.a / G5.c): Ctrl/Cmd-K, the
// universal verb surface and the cheap escape hatch that keeps the chrome
// minimal. Fronts navigation (features by name), lenses (apply and save),
// and the whitelisted ops verbs — all on committed primitives; nothing
// here exists only in the palette.

import { useEffect, useMemo, useRef, useState } from "react";

import { engineClient } from "../../stores/server/engine";
import { useFiltersVocabulary } from "../../stores/server/queries";
import { useLensStore } from "../../stores/view/lenses";
import { selectNode } from "../../stores/view/selection";
import { useViewStore } from "../../stores/view/viewStore";
import { OPS_WHITELIST } from "../right/OpsPanel";
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
  const [armed, setArmed] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scope = useActiveScope();
  const vocabulary = useFiltersVocabulary(scope);
  const lenses = useLensStore((s) => s.all());
  const timeTravel = useViewStore((s) => s.timelineMode.kind === "time-travel");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery("");
        setCursor(0);
        setArmed(null);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const commands = useMemo(() => {
    const all = buildCommands({
      featureTags: vocabulary.data?.feature_tags ?? [],
      lensNames: lenses.map((l) => l.name),
      query,
      applyLens: (name) => useLensStore.getState().apply(name),
      saveLens: (name) => useLensStore.getState().saveCurrent(name),
      runOp: (target, verb) => {
        void (target === "core"
          ? engineClient.opsCore(verb)
          : engineClient.opsRag(verb));
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
    if (command.confirm && armed !== command.id) {
      setArmed(command.id);
      return;
    }
    command.run();
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-stone-900/20 pt-24"
      role="dialog"
      aria-label="command palette"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-[28rem] rounded-lg border border-stone-300 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
            setArmed(null);
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
          className="w-full border-b border-stone-200 px-3 py-2 text-sm outline-none"
        />
        <ul className="max-h-72 overflow-y-auto p-1 text-xs">
          {commands.length === 0 && (
            <li className="px-2 py-1 text-stone-400">nothing matches</li>
          )}
          {commands.map((command, i) => (
            <li key={command.id}>
              <button
                type="button"
                onClick={() => runAt(i)}
                className={`flex w-full items-center justify-between rounded px-2 py-1 text-left ${
                  i === cursor ? "bg-stone-100" : ""
                }`}
              >
                <span>
                  {armed === command.id ? `confirm: ${command.label}?` : command.label}
                </span>
                <span className="text-stone-400">{command.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
