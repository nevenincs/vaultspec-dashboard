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
// the conflict check, and the active recording session — lives in the stores
// view-deriver (settingsControls.ts) and the pure platform registry. All
// primitives compose the centralized kit (design-system-is-centralized).

import { useCallback } from "react";

import { Button, Kbd, SectionLabel } from "../../kit";
import {
  clearKeybindingOverride,
  deriveSettingsKeybindingControlView,
  keybindingConflictLabels,
  nextKeybindingOverrides,
  serializeKeybindingOverrides,
  toggleSettingsKeybindingRecording,
  useSettingsKeybindingRecorder,
} from "../../../stores/view/settingsControls";
import type { ControlProps } from "./types";

export function KeybindingControl({ value, onChange, disabled, id }: ControlProps) {
  const view = deriveSettingsKeybindingControlView(value);

  const commit = useCallback(
    (next: ReturnType<typeof nextKeybindingOverrides>) => {
      onChange(serializeKeybindingOverrides(next));
    },
    [onChange],
  );
  const recordingId = useSettingsKeybindingRecorder({
    overrides: view.overrides,
    commit,
  });

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
                : keybindingConflictLabels(view.overrides, row.id, row.chord);
              return (
                <li key={row.id} className="flex items-center justify-between gap-fg-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-body text-ink">{row.label}</span>
                    {conflicts.length > 0 && (
                      <span role="alert" className="text-caption text-diff-remove">
                        Conflicts with {conflicts.join(", ")}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-fg-1">
                    <Button
                      variant={recording ? "primary" : "secondary"}
                      disabled={disabled}
                      aria-label={`Record shortcut for ${row.label}`}
                      onClick={() => toggleSettingsKeybindingRecording(row.id)}
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
