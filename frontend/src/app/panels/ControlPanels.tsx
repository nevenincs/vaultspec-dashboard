// The framework control-panel host (activity-rail-realignment ADR D3, S08). The
// rail is status-only; the four admin surfaces live in MODAL control panels on the
// Settings-dialog idiom — the one `Dialog` chrome primitive over the shared
// single-open view-store flag. Each panel mounts its body ONLY while open
// (mount-gating law): the heavy rag aggregate and review-queue reads fire on open,
// not while the rail merely renders.
//
// Two panels RE-MOUNT the existing console bodies unchanged — Search service hosts
// `RagOpsConsoleBody`, Approvals hosts `ReviewStationSection` — the moves are
// chrome-only re-homes (the consoles are glass over stores hooks). The two new
// bodies (Backend health, Vault health) render already-served but previously dark
// health planes.

import { Dialog } from "../chrome/Dialog";
import { RagOpsConsoleBody } from "../right/RagOpsConsole";
import { ReviewStationSection } from "../authoring/ReviewStation";
import {
  closeControlPanel,
  useOpenControlPanel,
} from "../../stores/view/controlPanels";
import { BackendHealthPanel } from "./BackendHealthPanel";
import { VaultHealthPanel } from "./VaultHealthPanel";

/**
 * Mount the four modal control panels once in the shell. The single open-id gates
 * which Dialog is open; a closed Dialog renders null, so its body is never mounted
 * (mount-gating). The re-mounted console bodies were rail SECTION bodies (no inset
 * of their own — the SectionCard supplied it), so they carry a panel inset here;
 * the two new health bodies inset themselves.
 */
export function ControlPanels() {
  const open = useOpenControlPanel();
  return (
    <>
      <Dialog
        open={open === "search-service"}
        onClose={closeControlPanel}
        title="Search service"
      >
        <div className="px-fg-4 py-fg-3">
          <RagOpsConsoleBody />
        </div>
      </Dialog>
      <Dialog open={open === "approvals"} onClose={closeControlPanel} title="Approvals">
        <div className="px-fg-4 py-fg-3">
          <ReviewStationSection />
        </div>
      </Dialog>
      <Dialog
        open={open === "backend-health"}
        onClose={closeControlPanel}
        title="Backend health"
      >
        <BackendHealthPanel />
      </Dialog>
      <Dialog
        open={open === "vault-health"}
        onClose={closeControlPanel}
        title="Vault health"
      >
        <VaultHealthPanel />
      </Dialog>
    </>
  );
}
