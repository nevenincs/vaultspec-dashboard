// The keybinding settings control — a chord recorder catalog
// (keyboard-action-system W02.P06). It renders the registry's bindable command
// actions (`listKeybindings()`) grouped by `group`; each row shows the action
// label, its effective chord as keycaps, a recorder button that captures the next
// keystroke, and a reset-to-default affordance. Recording a chord canonicalizes it
// and writes back the SPARSE override map (an entry equal to the default is
// dropped) through `onChange(JSON.stringify(map))`, exactly the JSON object string
// the engine `keybindings` setting persists.
//
// Layer ownership (dashboard-layer-ownership): app-chrome only. Every piece of
// keymap logic — grouping, effective-chord resolution, the sparse-map mutation,
// the conflict check — lives in the stores view-deriver (settingsControls.ts) and
// the pure platform registry; this component is thin glue plus the recording DOM
// state. All primitives compose the centralized kit (design-system-is-centralized).

import { useCallback, useEffect, useState } from "react";

import { Button, Kbd, SectionLabel } from "../../kit";
import {
  clearKeybindingOverride,
  deriveSettingsKeybindingControlView,
  keybindingConflictIds,
  nextKeybindingOverrides,
  serializeKeybindingOverrides,
} from "../../../stores/view/settingsControls";
import { getKeybinding } from "../../../platform/keymap/registry";
import type { ControlProps } from "./types";

/** Modifier-only DOM keys that never finish a chord on their own. */
const MODIFIER_KEYS = new Set(["Control", "Meta", "Alt", "Shift", "AltGraph", "OS"]);

/** Build a raw chord string from a keyboard event's modifiers + key, in the
 *  canonical token order the parser accepts. Meta maps to `Mod`, Control to
 *  `Ctrl`; the caller canonicalizes. Returns null for a modifier-only press. */
function chordStringFromEvent(event: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null;
  const tokens: string[] = [];
  if (event.metaKey) tokens.push("Mod");
  if (event.ctrlKey) tokens.push("Ctrl");
  if (event.altKey) tokens.push("Alt");
  if (event.shiftKey) tokens.push("Shift");
  tokens.push(event.key);
  return tokens.join("+");
}

export function KeybindingControl({ value, onChange, disabled, id }: ControlProps) {
  const view = deriveSettingsKeybindingControlView(value);
  const [recordingId, setRecordingId] = useState<string | null>(null);

  const commit = useCallback(
    (next: ReturnType<typeof nextKeybindingOverrides>) => {
      onChange(serializeKeybindingOverrides(next));
    },
    [onChange],
  );

  useEffect(() => {
    if (recordingId === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setRecordingId(null);
        return;
      }
      const raw = chordStringFromEvent(event);
      if (raw === null) return; // wait for a non-modifier key
      event.preventDefault();
      const next = nextKeybindingOverrides(view.overrides, recordingId, raw);
      commit(next);
      setRecordingId(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recordingId, view.overrides, commit]);

  if (view.empty) {
    return (
      <p id={id} className="text-body text-ink-faint">
        No keyboard shortcuts are registered yet.
      </p>
    );
  }

  return (
    <div id={id} className="flex flex-col gap-fg-4">
      {view.groups.map((group) => (
        <section key={group.name} className="flex flex-col gap-fg-1">
          <SectionLabel>{group.name}</SectionLabel>
          <ul className="flex flex-col gap-fg-0-5">
            {group.rows.map((row) => {
              const recording = recordingId === row.id;
              const conflicts = recording
                ? []
                : keybindingConflictIds(view.overrides, row.id, row.chord).filter(
                    (cid) => cid !== row.id,
                  );
              return (
                <li key={row.id} className="flex items-center justify-between gap-fg-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-body text-ink">{row.label}</span>
                    {conflicts.length > 0 && (
                      <span role="alert" className="text-caption text-diff-remove">
                        Conflicts with {conflicts.map(labelFor).join(", ")}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-fg-1">
                    <Button
                      variant={recording ? "primary" : "secondary"}
                      disabled={disabled}
                      aria-label={`Record shortcut for ${row.label}`}
                      onClick={() =>
                        setRecordingId((cur) => (cur === row.id ? null : row.id))
                      }
                    >
                      {recording ? (
                        "Press a key…"
                      ) : (
                        <span className="flex items-center gap-fg-0-5">
                          {row.keycaps.map((cap, i) => (
                            <Kbd key={`${cap}-${i}`}>{cap}</Kbd>
                          ))}
                        </span>
                      )}
                    </Button>
                    {row.overridden && (
                      <Button
                        variant="ghost"
                        disabled={disabled}
                        aria-label={`Reset ${row.label} to default`}
                        onClick={() =>
                          commit(clearKeybindingOverride(view.overrides, row.id))
                        }
                      >
                        Reset
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** The human label for a conflicting action id, falling back to the raw id. */
function labelFor(actionId: string): string {
  return getKeybinding(actionId)?.label ?? actionId;
}
