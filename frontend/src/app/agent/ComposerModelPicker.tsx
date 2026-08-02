// The composer's provider/model picker consumes only A2A's current provider
// catalog. It does not own a model list, provider taxonomy, or universal effort
// level: every row, native control, reason, and opaque selection reference is
// served by the active execution lane.

import { useState } from "react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import { authoredDisplayText } from "../../platform/localization/displayText";
import {
  isCurrentCatalogSelection,
  isProviderCatalogSelectable,
  selectionFromCatalogEntry,
  selectionWithCatalogControl,
  type ProviderCatalogRecord,
  type ProviderCatalogSelection,
  type ProviderNativeControl,
} from "../../stores/server/agent/a2aTeam";
import { DropdownButton, Popover } from "../kit";

const MSG = {
  model: "common:agent.composer.model",
  modelUnavailable: "common:agent.composer.modelUnavailable",
  selectorValue: "common:agent.composer.selectorValue",
  selectorDisabled: "common:agent.composer.selectorDisabled",
  menuAria: "common:agent.composer.modelMenuAria",
} as const;

function providerLabel(provider: ProviderCatalogRecord): string {
  return provider.display_name ?? provider.provider_id;
}

function entryLabel(entry: {
  readonly entry_id: string;
  readonly display_name?: string;
}): string {
  return entry.display_name ?? entry.entry_id;
}

function controlLabel(control: ProviderNativeControl): string {
  return control.display_name ?? control.control_id;
}

function ProviderModelRow({
  provider,
  entry,
  selected,
  onSelect,
}: {
  provider: ProviderCatalogRecord;
  entry: {
    readonly entry_id: string;
    readonly display_name?: string;
    readonly description?: string;
  };
  selected: boolean;
  onSelect: () => void;
}) {
  const selectable = isProviderCatalogSelectable(provider);
  const reason = provider.health.reasons.join(" ");
  return (
    <li>
      <button
        type="button"
        role="menuitemradio"
        aria-checked={selected}
        disabled={!selectable}
        title={
          selectable || reason.length === 0 ? undefined : authoredDisplayText(reason)
        }
        data-provider-id={provider.provider_id}
        data-model-entry-id={entry.entry_id}
        data-model-selectable={selectable ? "" : undefined}
        onClick={selectable ? onSelect : undefined}
        className="flex w-full flex-col gap-fg-0-5 rounded-fg-sm px-fg-2 py-fg-1 text-left text-label text-ink transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus aria-[checked=true]:bg-paper-sunken disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
      >
        <span className="flex min-w-0 items-baseline justify-between gap-fg-2">
          <span className="min-w-0 truncate">
            {authoredDisplayText(entryLabel(entry))}
          </span>
          <span className="shrink-0 text-caption text-ink-faint" data-model-provider>
            {authoredDisplayText(providerLabel(provider))}
          </span>
        </span>
        {entry.description !== undefined && entry.description.length > 0 && (
          <span className="truncate text-meta text-ink-faint">
            {authoredDisplayText(entry.description)}
          </span>
        )}
        {!selectable && reason.length > 0 && (
          <span className="truncate text-meta text-ink-faint" data-model-reason>
            {authoredDisplayText(reason)}
          </span>
        )}
      </button>
    </li>
  );
}

/** The required whole-team chooser. Selecting a row mints a reference only from
 * the current A2A catalog revision; control values retain their native vocabulary
 * and no implicit generic "tier" is added by the Dashboard. */
export function ComposerModelPicker({
  providers,
  selection,
  onSelectSelection,
  locked,
}: {
  providers: readonly ProviderCatalogRecord[];
  selection: ProviderCatalogSelection | null;
  onSelectSelection: (selection: ProviderCatalogSelection | null) => void;
  locked: boolean;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const [open, setOpen] = useState(false);
  const selectedProvider =
    providers.find((provider) => isCurrentCatalogSelection(provider, selection)) ??
    null;
  const selectedEntry =
    selectedProvider === null || selection === null
      ? null
      : (selectedProvider.catalog.models.find(
          (entry) => entry.entry_id === selection.entry_id,
        ) ?? null);

  if (providers.length === 0) return null;

  const modelLabel = resolveMessage({ key: MSG.model }).message;
  const value =
    selectedProvider !== null && selectedEntry !== null
      ? authoredDisplayText(
          `${providerLabel(selectedProvider)} · ${entryLabel(selectedEntry)}`,
        )
      : modelLabel;
  const selectable = providers.some(
    (provider) =>
      isProviderCatalogSelectable(provider) && provider.catalog.models.length > 0,
  );
  const disabled = !selectable || locked;
  const reason = resolveMessage({ key: MSG.modelUnavailable }).message;
  const pill = resolveMessage({
    key: MSG.selectorValue,
    values: { selector: modelLabel, value },
  }).message;
  const ariaLabel = disabled
    ? resolveMessage({
        key: MSG.selectorDisabled,
        values: { selector: modelLabel, value, reason },
      }).message
    : pill;
  const menuAria = resolveMessage({ key: MSG.menuAria });
  const disabledTitle = disabled ? authoredDisplayText(reason) : undefined;

  return (
    <div className="relative" data-composer-model>
      <span
        title={disabledTitle}
        data-composer-model-trigger
        data-provider-id={selectedProvider?.provider_id}
        data-model-entry-id={selectedEntry?.entry_id}
      >
        <DropdownButton
          label={value}
          open={open}
          onClick={() => setOpen((current) => !current)}
          disabled={disabled}
          ariaLabel={ariaLabel}
        />
      </span>
      {open && !disabled && !menuAria.usedFallback && (
        <Popover
          open
          onDismiss={() => setOpen(false)}
          ignoreSelector="[data-composer-model-trigger]"
          role="menu"
          aria-label={menuAria.message}
          data-composer-model-menu
          className="absolute bottom-full right-0 z-40 mb-fg-1 max-h-80 min-w-64 overflow-y-auto rounded-fg-md border border-rule bg-paper-raised p-fg-1 shadow-fg-popover"
        >
          <ul className="flex flex-col gap-fg-0-5">
            {providers.map((provider) => (
              <li
                key={`${provider.provider_id}:${provider.execution_mode}`}
                data-provider-catalog={provider.provider_id}
              >
                <p className="px-fg-2 py-fg-0-5 text-caption font-medium text-ink-muted">
                  {authoredDisplayText(providerLabel(provider))}
                </p>
                <ul
                  className="flex flex-col gap-fg-0-5"
                  aria-label={authoredDisplayText(providerLabel(provider))}
                >
                  {provider.catalog.models.map((entry) => (
                    <ProviderModelRow
                      key={entry.entry_id}
                      provider={provider}
                      entry={entry}
                      selected={
                        selectedProvider?.provider_id === provider.provider_id &&
                        selectedProvider.execution_mode === provider.execution_mode &&
                        selectedEntry?.entry_id === entry.entry_id
                      }
                      onSelect={() =>
                        onSelectSelection(
                          selectionFromCatalogEntry(provider, entry.entry_id),
                        )
                      }
                    />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {selectedProvider !== null && selection !== null && (
            <div
              className="mt-fg-1 flex flex-col gap-fg-1 border-t border-rule pt-fg-1"
              data-provider-native-controls
            >
              {selectedProvider.catalog.native_controls.map((control) => {
                const selectedOption = selection.controls[control.control_id] ?? "";
                return (
                  <label
                    key={control.control_id}
                    className="flex min-w-0 flex-col gap-fg-0-5 text-caption text-ink-muted"
                  >
                    <span className="truncate">
                      {authoredDisplayText(controlLabel(control))}
                    </span>
                    <select
                      value={selectedOption}
                      data-provider-control-id={control.control_id}
                      onChange={(event) => {
                        const next = selectionWithCatalogControl(
                          selectedProvider,
                          selection,
                          control.control_id,
                          event.currentTarget.value,
                        );
                        if (next !== null) onSelectSelection(next);
                      }}
                      className="min-w-0 rounded-fg-sm border border-rule bg-paper px-fg-1 py-fg-0-5 text-label text-ink"
                    >
                      {selectedOption.length === 0 && <option value="" disabled />}
                      {control.options.map((option) => (
                        <option key={option.option_id} value={option.option_id}>
                          {authoredDisplayText(option.display_name ?? option.option_id)}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
          )}
        </Popover>
      )}
    </div>
  );
}
