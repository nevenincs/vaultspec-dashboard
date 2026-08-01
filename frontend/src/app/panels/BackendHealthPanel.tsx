import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import {
  deriveSystemStatusRows,
  useStatusRollup,
  type SystemStatusRow,
} from "../../stores/server/queries";

export { deriveSystemStatusRows as deriveBackendHealthRows } from "../../stores/server/queries";

const TONE_DOT_CLASS: Record<SystemStatusRow["tone"], string> = {
  ok: "bg-state-active",
  down: "bg-state-broken",
  unknown: "bg-ink-faint",
};

function HealthRow({ row }: { row: SystemStatusRow }) {
  const resolve = useLocalizedMessageResolver();
  return (
    <div className="flex items-center gap-fg-2" data-backend-row={row.key}>
      <span
        aria-hidden
        className={`size-fg-2 shrink-0 rounded-full ${TONE_DOT_CLASS[row.tone]}`}
      />
      <span className="min-w-0 flex-1 truncate text-body text-ink">
        {resolve(row.label).message}
      </span>
      <span
        className={`shrink-0 text-meta ${
          row.tone === "down"
            ? "text-state-broken"
            : row.tone === "ok"
              ? "text-state-active"
              : "text-ink-faint"
        }`}
        data-backend-status
      >
        {resolve(row.status).message}
      </span>
    </div>
  );
}

export interface BackendHealthPanelBodyProps {
  /** The derived status rows, already resolved from the served rollup. */
  rows: readonly SystemStatusRow[];
}

/** The wire-free body: the compact system-status block Settings ▸ Advanced hosts
 *  (advanced-service-console ADR D6). It receives resolved rows as a normal
 *  required prop, so the review desk renders every tone without the panel ever
 *  growing a harness affordance (production-dev-separation). */
export function BackendHealthPanelBody({ rows }: BackendHealthPanelBodyProps) {
  return (
    <div className="flex flex-col gap-fg-3 px-fg-4 py-fg-3" data-backend-health-panel>
      <div className="flex flex-col gap-fg-2">
        {rows.map((row) => (
          <HealthRow key={row.key} row={row} />
        ))}
      </div>
    </div>
  );
}

/** The container: derives the rows from the served rollup and renders the body. */
export function BackendHealthPanel() {
  return <BackendHealthPanelBody rows={deriveSystemStatusRows(useStatusRollup())} />;
}
