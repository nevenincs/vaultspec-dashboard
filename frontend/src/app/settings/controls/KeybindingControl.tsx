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
import type {
  KeybindingGroupPresentation,
  KeybindingPresentation,
} from "../../../platform/keymap/registry";
import {
  type LocalizedMessageResolver,
  useLocalizedMessageResolver,
} from "../../../platform/localization/LocalizationProvider";
import {
  clearKeybindingOverride,
  deriveSettingsKeybindingControlView,
  keybindingConflictPresentations,
  nextKeybindingOverrides,
  serializeKeybindingOverrides,
  toggleSettingsKeybindingRecording,
  useSettingsKeybindingRecorder,
} from "../../../stores/view/settingsControls";
import type { ControlProps } from "./types";

function resolveKeybindingPresentation(
  presentation: KeybindingPresentation | KeybindingGroupPresentation,
  resolveMessage: LocalizedMessageResolver,
): string {
  return typeof presentation === "string"
    ? presentation
    : resolveMessage(presentation).message;
}

function keycapIdentity(actionId: string, index: number): string {
  return `${actionId}:keycap:${index}`;
}

function recorderButtonVariant(recording: boolean): "primary" | "secondary" {
  return recording ? "primary" : "secondary";
}

export function KeybindingControl({ value, onChange, disabled, id }: ControlProps) {
  const view = deriveSettingsKeybindingControlView(value);
  const resolveMessage = useLocalizedMessageResolver();

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
      <p id={id} className="text-body text-ink-muted">
        {resolveMessage({ key: "common:shortcutSettings.empty" }).message}
      </p>
    );
  }

  return (
    <div id={id} className="flex flex-col gap-fg-4">
      {view.groups.map((group) => {
        const groupLabel = resolveKeybindingPresentation(group.label, resolveMessage);
        return (
          <section key={group.id} className="flex flex-col gap-fg-1">
            <SectionLabel>{groupLabel}</SectionLabel>
            <ul className="flex flex-col gap-fg-0-5">
              {group.rows.map((row) => {
                const rowLabel = resolveKeybindingPresentation(
                  row.label,
                  resolveMessage,
                );
                const recording = recordingId === row.id;
                const conflicts = recording
                  ? []
                  : keybindingConflictPresentations(view.overrides, row.id, row.chord);
                return (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-fg-2"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-body text-ink">{rowLabel}</span>
                      {conflicts.map((conflict) => {
                        const action = resolveKeybindingPresentation(
                          conflict.label,
                          resolveMessage,
                        );
                        return (
                          <span
                            key={conflict.id}
                            role="alert"
                            className="text-caption text-diff-remove"
                          >
                            {
                              resolveMessage({
                                key: "common:shortcutSettings.conflict",
                                values: { action },
                              }).message
                            }
                          </span>
                        );
                      })}
                    </div>
                    <div className="flex shrink-0 items-center gap-fg-1">
                      <Button
                        variant={recorderButtonVariant(recording)}
                        disabled={disabled}
                        aria-label={
                          resolveMessage({
                            key: "common:accessibility.recordShortcut",
                            values: { action: rowLabel },
                          }).message
                        }
                        onClick={() => toggleSettingsKeybindingRecording(row.id)}
                      >
                        {recording ? (
                          resolveMessage({
                            key: "common:shortcutSettings.recording",
                          }).message
                        ) : (
                          <span className="flex items-center gap-fg-0-5">
                            {row.keycaps.map((cap, index) => (
                              <Kbd key={keycapIdentity(row.id, index)}>{cap}</Kbd>
                            ))}
                          </span>
                        )}
                      </Button>
                      {row.overridden && (
                        <Button
                          variant="ghost"
                          disabled={disabled}
                          aria-label={
                            resolveMessage({
                              key: "common:accessibility.resetShortcut",
                              values: { action: rowLabel },
                            }).message
                          }
                          onClick={() =>
                            commit(clearKeybindingOverride(view.overrides, row.id))
                          }
                        >
                          {resolveMessage({ key: "common:actions.reset" }).message}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
