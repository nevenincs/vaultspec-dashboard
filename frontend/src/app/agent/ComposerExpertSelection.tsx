// Advanced team-run selection stays entirely within the current A2A catalog.
// The dashboard may expose a preset's served role ids, but it cannot invent a
// role, provider, model, generic tier, or control vocabulary of its own.

import { useMemo, useState } from "react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import { authoredDisplayText } from "../../platform/localization/displayText";
import {
  isCurrentCatalogSelection,
  type ProviderCatalogRecord,
  type ProviderCatalogSelection,
} from "../../stores/server/agent/a2aTeam";
import { Button, FoldSection, Switch } from "../kit";
import { ComposerModelPicker } from "./ComposerModelPicker";

// These are resource limits, not a Dashboard policy about providers or models.
// They mirror the A2A request boundary so an oversized, malformed preset cannot
// make the browser construct a request A2A will necessarily reject.
export const MAX_TEAM_ROLE_OVERRIDES = 64;
export const MAX_TEAM_FALLBACKS = 8;

const MSG = {
  advancedSelection: "common:agent.composer.advancedSelection",
  advancedSelectionDescription: "common:agent.composer.advancedSelectionDescription",
  roleOverrides: "common:agent.composer.roleOverrides",
  roleOverride: "common:agent.composer.roleOverride",
  fallbacks: "common:agent.composer.fallbacks",
  addFallback: "common:agent.composer.addFallback",
  removeFallback: "common:agent.composer.removeFallback",
  fallbackOrdinal: "common:agent.composer.fallbackOrdinal",
  noRoleOverrides: "common:agent.composer.noRoleOverrides",
  roleOrdinal: "common:agent.composer.roleOrdinal",
} as const;

/** Deduplicate and bound only the role ids A2A served on the active preset. */
export function servedTeamRoleIds(requiredRoles: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const roles: string[] = [];
  for (const roleId of requiredRoles) {
    if (roleId.length === 0 || seen.has(roleId)) continue;
    seen.add(roleId);
    roles.push(roleId);
    if (roles.length === MAX_TEAM_ROLE_OVERRIDES) break;
  }
  return roles;
}

function isServedSelection(
  providers: readonly ProviderCatalogRecord[],
  selection: ProviderCatalogSelection,
): boolean {
  return providers.some((provider) => isCurrentCatalogSelection(provider, selection));
}

function sameRecord(
  left: Readonly<Record<string, ProviderCatalogSelection>>,
  right: Readonly<Record<string, ProviderCatalogSelection>>,
): boolean {
  const leftEntries = Object.entries(left);
  if (leftEntries.length !== Object.keys(right).length) return false;
  return leftEntries.every(([roleId, selection]) => right[roleId] === selection);
}

function sameSequence(
  left: readonly ProviderCatalogSelection[],
  right: readonly ProviderCatalogSelection[],
): boolean {
  return (
    left.length === right.length &&
    left.every((selection, index) => selection === right[index])
  );
}

/** Opaque role ids are served values and may collide with Object.prototype.
 * Read only explicit A2A-owned entries so an absent `constructor` or `toString`
 * can neither enable an override nor bypass the localized display fallback. */
function ownRecordValue<Value>(
  record: Readonly<Record<string, Value>>,
  key: string,
): Value | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

/** Drop a switched-away role or stale catalog selection before it reaches the
 * mutation. Returning stable input references makes the reconciliation effect in
 * Composer a no-op once the current state is already valid. */
export function reconcileExpertSelections({
  requiredRoles,
  providers,
  overrides,
  fallbacks,
}: {
  requiredRoles: readonly string[];
  providers: readonly ProviderCatalogRecord[];
  overrides: Readonly<Record<string, ProviderCatalogSelection>>;
  fallbacks: readonly ProviderCatalogSelection[];
}): {
  readonly roleIds: readonly string[];
  readonly overrides: Readonly<Record<string, ProviderCatalogSelection>>;
  readonly fallbacks: readonly ProviderCatalogSelection[];
} {
  const roleIds = servedTeamRoleIds(requiredRoles);
  const roles = new Set(roleIds);
  const nextOverrides = Object.fromEntries(
    Object.entries(overrides).filter(
      ([roleId, selection]) =>
        roles.has(roleId) && isServedSelection(providers, selection),
    ),
  ) as Readonly<Record<string, ProviderCatalogSelection>>;
  const nextFallbacks = fallbacks
    .filter((selection) => isServedSelection(providers, selection))
    .slice(0, MAX_TEAM_FALLBACKS);

  return {
    roleIds,
    overrides: sameRecord(overrides, nextOverrides) ? overrides : nextOverrides,
    fallbacks: sameSequence(fallbacks, nextFallbacks) ? fallbacks : nextFallbacks,
  };
}

/** Expert controls are opt-in: whole-team selection remains the one required,
 * simple default. A role switch can only copy the already-current whole-team
 * selection; the picker then permits a different catalog entry or advertised
 * native control. Fallbacks are an explicit ordered list, again copied only from
 * that current served selection before the operator changes it. */
export function ComposerExpertSelection({
  requiredRoles,
  requiredRoleLabels,
  providers,
  selection,
  overrides,
  fallbacks,
  onChangeOverrides,
  onChangeFallbacks,
  locked,
}: {
  requiredRoles: readonly string[];
  requiredRoleLabels: Readonly<Record<string, string>>;
  providers: readonly ProviderCatalogRecord[];
  selection: ProviderCatalogSelection | null;
  overrides: Readonly<Record<string, ProviderCatalogSelection>>;
  fallbacks: readonly ProviderCatalogSelection[];
  onChangeOverrides: (
    overrides: Readonly<Record<string, ProviderCatalogSelection>>,
  ) => void;
  onChangeFallbacks: (fallbacks: readonly ProviderCatalogSelection[]) => void;
  locked: boolean;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const [open, setOpen] = useState(false);
  const roleIds = useMemo(() => servedTeamRoleIds(requiredRoles), [requiredRoles]);
  const selectionReady = selection !== null;
  const advancedLabel = resolveMessage({ key: MSG.advancedSelection });
  const description = resolveMessage({ key: MSG.advancedSelectionDescription });
  const roleOverrides = resolveMessage({ key: MSG.roleOverrides });
  const fallbacksLabel = resolveMessage({ key: MSG.fallbacks });

  return (
    <FoldSection
      open={open}
      onToggle={() => setOpen((current) => !current)}
      label={advancedLabel.message}
      headerProps={{
        "aria-describedby":
          !open || description.usedFallback
            ? undefined
            : "composer-expert-selection-description",
      }}
      data-composer-expert-selection
      bodyId="composer-expert-selection-body"
      bodyClassName="mt-fg-1 flex max-w-80 flex-col gap-fg-2 px-fg-1 pb-fg-1"
    >
      {!description.usedFallback && (
        <p
          id="composer-expert-selection-description"
          className="text-meta text-ink-muted"
        >
          {description.message}
        </p>
      )}
      <section className="flex flex-col gap-fg-1" data-expert-role-overrides>
        <h3 className="text-caption font-medium text-ink-muted">
          {roleOverrides.message}
        </h3>
        {roleIds.length === 0 ? (
          <p className="text-meta text-ink-faint">
            {resolveMessage({ key: MSG.noRoleOverrides }).message}
          </p>
        ) : (
          roleIds.map((roleId, index) => {
            const override = ownRecordValue(overrides, roleId) ?? null;
            const roleLabel =
              ownRecordValue(requiredRoleLabels, roleId) ??
              resolveMessage({
                key: MSG.roleOrdinal,
                values: { index: index + 1 },
              }).message;
            const switchLabel = resolveMessage({
              key: MSG.roleOverride,
              values: { role: authoredDisplayText(roleLabel) },
            }).message;
            return (
              <div
                key={roleId}
                className="flex min-w-0 flex-wrap items-center gap-fg-1"
                data-expert-role-override={roleId}
              >
                <span className="min-w-0 flex-1 truncate text-label text-ink">
                  {authoredDisplayText(roleLabel)}
                </span>
                <Switch
                  checked={override !== null}
                  label={switchLabel}
                  disabled={locked || !selectionReady}
                  onChange={(enabled) => {
                    if (!enabled) {
                      const { [roleId]: _removed, ...remaining } = overrides;
                      onChangeOverrides(remaining);
                    } else if (selection !== null) {
                      onChangeOverrides({ ...overrides, [roleId]: selection });
                    }
                  }}
                />
                {override !== null && (
                  <ComposerModelPicker
                    providers={providers}
                    selection={override}
                    onSelectSelection={(next) => {
                      if (next !== null) {
                        onChangeOverrides({ ...overrides, [roleId]: next });
                      }
                    }}
                    locked={locked}
                    surfaceId={`role-${index}`}
                  />
                )}
              </div>
            );
          })
        )}
      </section>
      <section className="flex flex-col gap-fg-1" data-expert-fallbacks>
        <h3 className="text-caption font-medium text-ink-muted">
          {fallbacksLabel.message}
        </h3>
        {fallbacks.map((fallback, index) => {
          const fallbackLabel = resolveMessage({
            key: MSG.fallbackOrdinal,
            values: { index: index + 1 },
          }).message;
          const removeLabel = resolveMessage({
            key: MSG.removeFallback,
            values: { index: index + 1 },
          }).message;
          return (
            <div
              key={`${fallback.provider_id}:${fallback.execution_mode}:${fallback.entry_id}:${index}`}
              className="flex min-w-0 items-center gap-fg-1"
              data-expert-fallback={index}
            >
              <span className="shrink-0 text-caption text-ink-muted">
                {fallbackLabel}
              </span>
              <ComposerModelPicker
                providers={providers}
                selection={fallback}
                onSelectSelection={(next) => {
                  if (next !== null) {
                    onChangeFallbacks(
                      fallbacks.map((current, currentIndex) =>
                        currentIndex === index ? next : current,
                      ),
                    );
                  }
                }}
                locked={locked}
                surfaceId={`fallback-${index}`}
              />
              <Button
                variant="secondary"
                disabled={locked}
                onClick={() =>
                  onChangeFallbacks(
                    fallbacks.filter(
                      (_fallback, fallbackIndex) => fallbackIndex !== index,
                    ),
                  )
                }
                aria-label={removeLabel}
                data-expert-fallback-remove={index}
              >
                {removeLabel}
              </Button>
            </div>
          );
        })}
        <Button
          variant="secondary"
          disabled={locked || !selectionReady || fallbacks.length >= MAX_TEAM_FALLBACKS}
          onClick={() => {
            if (selection !== null) onChangeFallbacks([...fallbacks, selection]);
          }}
          data-expert-fallback-add
        >
          {resolveMessage({ key: MSG.addFallback }).message}
        </Button>
      </section>
    </FoldSection>
  );
}
