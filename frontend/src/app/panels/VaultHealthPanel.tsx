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
import { CONTROL_PANEL_VOCABULARY } from "../../stores/view/controlPanelVocabulary";
import { Button } from "../kit";

/** Projected status word and visual tone. */
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
  unknown: "text-ink-muted",
};

const RECEIPT_TONE_CLASS: Record<OpsReceipt["tone"], string> = {
  ok: "text-state-active",
  failed: "text-state-broken",
  down: "text-state-stale",
};

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Derive the status shown from the interpreted project state. */
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

/** Project health status and check action. */
export function VaultHealthPanel() {
  const projectHealthLabel = useLocalizedMessage(
    CONTROL_PANEL_VOCABULARY["vault-health"].label,
  );
  const core = useCoreStatus();
  const view = deriveVaultHealthView(core);
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
