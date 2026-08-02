// The composer's provider/model picker consumes only A2A's current provider
// catalog. It does not own a model list, provider taxonomy, or universal effort
// level: every row, native control, reason, and opaque selection reference is
// served by the active execution lane.

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import { authoredDisplayText } from "../../platform/localization/displayText";
import {
  isCurrentCatalogSelection,
  isProviderCatalogSelectable,
  nativeControlsForCatalogEntry,
  nextProviderCatalogExpiry,
  selectionFromCatalogEntry,
  selectionWithCatalogControl,
  type ProviderCatalogRecord,
  type ProviderCatalogSelection,
  type ProviderNativeControl,
} from "../../stores/server/agent/a2aTeam";
import { DropdownButton, Popover } from "../kit";
import { ProviderHealthStatus } from "./ProviderHealthStatus";

const MSG = {
  model: "common:agent.composer.model",
  modelUnavailable: "common:agent.composer.modelUnavailable",
  selectorValue: "common:agent.composer.selectorValue",
  selectorDisabled: "common:agent.composer.selectorDisabled",
  menuAria: "common:agent.composer.modelMenuAria",
} as const;

const MAX_TIMEOUT_DELAY_MS = 2_147_483_647;

/** Revalidate the render-time selection gate at the earliest served expiry.
 * The effect owns no catalog data and does not invent a deadline: it only wakes
 * the picker to re-read A2A's timestamped freshness evidence. */
function useCatalogFreshnessNow(providers: readonly ProviderCatalogRecord[]): number {
  const [, rerenderAtExpiry] = useState(0);
  const now = Date.now();
  const expiresAt = nextProviderCatalogExpiry(providers, now);
  const expiryDelay =
    expiresAt === null
      ? null
      : Math.min(Math.max(0, expiresAt - now), MAX_TIMEOUT_DELAY_MS);
  useEffect(() => {
    if (expiryDelay === null) return undefined;
    const timeoutId = setTimeout(
      () => rerenderAtExpiry((revision) => revision + 1),
      expiryDelay,
    );
    return () => clearTimeout(timeoutId);
  }, [expiryDelay]);
  return now;
}

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
  selectable,
  onSelect,
  buttonRef,
}: {
  provider: ProviderCatalogRecord;
  entry: {
    readonly entry_id: string;
    readonly display_name?: string;
    readonly description?: string;
  };
  selected: boolean;
  selectable: boolean;
  onSelect: () => void;
  buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  const reason = provider.health.reasons.join(" ");
  return (
    <li>
      <button
        ref={buttonRef}
        type="button"
        aria-pressed={selected}
        disabled={!selectable}
        title={
          selectable || reason.length === 0
            ? undefined
            : authoredDisplayText(provider.health.reasons.join(" "))
        }
        data-provider-id={provider.provider_id}
        data-model-entry-id={entry.entry_id}
        data-model-selectable={selectable ? "" : undefined}
        onClick={selectable ? onSelect : undefined}
        className="flex w-full flex-col gap-fg-0-5 rounded-fg-sm px-fg-2 py-fg-1 text-left text-label text-ink transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus aria-[pressed=true]:bg-paper-sunken disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
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
            {authoredDisplayText(provider.health.reasons.join(" "))}
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
  surfaceId,
}: {
  providers: readonly ProviderCatalogRecord[];
  selection: ProviderCatalogSelection | null;
  onSelectSelection: (selection: ProviderCatalogSelection | null) => void;
  locked: boolean;
  /** The primary picker retains the legacy composer hooks. Expert pickers use a
   * stable local id so independent disclosures never share a popover trigger. */
  surfaceId?: string;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstModelRef = useRef<HTMLButtonElement>(null);
  const now = useCatalogFreshnessNow(providers);
  const selectedProvider =
    providers.find((provider) => isCurrentCatalogSelection(provider, selection, now)) ??
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
      isProviderCatalogSelectable(provider, now) &&
      provider.catalog.models.some(
        (entry) => selectionFromCatalogEntry(provider, entry.entry_id, now) !== null,
      ),
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
  const primarySurface = surfaceId === undefined;
  const triggerSelector = primarySurface
    ? "[data-composer-model-trigger]"
    : `[data-expert-model-trigger="${surfaceId}"]`;
  const firstSelectable = providers
    .flatMap((provider) =>
      provider.catalog.models.map((entry) => ({ provider, entry })),
    )
    .find(
      ({ provider, entry }) =>
        selectionFromCatalogEntry(provider, entry.entry_id, now) !== null,
    );
  const selectedControls =
    selectedProvider === null || selection === null
      ? []
      : nativeControlsForCatalogEntry(selectedProvider, selection.entry_id);

  return (
    <div
      className="relative"
      {...(primarySurface
        ? { "data-composer-model": "" }
        : { "data-expert-model-picker": surfaceId })}
    >
      <span
        title={disabledTitle}
        {...(primarySurface
          ? { "data-composer-model-trigger": "" }
          : { "data-expert-model-trigger": surfaceId })}
        data-provider-id={selectedProvider?.provider_id}
        data-model-entry-id={selectedEntry?.entry_id}
      >
        <DropdownButton
          ref={triggerRef}
          label={value}
          open={open}
          onClick={() => setOpen((current) => !current)}
          disabled={disabled}
          ariaLabel={ariaLabel}
          ariaHasPopup="dialog"
        />
      </span>
      <ProviderHealthStatus providers={providers} now={now} />
      {open && !disabled && !menuAria.usedFallback && (
        <Popover
          open
          onDismiss={() => setOpen(false)}
          ignoreSelector={triggerSelector}
          returnFocusRef={triggerRef}
          role="dialog"
          aria-label={menuAria.message}
          initialFocusRef={firstModelRef}
          {...(primarySurface
            ? { "data-composer-model-menu": "" }
            : { "data-expert-model-menu": surfaceId })}
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
                  {provider.catalog.models.map((entry) =>
                    (() => {
                      const catalogSelection = selectionFromCatalogEntry(
                        provider,
                        entry.entry_id,
                        now,
                      );
                      const modelSelectable = catalogSelection !== null;
                      return (
                        <ProviderModelRow
                          key={entry.entry_id}
                          provider={provider}
                          entry={entry}
                          selected={
                            selectedProvider?.provider_id === provider.provider_id &&
                            selectedProvider.execution_mode ===
                              provider.execution_mode &&
                            selectedEntry?.entry_id === entry.entry_id
                          }
                          selectable={modelSelectable}
                          buttonRef={
                            firstSelectable?.provider === provider &&
                            firstSelectable.entry === entry
                              ? firstModelRef
                              : undefined
                          }
                          onSelect={() => {
                            const currentSelection = selectionFromCatalogEntry(
                              provider,
                              entry.entry_id,
                              now,
                            );
                            if (currentSelection !== null) {
                              onSelectSelection(currentSelection);
                              setOpen(false);
                            }
                          }}
                        />
                      );
                    })(),
                  )}
                </ul>
              </li>
            ))}
          </ul>
          {selectedProvider !== null &&
            selection !== null &&
            selectedControls.length > 0 && (
              <div
                className="mt-fg-1 flex flex-col gap-fg-1 border-t border-rule pt-fg-1"
                data-provider-native-controls
              >
                {selectedControls.map((control) => {
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
                            now,
                          );
                          if (next !== null) onSelectSelection(next);
                        }}
                        className="min-w-0 rounded-fg-sm border border-rule bg-paper px-fg-1 py-fg-0-5 text-label text-ink"
                      >
                        {selectedOption.length === 0 && <option value="" disabled />}
                        {control.options.map((option) => (
                          <option key={option.option_id} value={option.option_id}>
                            {authoredDisplayText(
                              option.display_name ?? option.option_id,
                            )}
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
