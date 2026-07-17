// Project-health summary and its on-demand check action.

import {
  HEALTHY_VAULT_WORDS,
  useCoreStatus,
  type CoreStatusView,
  type FrameworkStatusTone,
} from "../../stores/server/queries";
import { useOpsRunMutation } from "../../stores/view/opsRun";
import { useOpsReceipt } from "../../stores/view/opsReceipt";
import type { OpsReceipt } from "../../stores/server/queries";
import { useLocalizedMessage } from "../../platform/localization/LocalizationProvider";
import type { MessageDescriptor } from "../../platform/localization/message";
import { CONTROL_PANEL_VOCABULARY } from "../../stores/view/controlPanelVocabulary";
import { Button } from "../kit";

/** Projected status word and visual tone. The word is a fail-closed catalog
 *  descriptor — the served vault-health token is classified into a closed
 *  vocabulary, never echoed back title-cased. */
export interface VaultHealthView {
  tone: FrameworkStatusTone;
  word: MessageDescriptor;
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
  unknown: "text-ink-muted",
};

const RECEIPT_TONE_CLASS: Record<OpsReceipt["tone"], string> = {
  ok: "text-state-active",
  failed: "text-state-broken",
  down: "text-state-stale",
};

/** Derive the status shown from the interpreted project state. The served
 *  vault-health token is classified into the closed `vaultHealth` vocabulary:
 *  healthy words resolve to "Healthy", anything else the engine serves is a real
 *  condition and fails closed to "Needs attention" — the raw token is never
 *  surfaced. */
export function deriveVaultHealthView(
  core: Pick<CoreStatusView, "loading" | "errored" | "reachable" | "vaultHealth">,
): VaultHealthView {
  if (core.errored || (!core.reachable && !core.loading)) {
    return { tone: "down", word: { key: "common:vaultHealth.unreachable" } };
  }
  if (core.loading) {
    return { tone: "unknown", word: { key: "common:vaultHealth.checking" } };
  }
  const raw = core.vaultHealth?.trim();
  if (!raw) return { tone: "ok", word: { key: "common:vaultHealth.healthy" } };
  const healthy = HEALTHY_VAULT_WORDS.has(raw.toLowerCase());
  return healthy
    ? { tone: "ok", word: { key: "common:vaultHealth.healthy" } }
    : { tone: "attention", word: { key: "common:vaultHealth.attention" } };
}

/** Project health status and check action. */
export function VaultHealthPanel() {
  const checkingLabel = useLocalizedMessage({
    key: "common:systemStatus.states.checking",
  });
  const checkVaultLabel = useLocalizedMessage({
    key: "operations:actions.checkVault",
  });
  const projectHealthLabel = useLocalizedMessage(
    CONTROL_PANEL_VOCABULARY["vault-health"].label,
  );
  const core = useCoreStatus();
  const view = deriveVaultHealthView(core);
  const healthWord = useLocalizedMessage(view.word);
  const check = useOpsRunMutation();
  // Show only the receipt produced by this panel's action.
  const lastReceipt = useOpsReceipt();
  const receipt = lastReceipt?.verb === "vault-check" ? lastReceipt : null;

  return (
    <div className="flex flex-col gap-fg-3 px-fg-4 py-fg-3" data-vault-health-panel>
      <div className="flex items-center gap-fg-2" data-vault-health-word>
        <span
          aria-hidden
          className={`size-fg-2 shrink-0 rounded-full ${TONE_DOT_CLASS[view.tone]}`}
        />
        <span className="min-w-0 flex-1 truncate text-body text-ink">
          {projectHealthLabel}
        </span>
        <span className={`shrink-0 text-meta ${TONE_TEXT_CLASS[view.tone]}`}>
          {healthWord}
        </span>
      </div>

      <div className="flex flex-col gap-fg-2">
        <Button
          variant="secondary"
          onClick={() => check.mutate({ target: "core", verb: "vault-check" })}
          disabled={check.isPending}
          data-vault-check
        >
          {check.isPending ? checkingLabel : checkVaultLabel}
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
