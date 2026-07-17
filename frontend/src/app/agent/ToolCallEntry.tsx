// Transcript sub-parts (ADR D3): the collapsed-by-default tool-call entry with
// per-call SERVED status, the dimmed cost-labeled thinking block, and the inline
// tool-permission prompt — an in-transcript entry, NEVER a dialog.
//
// Honesty contract: every status word maps from a SERVED wire token — the
// tool-execute `disposition` (`dispatched` / `awaiting_permission` / `refused` /
// `already_handled`) and the permission-decision outcome (`granted`/`denied`) —
// exactly the `EditorStatus` discipline; nothing here derives a state. The
// thinking block renders ONLY when a reasoning segment was actually recorded
// (no wire carries reasoning today, so it is absent, never faked; see
// `stores/view/agentTranscript`).
//
// Layer ownership (architecture-boundaries): dumb app chrome. Allow/Deny drive
// the two-write decision the D3 ruling names: first the AUTHORITATIVE gate flip
// (`useDecideToolPermission`, ambient actor token) whose served outcome is written
// back onto the annex record through `resolveAgentToolPermission`, then the
// interrupt resume (`useResumeInterrupt`) that CLOSES the durable recovery record
// with the SAME typed decision. Both are replay-safe, so a crash between them
// recovers by re-driving both. Expand/collapse is view-local state on the one
// shared `FoldSection` disclosure grammar.

import { useState } from "react";
import { Wrench } from "lucide-react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import type { MessageDescriptor } from "../../platform/localization/message";
import { authoredDisplayText } from "../../platform/localization/displayText";
import { useDecideToolPermission, useResumeInterrupt } from "../../stores/server/agent";
import {
  resolveAgentToolPermission,
  type AgentThinkingSegment,
  type AgentToolCallRecord,
} from "../../stores/view/agentTranscript";
import { Button, FoldSection, SectionLabel } from "../kit";

const MSG = {
  thinking: "common:agent.transcript.thinking",
  thinkingDuration: "common:agent.transcript.thinkingDuration",
  toolInput: "common:agent.transcript.toolInput",
  toolResult: "common:agent.transcript.toolResult",
  permissionQuestion: "common:agent.transcript.permissionQuestion",
  allow: "common:agent.transcript.allow",
  deny: "common:agent.transcript.deny",
  permissionFailed: "common:agent.transcript.permissionFailed",
} as const;

/** The bounded presentation states a tool-call row can show. Each resolves from
 *  served tokens only: the permission outcome (once decided) wins over the
 *  execute disposition it settles. */
export type ToolCallStatusToken =
  | "done"
  | "needsPermission"
  | "allowed"
  | "denied"
  | "notAllowed";

/** Served status token -> plain label (mapped like `EditorStatus`). */
const TOOL_STATUS_MESSAGE: Readonly<Record<ToolCallStatusToken, MessageDescriptor>> = {
  done: { key: "common:agent.transcript.toolStatus.done" },
  needsPermission: { key: "common:agent.transcript.toolStatus.needsPermission" },
  allowed: { key: "common:agent.transcript.toolStatus.allowed" },
  denied: { key: "common:agent.transcript.toolStatus.denied" },
  notAllowed: { key: "common:agent.transcript.toolStatus.notAllowed" },
};

/** Status token -> `status/*` dot tone class (bound tokens, never raw hex). */
const TOOL_STATUS_DOT: Readonly<Record<ToolCallStatusToken, string>> = {
  done: "bg-state-complete",
  needsPermission: "bg-state-stale",
  allowed: "bg-state-complete",
  denied: "bg-state-broken",
  notAllowed: "bg-state-broken",
};

/** Resolve a record's presentation status from its SERVED tokens. Pure so the
 *  matrix test drives it directly. `awaiting` is true exactly when the inline
 *  permission prompt belongs on the row (open request, no decision yet). */
export function toolCallStatus(record: AgentToolCallRecord): {
  status: ToolCallStatusToken;
  awaiting: boolean;
} {
  if (record.permission === "denied") return { status: "denied", awaiting: false };
  if (record.permission === "granted") return { status: "allowed", awaiting: false };
  switch (record.disposition) {
    case "awaiting_permission":
      return { status: "needsPermission", awaiting: true };
    case "refused":
      return { status: "notAllowed", awaiting: false };
    case "dispatched":
    case "already_handled":
      return { status: "done", awaiting: false };
  }
}

/** Bounded JSON rendering for the expand body — the row must never flood the
 *  panel with an unbounded payload. */
export function boundedJson(value: unknown, cap = 2_000): string | null {
  if (value == null) return null;
  let text: string;
  try {
    text = JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    text = String(value);
  }
  return text.length > cap ? `${text.slice(0, cap)}…` : text;
}

/** The dimmed, collapsed, cost-labeled thinking block. Renders NOTHING when no
 *  reasoning segment exists — an empty thinking block is a fake. */
export function ThinkingEntry({ segment }: { segment: AgentThinkingSegment | null }) {
  const resolveMessage = useLocalizedMessageResolver();
  const [open, setOpen] = useState(false);
  if (segment === null || segment.text.length === 0) return null;
  const label =
    segment.durationMs === null
      ? resolveMessage({ key: MSG.thinking }).message
      : resolveMessage({
          key: MSG.thinkingDuration,
          // Locale number formatting rides the catalog's own `number` format;
          // the tenth-of-a-second rounding is data, not presentation.
          values: { seconds: Math.round(segment.durationMs / 100) / 10 },
        }).message;
  return (
    <FoldSection
      open={open}
      onToggle={() => setOpen((value) => !value)}
      label={<span className="truncate text-meta text-ink-faint">{label}</span>}
      data-transcript-thinking
      bodyClassName="px-fg-3 py-fg-1"
    >
      <p className="whitespace-pre-wrap text-meta text-ink-faint">{segment.text}</p>
    </FoldSection>
  );
}

/** The inline tool-permission prompt (Figma 1225:4519): the question line + doc
 *  sub-line + Deny/Allow pair, rendered INSIDE the transcript while the request
 *  is open. Allow/Deny post the real decision; the SERVED outcome
 *  (granted/denied) lands back on the annex record. */
function ToolPermissionPrompt({ record }: { record: AgentToolCallRecord }) {
  const resolveMessage = useLocalizedMessageResolver();
  const decide = useDecideToolPermission();
  const resumeInterrupt = useResumeInterrupt();
  const [failed, setFailed] = useState(false);
  const deciding = decide.isPending || resumeInterrupt.isPending;

  const submit = async (decision: "approve" | "reject") => {
    setFailed(false);
    try {
      // (1) The AUTHORITATIVE gate flip: a granted decision lets the same
      // tool_call_id proceed on re-execute; a denial refuses it.
      const outcome = await decide.mutateAsync({
        toolCallId: record.toolCallId,
        payload: { decision },
      });
      resolveAgentToolPermission(record.toolCallId, outcome.status);
      // (2) Close the durable interrupt record with the SAME typed decision (D3
      // ruling). Nothing auto-resolves the interrupt on decide, so this second
      // write is what lets a reloaded panel see the prompt as resolved. Skipped
      // only when the awaiting arm carried no interrupt id (defensive).
      if (record.interruptId !== null) {
        await resumeInterrupt.mutateAsync({
          interruptId: record.interruptId,
          payload: { decision: { decision } },
        });
      }
    } catch {
      // Either write did not land; surface it inline and keep the prompt so the
      // operator can retry — both writes are replay-safe, so a retry re-drives
      // decide then resume and converges. Never silently drop a pending gate.
      setFailed(true);
    }
  };

  return (
    <div
      role="group"
      aria-label={
        resolveMessage({
          key: MSG.permissionQuestion,
          values: { tool: authoredDisplayText(record.tool) },
        }).message
      }
      data-transcript-permission={record.toolCallId}
      className="flex flex-col gap-fg-1-5 rounded-fg-md border border-rule bg-paper-raised px-fg-2 py-fg-1-5"
    >
      <p className="flex items-center gap-fg-1 text-label text-ink">
        <span aria-hidden className="size-fg-2 shrink-0 rounded-full bg-state-stale" />
        {
          resolveMessage({
            key: MSG.permissionQuestion,
            values: { tool: authoredDisplayText(record.tool) },
          }).message
        }
      </p>
      {record.detail !== null && (
        <p className="text-meta text-ink-muted">{record.detail}</p>
      )}
      {failed && (
        <p role="status" className="text-meta text-state-broken">
          {resolveMessage({ key: MSG.permissionFailed }).message}
        </p>
      )}
      <div className="flex items-center justify-end gap-fg-2">
        <Button
          variant="secondary"
          disabled={deciding}
          onClick={() => void submit("reject")}
          data-permission-deny
        >
          {resolveMessage({ key: MSG.deny }).message}
        </Button>
        <Button
          variant="primary"
          disabled={deciding}
          onClick={() => void submit("approve")}
          data-permission-allow
        >
          {resolveMessage({ key: MSG.allow }).message}
        </Button>
      </div>
    </div>
  );
}

/** One collapsed tool-call row: kind glyph + tool name + trailing served status
 *  (dot tone + word), expanding to the bounded args/result. The permission
 *  prompt renders under the row only while its request is open AND the run is
 *  still live (deciding a settled run's stale request would be theater). */
export function ToolCallEntry({
  record,
  live,
}: {
  record: AgentToolCallRecord;
  live: boolean;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const [open, setOpen] = useState(false);
  const { status, awaiting } = toolCallStatus(record);
  const statusLabel = resolveMessage(TOOL_STATUS_MESSAGE[status]).message;
  const input = boundedJson(record.input);
  const result = boundedJson(record.result);
  return (
    <div className="flex flex-col gap-fg-1">
      <FoldSection
        open={open}
        onToggle={() => setOpen((value) => !value)}
        leading={<Wrench size={12} aria-hidden className="shrink-0 text-ink-faint" />}
        label={
          <span className="truncate text-label text-ink">
            {authoredDisplayText(record.tool)}
          </span>
        }
        trailing={
          <span
            className="flex shrink-0 items-center gap-fg-1 text-meta text-ink-muted"
            data-tool-status={status}
          >
            <span
              aria-hidden
              className={`size-fg-2 shrink-0 rounded-full ${TOOL_STATUS_DOT[status]}`}
            />
            {statusLabel}
          </span>
        }
        data-transcript-tool-call={record.toolCallId}
        bodyClassName="flex flex-col gap-fg-1 px-fg-3 py-fg-1"
      >
        {input !== null && (
          <div>
            <SectionLabel>
              {resolveMessage({ key: MSG.toolInput }).message}
            </SectionLabel>
            <pre className="overflow-x-auto rounded-fg-sm bg-paper-sunken p-fg-2 text-caption text-ink-muted">
              {input}
            </pre>
          </div>
        )}
        {result !== null && (
          <div>
            <SectionLabel>
              {resolveMessage({ key: MSG.toolResult }).message}
            </SectionLabel>
            <pre className="overflow-x-auto rounded-fg-sm bg-paper-sunken p-fg-2 text-caption text-ink-muted">
              {result}
            </pre>
          </div>
        )}
      </FoldSection>
      {awaiting && live && <ToolPermissionPrompt record={record} />}
    </div>
  );
}
