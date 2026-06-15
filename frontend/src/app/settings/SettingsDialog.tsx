// The schema-driven settings dialog (dashboard-settings W04.P08). Reads the
// engine-owned schema and the persisted values through the stores hooks (the
// sole wire client; this chrome never fetches), resolves effective values, and
// renders each declared setting through the control registry. Adding a setting
// is one engine registry entry — this surface renders it with no change here.
//
// Scope handling (the schema declares scope-eligibility): a global-only setting
// edits the global value; a scope-eligible setting offers a [Global | This
// scope] target so the active scope can override global, with an honest
// provenance note. Writes go through usePutSettings (cache-seed + invalidate);
// a typed rejection (the engine's error_kind) surfaces inline on the row.

import { useState } from "react";

import type { EngineError } from "../../stores/server/engine";
import {
  usePutSettings,
  useSettings,
  useSettingsSchema,
} from "../../stores/server/queries";
import type { EffectiveSetting } from "../../stores/server/settingsSelectors";
import { resolveSettings } from "../../stores/server/settingsSelectors";
import { useViewStore } from "../../stores/view/viewStore";
import { Dialog } from "../chrome/Dialog";
import { SettingControl } from "./controls/registry";
import { useSettingsDialog } from "./useSettingsDialog";

/** Where a setting-row edit is targeted. */
type EditTarget = "global" | "scope";

export function SettingsDialog() {
  const open = useSettingsDialog((s) => s.open);
  const close = useSettingsDialog((s) => s.closeDialog);
  const activeScope = useViewStore((s) => s.scope);

  const schemaQuery = useSettingsSchema();
  const settingsQuery = useSettings();

  const groups = resolveSettings(schemaQuery.data, settingsQuery.data, activeScope);

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Settings"
      description="Preferences are saved to this workspace. Some apply per scope."
    >
      <div className="px-vs-4 py-vs-3">
        {schemaQuery.isLoading && (
          <p className="py-vs-4 text-center text-label text-ink-faint">
            Loading settings…
          </p>
        )}
        {!schemaQuery.isLoading && groups.length === 0 && (
          <p className="py-vs-4 text-center text-label text-ink-faint">
            No settings are available.
          </p>
        )}
        {groups.map((group) => (
          <section key={group.name} className="mb-vs-4 last:mb-0">
            <h3 className="mb-vs-2 border-b border-rule pb-vs-1 text-2xs font-semibold uppercase tracking-wider text-ink-faint">
              {group.name}
            </h3>
            <div className="flex flex-col gap-vs-3">
              {group.settings.map((eff) => (
                <SettingRow key={eff.def.key} eff={eff} activeScope={activeScope} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </Dialog>
  );
}

interface SettingRowProps {
  eff: EffectiveSetting;
  activeScope: string | null;
}

function SettingRow({ eff, activeScope }: SettingRowProps) {
  const { def } = eff;
  const putSettings = usePutSettings();
  const [error, setError] = useState<string | null>(null);

  // A scope-eligible setting with an active scope can target either layer. The
  // default target follows where the value currently lives: a scope override if
  // one exists, else global. A global-only setting (or no active scope) is
  // always global.
  const scopeable = def.scope_eligible && activeScope !== null;
  const [target, setTarget] = useState<EditTarget>(
    eff.scopeValue !== undefined ? "scope" : "global",
  );
  const effectiveTarget: EditTarget = scopeable ? target : "global";

  // The value the control shows for the chosen target: the target's own
  // persisted value if any, otherwise the inherited effective value.
  const controlValue =
    effectiveTarget === "scope"
      ? (eff.scopeValue ?? eff.value)
      : (eff.globalValue ?? def.default);

  const write = (next: string) => {
    setError(null);
    putSettings.mutate(
      {
        key: def.key,
        value: next,
        scope: effectiveTarget === "scope" ? (activeScope ?? undefined) : undefined,
      },
      {
        onError: (e) => {
          const err = e as EngineError;
          setError(err.errorMessage ?? err.message);
        },
      },
    );
  };

  const fieldId = `setting-${def.key}`;
  const isDefaulted = controlValue === def.default;

  return (
    <div className="flex flex-col gap-vs-1">
      <div className="flex items-start justify-between gap-vs-3">
        <label htmlFor={fieldId} className="min-w-0 flex-1">
          <span className="block text-body text-ink">{def.label}</span>
          {def.description && (
            <span className="mt-vs-0-5 block text-label text-ink-faint">
              {def.description}
            </span>
          )}
        </label>
        <div className="flex shrink-0 flex-col items-end gap-vs-1">
          {/* Controls stay interactive during a write — discrete writes are fast
              and never disable mid-interaction (dashboard-settings review HIGH-2). */}
          <SettingControl def={def} value={controlValue} onChange={write} id={fieldId} />
          {scopeable && <ScopeTargetToggle target={target} onTarget={setTarget} />}
        </div>
      </div>

      {/* Provenance + an honest reset/clear affordance, beneath the row. */}
      <div className="flex items-center justify-between gap-vs-2">
        <span className="text-2xs text-ink-faint">
          {provenanceNote(eff, effectiveTarget)}
        </span>
        {effectiveTarget === "scope" && eff.scopeValue !== undefined ? (
          // Clear an existing scope override: write the inherited (global/default)
          // value back so this scope matches it. The backend is PUT-only (no
          // delete), so this makes the override match its parent rather than
          // removing the row — the label states exactly that effect.
          <button
            type="button"
            onClick={() => write(eff.globalValue ?? def.default)}
            className="text-2xs text-accent-text underline-offset-2 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            Match global
          </button>
        ) : (
          effectiveTarget === "global" &&
          !isDefaulted && (
            <button
              type="button"
              onClick={() => write(def.default)}
              className="text-2xs text-ink-faint underline-offset-2 transition-colors hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
            >
              Reset to default
            </button>
          )
        )}
      </div>

      {error && (
        <p role="alert" className="text-2xs text-diff-remove">
          {error}
        </p>
      )}
    </div>
  );
}

/** The [Global | This scope] edit-target selector for a scope-eligible row. */
function ScopeTargetToggle({
  target,
  onTarget,
}: {
  target: EditTarget;
  onTarget: (t: EditTarget) => void;
}) {
  return (
    <div role="radiogroup" aria-label="apply to" className="flex gap-vs-0-5 text-2xs">
      {(["global", "scope"] as const).map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={target === t}
          onClick={() => onTarget(t)}
          className={`rounded-vs-sm px-vs-1 py-vs-0-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
            target === t
              ? "font-medium text-accent-text"
              : "text-ink-faint hover:text-ink-muted"
          }`}
        >
          {t === "global" ? "Global" : "This scope"}
        </button>
      ))}
    </div>
  );
}

/** An honest one-line note about where the effective value comes from. */
function provenanceNote(eff: EffectiveSetting, target: EditTarget): string {
  if (target === "scope") {
    return eff.scopeValue !== undefined
      ? "Overridden for this scope."
      : "Editing this scope (currently inheriting global).";
  }
  switch (eff.provenance) {
    case "scope":
      return "This scope overrides the global value.";
    case "global":
      return "Using the global value.";
    case "default":
      return "Using the default.";
  }
}
