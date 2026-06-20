// The schema-driven settings dialog (dashboard-settings W04.P08). Reads the
// stores-layer resolved settings view and renders each declared setting through
// the control registry. Adding a setting is one engine registry entry — this
// surface renders it with no change here.
//
// Scope handling (the schema declares scope-eligibility): a global-only setting
// edits the global value; a scope-eligible setting offers a [Global | This
// scope] target so the active scope can override global, with an honest
// provenance note. Row writes and draft/error lifecycle go through the
// stores/view settings-row controller; the app surface renders only controls.
//
// W02.P06 (figma-parity-reconciliation): rebuilt faithfully to the binding Figma
// SettingsDialog frame (17:1702) on the canonical Figma role-named type scale
// and radius (text-caption, rounded-fg-xs) in place of the legacy alias shims.
// Every rendered row is a real schema-declared setting with a consumer — no dead
// controls (settings-are-schema-driven-from-one-registry).

import { useActiveScope, useSettingsDialogView } from "../../stores/server/queries";
import type { EffectiveSetting } from "../../stores/server/settingsSelectors";
import {
  closeSettingsDialog,
  useSettingsDialogOpen,
} from "../../stores/view/settingsDialog";
import {
  deriveSettingsEditTargetToggleView,
  useSettingsRowController,
  type SettingsEditTarget,
} from "../../stores/view/settingsControlRow";
import { Dialog } from "../chrome/Dialog";
import { Button, SectionLabel } from "../kit";
import { SettingControl } from "./controls/registry";

export function SettingsDialog() {
  const open = useSettingsDialogOpen();
  const activeScope = useActiveScope();

  const settings = useSettingsDialogView(activeScope);

  return (
    <Dialog
      open={open}
      onClose={closeSettingsDialog}
      title={settings.title}
      description={settings.description}
    >
      <div className="flex flex-col gap-fg-4 px-fg-4 pt-fg-3 pb-fg-4">
        {settings.loading && (
          <p className="py-fg-4 text-center text-label text-ink-faint">
            {settings.loadingMessage}
          </p>
        )}
        {!settings.loading && settings.groups.length === 0 && (
          <p className="py-fg-4 text-center text-label text-ink-faint">
            {settings.emptyMessage}
          </p>
        )}
        {settings.groups.map((group) => (
          <section key={group.name} className="flex flex-col gap-fg-2">
            {/* Board 96:2: a plain eyebrow section label (kit SectionLabel) — no
                underline rule. */}
            <SectionLabel>{group.name}</SectionLabel>
            <div className="flex flex-col gap-fg-2">
              {group.settings.map((eff) => (
                <SettingRow key={eff.def.key} eff={eff} activeScope={activeScope} />
              ))}
            </div>
          </section>
        ))}

        {/* Footer (board 96:2): Cancel + Done. Settings auto-persist on change,
            so both dismiss the dialog; Done is the primary affordance. */}
        <div className="flex items-center justify-end gap-fg-2 border-t border-rule pt-fg-3">
          <Button variant="secondary" onClick={closeSettingsDialog}>
            {settings.cancelLabel}
          </Button>
          <Button variant="primary" onClick={closeSettingsDialog}>
            {settings.doneLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

interface SettingRowProps {
  eff: EffectiveSetting;
  activeScope: unknown;
}

function SettingRow({ eff, activeScope }: SettingRowProps) {
  const row = useSettingsRowController(eff, activeScope);
  const { def } = row;

  return (
    <div className={row.rootClassName}>
      <div className={row.headerClassName}>
        <label htmlFor={row.fieldId} className={row.labelClassName}>
          <span className={row.titleClassName}>{def.label}</span>
          {def.description && (
            <span className={row.descriptionClassName}>{def.description}</span>
          )}
        </label>
        <div className={row.controlStackClassName}>
          {/* Controls stay interactive during a write — discrete writes are fast
              and never disable mid-interaction (dashboard-settings review HIGH-2). */}
          <SettingControl
            def={def}
            value={row.shownValue}
            onChange={row.onControlChange}
            id={row.fieldId}
          />
          {row.scopeable && (
            <ScopeTargetToggle target={row.target} onTarget={row.setTarget} />
          )}
        </div>
      </div>

      {/* Provenance + an honest reset/clear affordance, beneath the row. */}
      <div className={row.footerClassName}>
        <span className={row.provenanceClassName}>{row.provenanceNote}</span>
        {row.resetAction && (
          <button
            type="button"
            onClick={() => row.commit(row.resetAction!.value)}
            className={row.resetButtonClassName ?? undefined}
          >
            {row.resetAction.label}
          </button>
        )}
      </div>

      {row.error && (
        <p role="alert" className={row.errorClassName}>
          {row.error}
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
  target: SettingsEditTarget;
  onTarget: (target: unknown) => void;
}) {
  const view = deriveSettingsEditTargetToggleView(target);
  return (
    <div role="radiogroup" aria-label={view.ariaLabel} className={view.rootClassName}>
      {view.rows.map(({ id, label, checked, className }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={checked}
          onClick={() => onTarget(id)}
          className={className}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
