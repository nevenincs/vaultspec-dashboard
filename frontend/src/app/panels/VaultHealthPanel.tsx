// The Vault health control-panel body (activity-rail-realignment ADR D3, S10).
// The first chrome consumer of the served core vault-health word: it renders the
// served health word and hosts the EXISTING vault-check ops verb with its receipt
// — no richer per-condition ingestion (explicitly out of scope per the ADR
// constraints).
//
// Layer ownership (dashboard-layer-ownership): a DUMB app-chrome body. The health
// word is read through the interpreted `useCoreStatus` selector (never the raw
// `tiers`/`core` block); the check runs through the ONE ops dispatch seam
// (`useOpsRunMutation` -> `dispatchOps`, logged + traced + guardable), and its
// outcome renders from the shared `useOpsReceipt` projection — the same receipt
// idiom every ops surface uses.

import {
  HEALTHY_VAULT_WORDS,
  useCoreStatus,
  type CoreStatusView,
  type FrameworkStatusTone,
} from "../../stores/server/queries";
import { useOpsRunMutation } from "../../stores/view/opsRun";
import { useOpsReceipt } from "../../stores/view/opsReceipt";
import type { OpsReceipt } from "../../stores/server/queries";
import { Button } from "../kit";

/** The projected vault-health word + tone the panel renders. */
export interface VaultHealthView {
  tone: FrameworkStatusTone;
  word: string;
}

const TONE_DOT_CLASS: Record<FrameworkStatusTone, string> = {
  ok: "bg-state-active",
  attention: "bg-state-stale",
  down: "bg-state-broken",
  unknown: "bg-ink-faint",
};

const TONE_TEXT_CLASS: Record<FrameworkStatusTone, string> = {
  ok: "text-state-active",
  attention: "text-state-stale",
  down: "text-state-broken",
  unknown: "text-ink-faint",
};

const RECEIPT_TONE_CLASS: Record<OpsReceipt["tone"], string> = {
  ok: "text-state-active",
  failed: "text-state-broken",
  down: "text-state-stale",
};

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Project the vault-health word + tone from the interpreted core view. Pure — no
 * hook — so the mapping is unit-testable. An unreachable/errored core is down; a
 * reachable core with no served word is honestly "Reachable" (we do not invent a
 * health verdict); a served word maps healthy -> ok, anything else -> attention.
 */
export function deriveVaultHealthView(
  core: Pick<CoreStatusView, "loading" | "errored" | "reachable" | "vaultHealth">,
): VaultHealthView {
  if (core.errored || (!core.reachable && !core.loading)) {
    return { tone: "down", word: "Unreachable" };
  }
  if (core.loading) return { tone: "unknown", word: "Checking…" };
  const raw = core.vaultHealth?.trim();
  if (!raw) return { tone: "ok", word: "Reachable" };
  const healthy = HEALTHY_VAULT_WORDS.has(raw.toLowerCase());
  return { tone: healthy ? "ok" : "attention", word: titleCase(raw) };
}

/** The Vault health panel body: the served health word plus the vault-check verb. */
export function VaultHealthPanel() {
  const core = useCoreStatus();
  const view = deriveVaultHealthView(core);
  const check = useOpsRunMutation();
  // The receipt store is a global singleton shared by every ops surface; show
  // only this panel's own verb so a foreign dispatch never surfaces here.
  const lastReceipt = useOpsReceipt();
  const receipt = lastReceipt?.verb === "vault-check" ? lastReceipt : null;

  return (
    <div className="flex flex-col gap-fg-3 px-fg-4 py-fg-3" data-vault-health-panel>
      <div className="flex items-center gap-fg-2" data-vault-health-word>
        <span
          aria-hidden
          className={`size-fg-2 shrink-0 rounded-full ${TONE_DOT_CLASS[view.tone]}`}
        />
        <span className="min-w-0 flex-1 truncate text-body text-ink">Vault health</span>
        <span className={`shrink-0 text-meta ${TONE_TEXT_CLASS[view.tone]}`}>
          {view.word}
        </span>
      </div>

      <div className="flex flex-col gap-fg-2">
        <Button
          variant="secondary"
          onClick={() => check.mutate({ target: "core", verb: "vault-check" })}
          disabled={check.isPending}
          data-vault-check
        >
          {check.isPending ? "Checking…" : "Run vault check"}
        </Button>
        {receipt && (
          <p
            className={`text-meta ${RECEIPT_TONE_CLASS[receipt.tone]}`}
            role="status"
            data-vault-check-receipt={receipt.tone}
          >
            {receipt.text}
          </p>
        )}
      </div>
    </div>
  );
}
