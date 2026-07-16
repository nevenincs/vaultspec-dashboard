import { useCallback, useState } from "react";

import { useLocalizedMessageResolver } from "../platform/localization/LocalizationProvider";
import type { AnyMessageDescriptor } from "../platform/localization/message";
import type { AppearanceParams } from "../scene/three/appearance";
import {
  APPEARANCE_CONTROLS,
  APPEARANCE_CONTROL_DEFAULTS,
  APPEARANCE_CONTROL_GROUPS,
  type AppearanceControl,
} from "../scene/three/appearanceControls";
import type { ThreeField } from "../scene/three/threeField";
import {
  APPEARANCE_CONTROL_SECTION_MESSAGES,
  LAB_GRAPH_CONTROL_MESSAGES,
  LAB_GRAPH_CONTROL_OPTION_MESSAGES,
  THREE_LAB_MESSAGES,
  type LabGraphControlOption,
} from "../stores/view/threeLabVocabulary";

interface AppearanceControlsPanelProps {
  params: AppearanceParams;
  onParamChange: <Key extends keyof AppearanceParams>(
    key: Key,
    value: AppearanceParams[Key],
  ) => void;
  onReset: () => void;
}

export function AppearanceControlsPanel({
  params,
  onParamChange,
  onReset,
}: AppearanceControlsPanelProps) {
  const resolveMessageResult = useLocalizedMessageResolver();
  const resolveMessage = useCallback(
    (descriptor: AnyMessageDescriptor) => resolveMessageResult(descriptor).message,
    [resolveMessageResult],
  );
  const [open, setOpen] = useState(true);

  const renderControl = (control: AppearanceControl) => {
    const messages = LAB_GRAPH_CONTROL_MESSAGES[control.controlId];
    const label = resolveMessage(messages.label);
    const description = resolveMessage(messages.description);

    if (control.kind === "boolean") {
      return (
        <label
          key={control.key}
          title={description}
          style={{ display: "flex", gap: 6, margin: "6px 0" }}
        >
          <input
            type="checkbox"
            checked={params[control.key] as boolean}
            onChange={(event) => onParamChange(control.key, event.target.checked)}
          />
          <span>{label}</span>
        </label>
      );
    }

    if (control.kind === "enum") {
      return (
        <label
          key={control.key}
          title={description}
          style={{ display: "flex", alignItems: "center", gap: 6, margin: "4px 0" }}
        >
          <span style={{ flex: 1 }}>{label}</span>
          <select
            value={params[control.key] as string}
            onChange={(event) =>
              onParamChange(
                control.key,
                event.target.value as AppearanceParams[typeof control.key],
              )
            }
            style={{ font: "inherit" }}
          >
            {control.options.map((option) => (
              <option key={option.value} value={option.value}>
                {resolveMessage(
                  LAB_GRAPH_CONTROL_OPTION_MESSAGES[
                    option.value as LabGraphControlOption
                  ],
                )}
              </option>
            ))}
          </select>
        </label>
      );
    }

    const value = params[control.key] as number;
    return (
      <div key={control.key} title={description} style={{ margin: "4px 0" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ flex: 1 }}>{label}</span>
          <input
            type="number"
            value={value}
            min={control.min}
            max={control.max}
            step={control.step}
            onChange={(event) => onParamChange(control.key, Number(event.target.value))}
            style={{ width: 60, font: "inherit", textAlign: "right" }}
          />
        </label>
        <input
          aria-label={label}
          type="range"
          min={control.min}
          max={control.max}
          step={control.step}
          value={value}
          onChange={(event) => onParamChange(control.key, Number(event.target.value))}
          style={{ width: "100%", marginTop: 1 }}
        />
      </div>
    );
  };

  return (
    <section
      aria-label={resolveMessage(THREE_LAB_MESSAGES.accessibility.appearancePanel)}
      style={{
        position: "absolute",
        top: 46,
        left: 8,
        width: 236,
        maxHeight: "calc(100% - 54px)",
        display: "flex",
        flexDirection: "column",
        background: "rgba(253, 250, 246, 0.95)",
        border: "1px solid var(--color-border, #ddd)",
        borderRadius: 8,
        boxShadow: "0 6px 20px rgba(0, 0, 0, 0.14)",
        font: "12px system-ui, sans-serif",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 8px",
          borderBottom: open ? "1px solid var(--color-border, #eee)" : "none",
        }}
      >
        <button
          onClick={() => setOpen((current) => !current)}
          title={resolveMessage(
            open
              ? THREE_LAB_MESSAGES.actions.collapse
              : THREE_LAB_MESSAGES.actions.expand,
          )}
          style={{ border: "none", background: "none", cursor: "pointer", padding: 0 }}
        >
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRight: "1px solid currentColor",
              borderBottom: "1px solid currentColor",
              transform: open ? "rotate(45deg)" : "rotate(-45deg)",
            }}
          />
        </button>
        <strong style={{ flex: 1 }}>
          {resolveMessage(THREE_LAB_MESSAGES.panels.appearance)}
        </strong>
        <button onClick={onReset}>
          {resolveMessage(THREE_LAB_MESSAGES.actions.reset)}
        </button>
      </header>
      {open && (
        <div style={{ overflowY: "auto", padding: "2px 8px 8px" }}>
          {APPEARANCE_CONTROL_GROUPS.map((group) => (
            <div key={group}>
              <div
                style={{
                  margin: "8px 0 1px",
                  fontSize: 10,
                  letterSpacing: 0.6,
                  opacity: 0.55,
                }}
              >
                {resolveMessage(APPEARANCE_CONTROL_SECTION_MESSAGES[group])}
              </div>
              {APPEARANCE_CONTROLS.filter((control) => control.group === group).map(
                renderControl,
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function AppearancePanel({ getField }: { getField: () => ThreeField | null }) {
  const [params, setParams] = useState<AppearanceParams>({
    ...APPEARANCE_CONTROL_DEFAULTS,
  });
  const onParamChange = useCallback(
    <Key extends keyof AppearanceParams>(key: Key, value: AppearanceParams[Key]) => {
      setParams((previous) => ({ ...previous, [key]: value }));
      getField()?.setAppearanceParams({ [key]: value });
    },
    [getField],
  );
  const onReset = useCallback(() => {
    const defaults = { ...APPEARANCE_CONTROL_DEFAULTS };
    setParams(defaults);
    getField()?.setAppearanceParams(defaults);
  }, [getField]);

  return (
    <AppearanceControlsPanel
      params={params}
      onParamChange={onParamChange}
      onReset={onReset}
    />
  );
}
