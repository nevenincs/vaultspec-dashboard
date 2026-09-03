// Provider health remains a projection of the A2A-owned catalog. The browser
// presents every independent fact and safe reason it was served; it never infers
// authentication from configuration or condenses the facts into a generic status.

import { useState } from "react";

import {
  useActiveLocale,
  useLocalizedMessageResolver,
} from "../../platform/localization/LocalizationProvider";
import { authoredDisplayText } from "../../platform/localization/displayText";
import { formatDate } from "../../platform/localization/formatters";
import { isProviderCatalogSelectable } from "../../stores/server/agent/a2aTeam";
import type {
  ProviderAdmissionState,
  ProviderAuthenticationState,
  ProviderCatalogRecord,
  ProviderCatalogStatus,
  ProviderHealthState,
} from "../../stores/server/agent/a2aTeam";
import { Badge, FoldSection } from "../kit";

const MSG = {
  heading: "common:agent.composer.providerHealth",
  configured: "common:agent.composer.providerHealthConfigured",
  transport: "common:agent.composer.providerHealthTransport",
  authentication: "common:agent.composer.providerHealthAuthentication",
  catalog: "common:agent.composer.providerHealthCatalog",
  catalogFreshness: "common:agent.composer.providerHealthCatalogFreshness",
  admission: "common:agent.composer.providerHealthAdmission",
  selectable: "common:agent.composer.providerHealthSelectable",
  notSelectable: "common:agent.composer.providerHealthNotSelectable",
  healthCheckedAt: "common:agent.composer.providerHealthHealthCheckedAt",
  checkedAt: "common:agent.composer.providerHealthCheckedAt",
  expiresAt: "common:agent.composer.providerHealthExpiresAt",
  reasons: "common:agent.composer.providerHealthReasons",
  stateAvailable: "common:agent.composer.providerHealthStateAvailable",
  stateUnavailable: "common:agent.composer.providerHealthStateUnavailable",
  stateUnknown: "common:agent.composer.providerHealthStateUnknown",
  stateAuthenticated: "common:agent.composer.providerHealthStateAuthenticated",
  stateUnauthenticated: "common:agent.composer.providerHealthStateUnauthenticated",
  stateNotApplicable: "common:agent.composer.providerHealthStateNotApplicable",
  stateStale: "common:agent.composer.providerHealthStateStale",
  stateAdmitted: "common:agent.composer.providerHealthStateAdmitted",
  stateNotAdmitted: "common:agent.composer.providerHealthStateNotAdmitted",
} as const;

const DATE_OPTIONS = Object.freeze({
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
} as const satisfies Intl.DateTimeFormatOptions);

type HealthValue =
  | ProviderHealthState
  | ProviderAuthenticationState
  | ProviderCatalogStatus
  | ProviderAdmissionState;

const STATE_MESSAGE = {
  available: MSG.stateAvailable,
  unavailable: MSG.stateUnavailable,
  unknown: MSG.stateUnknown,
  authenticated: MSG.stateAuthenticated,
  unauthenticated: MSG.stateUnauthenticated,
  not_applicable: MSG.stateNotApplicable,
  stale: MSG.stateStale,
  admitted: MSG.stateAdmitted,
  not_admitted: MSG.stateNotAdmitted,
} as const satisfies Record<HealthValue, string>;

function providerLabel(provider: ProviderCatalogRecord): string {
  return provider.display_name ?? provider.provider_id;
}

/** Format a served ISO timestamp only when it is a valid instant. An omitted or
 * malformed value stays absent rather than becoming browser-authored evidence. */
export function formatProviderHealthTimestamp(
  locale: string,
  timestamp: string | undefined,
): string | null {
  if (timestamp === undefined) return null;
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? formatDate(locale, parsed, DATE_OPTIONS) : null;
}

function servedReasons(provider: ProviderCatalogRecord): readonly string[] {
  const reasons = [...provider.health.reasons, provider.catalog.state.reason].filter(
    (reason): reason is string => typeof reason === "string" && reason.length > 0,
  );
  return [...new Set(reasons)];
}

function ProviderHealthFacts({
  provider,
  now,
}: {
  provider: ProviderCatalogRecord;
  now: number;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const locale = useActiveLocale();
  const healthCheckedAt = formatProviderHealthTimestamp(
    locale,
    provider.health.checked_at,
  );
  const catalogCheckedAt = formatProviderHealthTimestamp(
    locale,
    provider.catalog.state.checked_at,
  );
  const expiresAt = formatProviderHealthTimestamp(
    locale,
    provider.catalog.state.expires_at,
  );
  // These are intentionally separate facts. The independent health axis can
  // disagree with the timestamped catalog state during a partial refresh; hiding
  // either would collapse A2A's evidence into a browser-authored conclusion.
  const facts: readonly {
    readonly axis: string;
    readonly label: string;
    readonly value: HealthValue;
  }[] = [
    {
      axis: "configured",
      label: resolveMessage({ key: MSG.configured }).message,
      value: provider.health.configured,
    },
    {
      axis: "transport",
      label: resolveMessage({ key: MSG.transport }).message,
      value: provider.health.transport,
    },
    {
      axis: "authentication",
      label: resolveMessage({ key: MSG.authentication }).message,
      value: provider.health.authentication,
    },
    {
      axis: "catalog",
      label: resolveMessage({ key: MSG.catalog }).message,
      value: provider.health.catalog,
    },
    {
      axis: "catalog-freshness",
      label: resolveMessage({ key: MSG.catalogFreshness }).message,
      value: provider.catalog.state.status,
    },
    {
      axis: "admission",
      label: resolveMessage({ key: MSG.admission }).message,
      value: provider.health.admission,
    },
  ];
  const reasons = servedReasons(provider);
  const selectableLabel = resolveMessage({
    key: isProviderCatalogSelectable(provider, now)
      ? MSG.selectable
      : MSG.notSelectable,
  }).message;

  return (
    <section
      aria-label={authoredDisplayText(providerLabel(provider))}
      data-provider-health-provider={provider.provider_id}
      className="flex flex-col gap-fg-1 border-t border-rule pt-fg-1 first:border-t-0 first:pt-0"
    >
      <div className="flex min-w-0 items-center justify-between gap-fg-2">
        <h4 className="min-w-0 truncate text-label font-medium text-ink">
          {authoredDisplayText(providerLabel(provider))}
        </h4>
        <Badge>{selectableLabel}</Badge>
      </div>
      <dl className="grid grid-cols-2 gap-x-fg-3 gap-y-fg-1 text-meta">
        {facts.map((fact) => (
          <div key={fact.axis} data-provider-health-axis={fact.axis}>
            <dt className="text-ink-faint">{fact.label}</dt>
            <dd className="text-ink-muted">
              {resolveMessage({ key: STATE_MESSAGE[fact.value] }).message}
            </dd>
          </div>
        ))}
      </dl>
      {(healthCheckedAt !== null ||
        catalogCheckedAt !== null ||
        expiresAt !== null) && (
        <div className="flex flex-wrap gap-x-fg-2 gap-y-fg-0-5 text-meta text-ink-faint">
          {healthCheckedAt !== null && (
            <span data-provider-health-health-checked-at>
              {
                resolveMessage({
                  key: MSG.healthCheckedAt,
                  values: { time: healthCheckedAt },
                }).message
              }
            </span>
          )}
          {catalogCheckedAt !== null && (
            <span data-provider-health-checked-at>
              {
                resolveMessage({
                  key: MSG.checkedAt,
                  values: { time: catalogCheckedAt },
                }).message
              }
            </span>
          )}
          {expiresAt !== null && (
            <span data-provider-health-expires-at>
              {
                resolveMessage({ key: MSG.expiresAt, values: { time: expiresAt } })
                  .message
              }
            </span>
          )}
        </div>
      )}
      {reasons.length > 0 && (
        <div className="flex flex-col gap-fg-0-5">
          <h5 className="text-caption font-medium text-ink-muted">
            {resolveMessage({ key: MSG.reasons }).message}
          </h5>
          <ul className="flex flex-col gap-fg-0-5 text-meta text-ink-muted">
            {reasons.map((reason) => (
              <li key={reason}>{authoredDisplayText(reason)}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** A compact, always-present disclosure adjacent to the chooser. It preserves
 * the simple run-start path while making unselectable provider lanes inspectable. */
export function ProviderHealthStatus({
  providers,
  now = Date.now(),
}: {
  providers: readonly ProviderCatalogRecord[];
  now?: number;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const [open, setOpen] = useState(false);
  if (providers.length === 0) return null;

  return (
    <FoldSection
      open={open}
      onToggle={() => setOpen((current) => !current)}
      label={resolveMessage({ key: MSG.heading }).message}
      headerClassName="flex w-auto items-center gap-fg-1 rounded-fg-xs px-fg-1 py-fg-1 text-left text-label text-ink-muted transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
      bodyClassName="mt-fg-1 flex min-w-64 max-w-80 flex-col gap-fg-2 rounded-fg-sm border border-rule bg-paper-raised p-fg-2 shadow-fg-popover"
      data-provider-health
    >
      {providers.map((provider) => (
        <ProviderHealthFacts
          key={`${provider.provider_id}:${provider.execution_mode}`}
          provider={provider}
          now={now}
        />
      ))}
    </FoldSection>
  );
}
