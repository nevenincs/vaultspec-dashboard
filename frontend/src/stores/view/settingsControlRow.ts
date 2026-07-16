import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageDescriptor } from "../../platform/localization/message";

import { useSettingsRowWriteIntent } from "../server/settingsRowIntent";
import {
  defaultSettingsEditTarget,
  effectiveSettingsEditTarget,
  isSettingsEditTarget,
  normalizeSettingsScope,
  normalizeSettingsEditTarget,
  type EffectiveSetting,
  type SettingsEditTarget,
  settingCanTargetScope,
  settingsControlIsDefaulted,
  settingsControlValue,
  settingsProvenanceNote,
} from "../server/settingsSelectors";
import {
  normalizeSettingsControlDraftValue,
  useSettingsControlDraft,
} from "./settingsControlDraft";

export type { SettingsEditTarget };

export interface SettingsEditTargetOption {
  id: SettingsEditTarget;
  label: MessageDescriptor;
}

export const SETTINGS_EDIT_TARGET_OPTIONS: readonly SettingsEditTargetOption[] = [
  { id: "global", label: { key: "common:finalWave.settings.global" } },
  { id: "scope", label: { key: "common:finalWave.settings.scope" } },
];

export { isSettingsEditTarget, normalizeSettingsEditTarget };

export interface SettingsEditTargetOptionRow extends SettingsEditTargetOption {
  checked: boolean;
  className: string;
}

export interface SettingsEditTargetToggleView {
  rootClassName: string;
  rows: SettingsEditTargetOptionRow[];
}

export function deriveSettingsEditTargetToggleView(
  target: SettingsEditTarget,
): SettingsEditTargetToggleView {
  return {
    rootClassName: "flex gap-fg-0-5 text-caption",
    rows: SETTINGS_EDIT_TARGET_OPTIONS.map((option) => {
      const checked = target === option.id;
      return {
        ...option,
        checked,
        className: `rounded-fg-xs px-fg-1 py-fg-0-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
          checked
            ? "font-medium text-accent-text"
            : "text-ink-faint hover:text-ink-muted"
        }`,
      };
    }),
  };
}

export interface SettingsRowStaticView {
  def: EffectiveSetting["def"];
  fieldId: string;
  scopeable: boolean;
  effectiveTarget: SettingsEditTarget;
  controlValue: string;
  controlMaxLength: number | undefined;
  continuous: boolean;
  isDefaulted: boolean;
  provenanceNote: string;
  canMatchGlobal: boolean;
  canResetDefault: boolean;
  matchGlobalValue: string;
  defaultValue: string;
  resetAction: SettingsRowResetAction | null;
  rootClassName: string;
  headerClassName: string;
  labelClassName: string;
  titleClassName: string;
  descriptionClassName: string;
  controlStackClassName: string;
  footerClassName: string;
  provenanceClassName: string;
  resetButtonClassName: string | null;
  errorClassName: string;
}

export interface SettingsRowResetAction {
  kind: "match-global" | "reset-default";
  label: MessageDescriptor;
  value: string;
}

export interface SettingsRowController extends SettingsRowStaticView {
  target: SettingsEditTarget;
  setTarget: (target: unknown) => void;
  shownValue: string;
  onControlChange: (next: unknown) => void;
  commit: (next: unknown) => void;
  error: string | null;
}

/**
 * Pure settings row read model. The dialog row renders this shape instead of
 * re-deriving target scopeability, inherited control values, provenance copy, or
 * reset affordance state in app chrome.
 */
export function deriveSettingsRowStaticView(
  eff: EffectiveSetting,
  activeScope: unknown,
  target: SettingsEditTarget,
): SettingsRowStaticView {
  const effectiveTarget = effectiveSettingsEditTarget(eff, activeScope, target);
  const controlValue = settingsControlValue(eff, effectiveTarget);
  const isDefaulted = settingsControlIsDefaulted(eff, effectiveTarget);
  const canMatchGlobal = effectiveTarget === "scope" && eff.scopeValue !== undefined;
  const canResetDefault = effectiveTarget === "global" && !isDefaulted;
  const matchGlobalValue = eff.globalValue ?? eff.def.default;
  const defaultValue = eff.def.default;
  const resetAction: SettingsRowResetAction | null = canMatchGlobal
    ? {
        kind: "match-global",
        label: { key: "common:finalWave.settings.matchGlobal" },
        value: matchGlobalValue,
      }
    : canResetDefault
      ? {
          kind: "reset-default",
          label: { key: "common:finalWave.settings.resetDefault" },
          value: defaultValue,
        }
      : null;
  const resetButtonClassName =
    resetAction === null
      ? null
      : `text-caption underline-offset-2 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
          resetAction.kind === "match-global"
            ? "text-accent-text"
            : "text-ink-faint hover:text-ink-muted"
        }`;
  return {
    def: eff.def,
    fieldId: `setting-${eff.def.key}`,
    scopeable: settingCanTargetScope(eff, activeScope),
    effectiveTarget,
    controlValue,
    controlMaxLength:
      eff.def.value_type.type === "string" ? eff.def.value_type.max_len : undefined,
    continuous: eff.def.control === "slider" || eff.def.control === "text",
    isDefaulted,
    provenanceNote: settingsProvenanceNote(eff, effectiveTarget),
    canMatchGlobal,
    canResetDefault,
    matchGlobalValue,
    defaultValue,
    resetAction,
    rootClassName: "flex flex-col gap-fg-1",
    headerClassName: "flex items-start justify-between gap-fg-3",
    labelClassName: "min-w-0 flex-1",
    titleClassName: "block text-body text-ink",
    descriptionClassName: "mt-fg-0-5 block text-label text-ink-faint",
    controlStackClassName: "flex shrink-0 flex-col items-end gap-fg-1",
    footerClassName: "flex items-center justify-between gap-fg-2",
    provenanceClassName: "text-caption text-ink-faint",
    resetButtonClassName,
    errorClassName: "text-caption text-diff-remove",
  };
}

export function normalizeSettingsRowCommitValue(
  value: unknown,
  view: Pick<SettingsRowStaticView, "controlMaxLength">,
): string {
  return normalizeSettingsControlDraftValue(value, view.controlMaxLength);
}

/**
 * Settings row controller seam. It owns the row-local target, continuous-control
 * draft, and typed error lifecycle so SettingsDialog remains a schema-rendering
 * surface; server write payloads stay behind the settings row intent.
 */
export function useSettingsRowController(
  eff: EffectiveSetting,
  activeScope: unknown,
): SettingsRowController {
  const normalizedActiveScope = normalizeSettingsScope(activeScope);
  const writeIntent = useSettingsRowWriteIntent();
  const [error, setError] = useState<string | null>(null);
  const errorEpoch = useRef(0);
  const defaultTarget = defaultSettingsEditTarget(eff);
  const [target, setRawTarget] = useState<SettingsEditTarget>(defaultTarget);
  const view = deriveSettingsRowStaticView(eff, normalizedActiveScope, target);
  const settingKey = view.def.key;
  const effectiveTarget = view.effectiveTarget;
  const controlMaxLength = view.controlMaxLength;

  const setTarget = useCallback((nextTarget: unknown) => {
    const normalizedTarget = normalizeSettingsEditTarget(nextTarget);
    if (normalizedTarget === null) return;
    setRawTarget(normalizedTarget);
  }, []);

  const commit = useCallback(
    (next: unknown) => {
      const normalizedValue = normalizeSettingsRowCommitValue(next, {
        controlMaxLength,
      });
      const epoch = errorEpoch.current + 1;
      errorEpoch.current = epoch;
      setError(null);
      writeIntent.write(
        {
          key: settingKey,
          value: normalizedValue,
          target: effectiveTarget,
          activeScope: normalizedActiveScope,
        },
        {
          onError: (message) => {
            if (epoch !== errorEpoch.current) return;
            setError(message);
          },
        },
      );
    },
    [controlMaxLength, effectiveTarget, normalizedActiveScope, settingKey, writeIntent],
  );

  const settingsDraft = useSettingsControlDraft({
    controlValue: view.controlValue,
    continuous: view.continuous,
    maxLength: view.controlMaxLength,
    commit,
    onCancelPending: () => {
      setError(null);
    },
  });
  const {
    value: shownValue,
    change: onControlChange,
    clearPending: clearSettingsDraftPending,
  } = settingsDraft;

  useEffect(() => {
    errorEpoch.current += 1;
    clearSettingsDraftPending();
    setError(null);
    setRawTarget(defaultTarget);
  }, [normalizedActiveScope, clearSettingsDraftPending, defaultTarget, eff.def.key]);

  useEffect(() => {
    errorEpoch.current += 1;
    clearSettingsDraftPending();
    setError(null);
  }, [clearSettingsDraftPending, view.effectiveTarget]);

  return {
    ...view,
    target,
    setTarget,
    shownValue,
    onControlChange,
    commit,
    error,
  };
}
