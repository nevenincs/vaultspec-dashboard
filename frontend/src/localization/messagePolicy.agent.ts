// The agent-surface slice of the English message policy (panel, transcript,
// composer, footer chip) — spread into `ENGLISH_MESSAGE_POLICY` exactly like the
// sibling domain slices (`messagePolicy.shell`, `messagePolicy.filters`, …).

import type { MessageKey } from "../platform/localization/message";
import type { MessagePolicyEntry } from "./messagePolicy";

export const AGENT_MESSAGE_POLICY = {
  "common:agent.sendComment": { role: "action" },
  // The two segment options name operation MODES (radio-style labels the control
  // selects), not imperative action buttons — classified as labels like the other
  // segmented-toggle option names.
  "common:agent.autonomy.label": { role: "label" },
  "common:agent.autonomy.reviewEach": { role: "label" },
  "common:agent.autonomy.applyAutomatically": { role: "label" },
  "common:agent.actions.openPanel": { role: "action" },
  "common:agent.actions.closePanel": { role: "action" },
  "common:agent.actions.togglePanel": { role: "action" },
  "common:agent.actions.stopRun": { role: "action" },
  "common:agent.actions.newSession": { role: "action" },
  // The rail-footer pending-changes chip, retired out of the "Approvals"/
  // `panel:approvals` vocabulary onto the agent plane it actually opens.
  // The begin idiom (research G1/G2/G4/G11): the headline is a question addressed
  // to the user, the starters are intent verbs, and the seeds are draft text the
  // user continues typing — not commands.
  "common:agent.begin.headline": { role: "label" },
  "common:agent.begin.headlineUnbound": { role: "label" },
  "common:agent.begin.startersLabel": { role: "accessibility" },
  "common:agent.begin.recentsLabel": { role: "accessibility" },
  // The starters NAME an intent the click seeds into the draft; they do not perform
  // it. That makes them option labels, like the segmented-toggle option names above,
  // not imperative command buttons.
  "common:agent.begin.starters.explore": { role: "label" },
  "common:agent.begin.starters.build": { role: "label" },
  "common:agent.begin.starters.review": { role: "label" },
  "common:agent.begin.seeds.explore": { role: "label" },
  "common:agent.begin.seeds.build": { role: "label" },
  "common:agent.begin.seeds.review": { role: "label" },
  // The standing elevated-autonomy strip (C7). A warning about a live policy, so
  // it is a status, not an error the user caused.
  "common:agent.autonomyBanner.warning": { role: "status" },
  "common:agent.autonomyBanner.dismiss": { role: "action" },
  // The docked run header (C5): a region name, the served phase rendered verbatim,
  // and the roster eyebrow.
  "common:agent.runHeader.region": { role: "accessibility" },
  "common:agent.runHeader.phase": { role: "label" },
  "common:agent.runHeader.roster": { role: "label" },
  "common:agent.pending.label": { role: "label" },
  "common:agent.pending.show": { role: "action" },
  "common:agent.pending.hide": { role: "action" },
  "common:agent.pending.unavailable": { role: "error-title" },
  "common:agent.panel.region": { role: "label" },
  "common:agent.panel.sessionsMenu": { role: "accessibility" },
  // "New session" is the Figma-bound noun-phrase menu name (like "New document"),
  // not imperative copy — classified as a label, mirroring that precedent.
  "common:agent.panel.newSession": { role: "label" },
  "common:agent.panel.endConversation": { role: "label" },
  "common:agent.panel.recentSessions": { role: "label" },
  "common:agent.panel.untitledSession": { role: "label" },
  "common:agent.panel.close": { role: "accessibility" },
  "common:agent.panel.view.switcher": { role: "accessibility" },
  // The two view names the switcher selects (radio-style segmented labels), not
  // imperative action buttons — classified as labels like the autonomy segments.
  "common:agent.panel.view.transcript": { role: "label" },
  "common:agent.panel.view.pending": { role: "label" },
  "common:agent.transcript.loading": { role: "status" },
  "common:agent.transcript.empty": { role: "status" },
  "common:agent.transcript.noSession": { role: "status" },
  "common:agent.transcript.error": { role: "error-message" },
  "common:agent.transcript.showingRecent": { role: "status" },
  // The one work-stretch disclosure (C2/C3): its label reports elapsed time or the
  // served tool count, and the expanded flat list is named for screen readers.
  "common:agent.transcript.timeline": { role: "accessibility" },
  "common:agent.transcript.usedTools": { role: "label" },
  "common:agent.transcript.workedFor": { role: "label" },
  "common:agent.transcript.thinking": { role: "label" },
  "common:agent.transcript.thinkingDuration": { role: "label" },
  "common:agent.transcript.toolInput": { role: "label" },
  "common:agent.transcript.toolResult": { role: "label" },
  "common:agent.transcript.toolStatus.done": { role: "status" },
  "common:agent.transcript.toolStatus.needsPermission": { role: "status" },
  "common:agent.transcript.toolStatus.allowed": { role: "status" },
  "common:agent.transcript.toolStatus.denied": { role: "status" },
  "common:agent.transcript.toolStatus.notAllowed": { role: "status" },
  "common:agent.transcript.turnStatus.working": { role: "status" },
  "common:agent.transcript.turnStatus.stopping": { role: "status" },
  "common:agent.transcript.turnStatus.done": { role: "status" },
  "common:agent.transcript.turnStatus.stopped": { role: "status" },
  "common:agent.transcript.turnStatus.failed": { role: "status" },
  "common:agent.transcript.permissionQuestion": { role: "label" },
  "common:agent.transcript.allow": { role: "action" },
  "common:agent.transcript.deny": { role: "action" },
  "common:agent.transcript.permissionFailed": { role: "error-message" },
  "common:agent.transcript.team.thinking": { role: "label" },
  "common:agent.transcript.team.thinkingLive": { role: "label" },
  "common:agent.transcript.team.working": { role: "status" },
  "common:agent.transcript.team.workingAgents": { role: "status" },
  "common:agent.transcript.team.callingTool": { role: "label" },
  "common:agent.transcript.team.result": { role: "label" },
  "common:agent.transcript.team.degraded": { role: "status" },
  "common:agent.transcript.team.error": { role: "error-message" },
  "common:agent.composer.placeholder": { role: "label" },
  "common:agent.composer.steerPlaceholder": { role: "label" },
  "common:agent.composer.send": { role: "action" },
  "common:agent.composer.sendFailed": { role: "error-message" },
  "common:agent.composer.attachContext": { role: "action" },
  "common:agent.composer.attachedContext": { role: "accessibility" },
  "common:agent.composer.evidenceAria": { role: "accessibility" },
  "common:agent.composer.evidencePlaceholder": { role: "label" },
  "common:agent.composer.evidenceEmpty": { role: "status" },
  "common:agent.composer.queuedChip": { role: "label" },
  "common:agent.composer.removeQueued": { role: "accessibility" },
  "common:agent.composer.mentionPlaceholder": { role: "label" },
  "common:agent.composer.mentionAria": { role: "accessibility" },
  "common:agent.composer.mentionEmpty": { role: "status" },
  "common:agent.composer.removeMention": { role: "accessibility" },
  "common:agent.composer.commentBatch": { role: "label" },
  "common:agent.composer.removeComments": { role: "accessibility" },
  "common:agent.composer.slashAria": { role: "accessibility" },
  "common:agent.composer.slashEmpty": { role: "status" },
  "common:agent.composer.selectorValue": { role: "label" },
  "common:agent.composer.selectorDisabled": { role: "accessibility" },
  "common:agent.composer.model": { role: "label" },
  "common:agent.composer.modelDefault": { role: "label" },
  // Non-actionable unavailability reasons ride the `status` role, mirroring the
  // `common:disabledReasons.*` precedent (nothing the operator can do yet).
  "common:agent.composer.modelUnavailable": { role: "status" },
  "common:agent.composer.team": { role: "label" },
  "common:agent.composer.teamDefault": { role: "label" },
  "common:agent.composer.teamUnavailable": { role: "status" },
  "common:agent.composer.teamMenuAria": { role: "accessibility" },
  "common:agent.composer.teamPresetUnavailable": { role: "status" },
  "common:agent.composer.startTeamRun": { role: "action" },
  "common:agent.composer.cancelTeamRun": { role: "action" },
  "common:agent.composer.teamRunPhase": { role: "status" },
  "common:agent.composer.teamRunRefused": { role: "error-message" },
  "common:agent.composer.teamRunDegraded": { role: "status" },
  "common:agent.composer.teamRunDismiss": { role: "action" },
  "common:agent.composer.teamRunLocked": { role: "status" },
  "common:agent.chip.working": { role: "status" },
  "common:agent.chip.label": { role: "accessibility" },
  "common:agent.chip.status.active": { role: "status" },
  "common:agent.chip.status.cancelRequested": { role: "status" },
  // The bridge affordance's visible text names a COUNT/state of pending changes (a
  // chip-like label), not an imperative action button — classified as a label. The
  // truncated variant drops the numeral honestly.
  "common:agent.pendingBridge.count": { role: "label" },
  "common:agent.pendingBridge.more": { role: "label" },
} as const satisfies Partial<Record<MessageKey, MessagePolicyEntry>>;
