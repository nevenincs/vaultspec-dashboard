// The agent-service lifecycle slice of the English message policy
// (a2a-product-provisioning W05.P12) — the control panel that installs, runs, and
// maintains the local agents. Spread into `ENGLISH_MESSAGE_POLICY` exactly like the
// sibling domain slices (`messagePolicy.shell`, `messagePolicy.agent`, …), kept out
// of the base module so it stays under the module-size gate.

import type { MessageKey } from "../platform/localization/message";
import type { MessagePolicyEntry } from "./messagePolicy";

export const AGENT_SERVICE_MESSAGE_POLICY = {
  "common:controlPanels.labels.agentService": { role: "label" },
  "common:controlPanels.actions.showAgentService": { role: "action" },
  "common:controlPanels.actions.hideAgentService": { role: "action" },
  "common:controlPanels.unavailableTitles.agentService": { role: "error-title" },
  "common:agentService.description": { role: "description" },
  "common:agentService.statusLabel": { role: "accessibility" },
  "common:agentService.sections.status": { role: "label" },
  "common:agentService.sections.orchestration": { role: "label" },
  "common:agentService.sections.actions": { role: "label" },
  "common:agentService.sections.diagnostics": { role: "label" },
  "common:agentService.installState.absent": { role: "status" },
  "common:agentService.installState.settled": { role: "status" },
  "common:agentService.installState.recoveryRequired": { role: "status" },
  "common:agentService.installState.busy": { role: "status" },
  "common:agentService.installState.unverifiable": { role: "status" },
  "common:agentService.installState.unknown": { role: "status" },
  "common:agentService.readiness.uninstalled": { role: "status" },
  "common:agentService.readiness.stopped": { role: "status" },
  "common:agentService.readiness.running": { role: "status" },
  "common:agentService.readiness.workerIdle": { role: "status" },
  "common:agentService.ownership.owned": { role: "status" },
  "common:agentService.ownership.unowned": { role: "status" },
  "common:agentService.orchestration.available": { role: "status" },
  "common:agentService.orchestration.unavailable": { role: "status" },
  "common:agentService.ops.install": { role: "action" },
  "common:agentService.ops.ensure": { role: "action" },
  "common:agentService.ops.start": { role: "action" },
  "common:agentService.ops.stop": { role: "action" },
  "common:agentService.ops.restart": { role: "action" },
  "common:agentService.ops.repair": { role: "action" },
  "common:agentService.ops.update": { role: "action" },
  "common:agentService.ops.rollback": { role: "destructive-action" },
  "common:agentService.ops.remove": { role: "destructive-action" },
  "common:agentService.ops.doctor": { role: "action" },
  "common:agentService.activeGeneration": { role: "status" },
  "common:agentService.progress": { role: "status" },
  "common:agentService.runFailed": { role: "error-message" },
  "common:agentService.dataPreserved": { role: "description" },
  "common:agentService.outcome.succeeded": { role: "status" },
  "common:agentService.outcome.failed": { role: "error-message" },
  "common:agentService.confirm.remove.title": { role: "confirmation" },
  "common:agentService.confirm.remove.body": { role: "confirmation" },
  "common:agentService.confirm.remove.confirmLabel": { role: "confirmation" },
  "common:agentService.confirm.remove.cancelLabel": { role: "confirmation" },
  "common:agentService.confirm.rollback.title": { role: "confirmation" },
  "common:agentService.confirm.rollback.body": { role: "confirmation" },
  "common:agentService.confirm.rollback.confirmLabel": { role: "confirmation" },
  "common:agentService.confirm.rollback.cancelLabel": { role: "confirmation" },
} as const satisfies Partial<Record<MessageKey, MessagePolicyEntry>>;
