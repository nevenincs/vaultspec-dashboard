// Modal host for the three global control panels — Search service, Backend health,
// Vault health. Review is NOT here: its queue folded into the Agent panel as a
// "Pending changes" view (review-surface-flow ADR F1), reached from the footer
// review chip. Closed panel bodies remain unmounted.

import { Dialog } from "../chrome/Dialog";
import { useLocalizedMessage } from "../../platform/localization/LocalizationProvider";
import {
  closeControlPanel,
  useOpenControlPanel,
} from "../../stores/view/controlPanels";
import { CONTROL_PANEL_VOCABULARY } from "../../stores/view/controlPanelVocabulary";
import { BackendHealthPanel } from "./BackendHealthPanel";
import { VaultHealthPanel } from "./VaultHealthPanel";
import { A2aLifecyclePanel } from "./A2aLifecyclePanel";
import { RagJobDashboard } from "./RagJobDashboard";
import { RagDashboardFooter } from "./RagDashboardFooter";

export function ControlPanels() {
  const open = useOpenControlPanel();
  const searchLabel = useLocalizedMessage(
    CONTROL_PANEL_VOCABULARY["search-service"].label,
  );
  const systemStatusLabel = useLocalizedMessage(
    CONTROL_PANEL_VOCABULARY["backend-health"].label,
  );
  const projectHealthLabel = useLocalizedMessage(
    CONTROL_PANEL_VOCABULARY["vault-health"].label,
  );
  const agentServiceLabel = useLocalizedMessage(
    CONTROL_PANEL_VOCABULARY["agent-service"].label,
  );
  return (
    <>
      <Dialog
        open={open === "search-service"}
        onClose={closeControlPanel}
        title={searchLabel}
        size="wide"
        footer={<RagDashboardFooter />}
      >
        <RagJobDashboard />
      </Dialog>
      <Dialog
        open={open === "backend-health"}
        onClose={closeControlPanel}
        title={systemStatusLabel}
      >
        <BackendHealthPanel />
      </Dialog>
      <Dialog
        open={open === "vault-health"}
        onClose={closeControlPanel}
        title={projectHealthLabel}
      >
        <VaultHealthPanel />
      </Dialog>
      <Dialog
        open={open === "agent-service"}
        onClose={closeControlPanel}
        title={agentServiceLabel}
      >
        <A2aLifecyclePanel />
      </Dialog>
    </>
  );
}
