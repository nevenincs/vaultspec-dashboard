// The Agent panel composer uses one multiline input for three destinations,
// resolved by the
// pure `agentSubmitDestination` machine from the session snapshot's `active_run`
// and the staged interrupt:
//
//   idle (no run)      → Enter starts the next prompt turn (creating the session
//                        first when none is current — the ambient-token path).
//   run parked on an
//   interrupt          → the same input resumes the interrupt (steer); the
//                        placeholder reflects it. Zero new chrome.
//   run streaming      → Enter holds the queued prompt client-side, rendered
//                        as a removable "Queued" chip and dispatched as the next
//                        turn when the run settles. Exactly one slot, latest wins.
//
// The input NEVER locks during a run. Enter submits; Shift+Enter newlines. `/` at
// column 0 opens an inline popover fed by the ONE command-provider registry
// (`useCommandPaletteCommandView` → `composerEligibleCommands`) — never a second
// command list. `@` at a word start opens the corpus picker (the shared
// `AutocompleteCombobox` over the editor linking corpus); selections render as
// removable chips above the input in one chip grammar shared with the comment
// batch and the queued slot. While a run streams, the Send slot is REPLACED in
// place by Stop (`cancelRun`) — one slot, one verb.
//
// Layer ownership (architecture-boundaries): dumb app chrome. All wire access is
// the `stores/server/agent` slice's hooks; attachment state is the
// `stores/view/agentComposer` chrome store. The arrow/enter/escape keys here are
// Class-B widget-intrinsic interaction (never the keymap registry), and consumed
// keys stop propagation so they never reach the global dispatcher.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Clock3, FileText, Hash, MessageSquareText, X } from "lucide-react";

import {
  useActiveLocale,
  useLocalizedMessageResolver,
} from "../../platform/localization/LocalizationProvider";
import {
  createCountMessageDescriptor,
  type MessageDescriptor,
} from "../../platform/localization/message";
import {
  resolveActionPresentation,
  type ActionPresentationResolver,
} from "../../platform/actions/action";
import { authoredDisplayText } from "../../platform/localization/displayText";
import { useActiveScope, useEditorLinkingCorpus } from "../../stores/server/queries";
import {
  useCreateSession,
  useResumeInterrupt,
  useSession,
  useStartTurn,
} from "../../stores/server/agent";
import {
  setAgentCurrentSession,
  useAgentCurrentSessionId,
} from "../../stores/view/agentPanel";
import { agentStopRunAction } from "../../stores/view/agentActions";
import {
  AGENT_COMPOSER_MENTION_CAP,
  AGENT_COMPOSER_TEXT_CAP,
  buildAgentPrompt,
  agentSubmitDestination,
  stageAgentInterrupt,
  useAgentComposer,
  useAgentCommentBatch,
  useAgentMentions,
  useAgentPendingInterrupt,
  useAgentQueuedPrompt,
  type AgentMention,
} from "../../stores/view/agentComposer";
import {
  useCommandPaletteCommandView,
  type CommandDescriptor,
} from "../../stores/view/commandPaletteCommands";
import { AutocompleteCombobox, type ComboOption } from "../viewer/AutocompleteCombobox";
import { Button, DropdownButton, Popover } from "../kit";

const MSG = {
  idlePlaceholder: "common:agent.composer.placeholder",
  steerPlaceholder: "common:agent.composer.steerPlaceholder",
  send: "common:agent.composer.send",
  stop: "common:agent.composer.stop",
  sendFailed: "common:agent.composer.sendFailed",
  attachedContext: "common:agent.composer.attachedContext",
  queuedChip: "common:agent.composer.queuedChip",
  removeQueued: "common:agent.composer.removeQueued",
  mentionPlaceholder: "common:agent.composer.mentionPlaceholder",
  mentionAria: "common:agent.composer.mentionAria",
  mentionEmpty: "common:agent.composer.mentionEmpty",
  removeMention: "common:agent.composer.removeMention",
  removeComments: "common:agent.composer.removeComments",
  slashAria: "common:agent.composer.slashAria",
  slashEmpty: "common:agent.composer.slashEmpty",
  model: "common:agent.composer.model",
  modelDefault: "common:agent.composer.modelDefault",
  modelUnavailable: "common:agent.composer.modelUnavailable",
  selectorValue: "common:agent.composer.selectorValue",
  selectorDisabled: "common:agent.composer.selectorDisabled",
  team: "common:agent.composer.team",
  teamDefault: "common:agent.composer.teamDefault",
  teamUnavailable: "common:agent.composer.teamUnavailable",
} as const;

/** Cap the slash popover's rendered rows (bounded-by-default). */
export const COMPOSER_SLASH_RESULTS_CAP = 12;

/** The composer-eligible subset of the one command plane: directly runnable
 *  store-only commands. Arm-to-confirm and typed-confirmation commands stay with
 *  the palette (which owns the confirmation choreography); disabled commands
 *  never surface here (the popover is a quick-fire lane, not a browse surface). */
export function composerEligibleCommands(
  commands: readonly CommandDescriptor[],
): CommandDescriptor[] {
  return commands.filter(
    (command) =>
      command.disabled !== true &&
      command.confirm !== true &&
      command.confirmation === undefined &&
      typeof command.run === "function",
  );
}

/** Filter eligible commands by the typed slash query over their RESOLVED labels
 *  (every token must match), capped. Pure so the matrix test drives it directly. */
export function filterComposerCommands(
  commands: readonly { label: string }[],
  query: string,
): number[] {
  const needle = query.trim().toLowerCase();
  const tokens = needle.split(/\s+/).filter(Boolean);
  const out: number[] = [];
  for (let i = 0; i < commands.length; i += 1) {
    const label = commands[i]!.label.toLowerCase();
    if (tokens.every((token) => label.includes(token))) {
      out.push(i);
      if (out.length >= COMPOSER_SLASH_RESULTS_CAP) break;
    }
  }
  return out;
}

/** A bounded session title derived from the first prompt (user-authored data,
 *  never a UI literal). */
function sessionTitleFromPrompt(prompt: string): string {
  const firstLine = prompt.split("\n", 1)[0] ?? "";
  return firstLine.slice(0, 64);
}

/** True when the caret position makes a typed `@` a mention trigger: at the
 *  start, or after whitespace — so an email address or a code decorator typed
 *  mid-word never hijacks the input. */
export function isMentionTrigger(text: string, caret: number): boolean {
  if (caret <= 0) return true;
  const before = text[caret - 1] ?? "";
  return /\s/.test(before);
}

/** One attached-context chip (the shared pill grammar: leading kind glyph +
 *  label + ×). Mentions, the D6 comment batch, and the queued prompt all render
 *  through this one part — one attachment treatment, never a parallel one. */
function ComposerChip({
  glyph,
  label,
  removeLabel,
  onRemove,
  data,
}: {
  glyph: ReactNode;
  label: string;
  removeLabel: string;
  onRemove: () => void;
  data: string;
}) {
  return (
    <span
      className="inline-flex min-w-0 shrink-0 items-center gap-fg-1 rounded-fg-pill border border-rule bg-paper-sunken px-fg-2 py-fg-0-5 text-meta font-medium text-ink-muted"
      data-composer-chip={data}
    >
      <span aria-hidden className="shrink-0 text-ink-faint">
        {glyph}
      </span>
      <span className="min-w-0 select-text truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="inline-flex shrink-0 rounded-fg-xs text-ink-faint transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
      >
        <X size={12} aria-hidden />
      </button>
    </span>
  );
}

/** The attached-context chip row above the input: `@`-mention chips, the D6
 *  "N comments" batch chip, and the D4 queued-prompt chip — one grammar. */
function ComposerChipRow() {
  const resolveMessage = useLocalizedMessageResolver();
  const mentions = useAgentMentions();
  const commentBatch = useAgentCommentBatch();
  const queuedPrompt = useAgentQueuedPrompt();
  if (mentions.length === 0 && commentBatch === null && queuedPrompt === null) {
    return null;
  }
  return (
    <ul
      className="flex flex-wrap gap-fg-1"
      aria-label={resolveMessage({ key: MSG.attachedContext }).message}
      data-composer-chips
    >
      {queuedPrompt !== null && (
        <li>
          <ComposerChip
            glyph={<Clock3 size={12} aria-hidden />}
            label={resolveMessage({ key: MSG.queuedChip }).message}
            removeLabel={resolveMessage({ key: MSG.removeQueued }).message}
            onRemove={() => useAgentComposer.getState().setQueuedPrompt(null)}
            data="queued"
          />
        </li>
      )}
      {commentBatch !== null && (
        <li>
          <ComposerChip
            glyph={<MessageSquareText size={12} aria-hidden />}
            label={
              resolveMessage(
                createCountMessageDescriptor(
                  "common:agent.composer.commentBatch",
                  commentBatch.count,
                )!,
              ).message
            }
            removeLabel={resolveMessage({ key: MSG.removeComments }).message}
            onRemove={() => useAgentComposer.getState().stageCommentBatch(null)}
            data="comments"
          />
        </li>
      )}
      {mentions.map((mention) => (
        <li key={mention.value}>
          <ComposerChip
            glyph={
              mention.kind === "feature" ? (
                <Hash size={12} aria-hidden />
              ) : (
                <FileText size={12} aria-hidden />
              )
            }
            label={mention.label}
            removeLabel={
              resolveMessage({
                key: MSG.removeMention,
                values: { label: authoredDisplayText(mention.label) },
              }).message
            }
            onRemove={() => useAgentComposer.getState().removeMention(mention.value)}
            data={mention.kind}
          />
        </li>
      ))}
    </ul>
  );
}

/** The `@` corpus picker: the shared AutocompleteCombobox over the editor
 *  linking corpus (features + documents), hosted in a dismissable popover above
 *  the input. Committing adds a chip and returns focus to the input. */
function ComposerMentionPicker({
  onDismiss,
  inputRef,
}: {
  onDismiss: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const scope = useActiveScope();
  const locale = useActiveLocale();
  const corpus = useEditorLinkingCorpus(scope, locale);
  const mentions = useAgentMentions();
  const containerRef = useRef<HTMLDivElement>(null);

  const options = useMemo<ComboOption[]>(() => {
    const taken = new Set(mentions.map((m) => m.value));
    const features = corpus.featureTags
      .filter((tag) => !taken.has(tag))
      .map((tag) => ({ value: `feature:${tag}`, primary: tag, docType: "feature" }));
    const documents = corpus.documents
      .filter((doc) => !taken.has(doc.stem))
      .map((doc) => ({
        value: `doc:${doc.stem}`,
        primary: doc.title,
        secondary: doc.stem,
        ...(doc.feature === null ? {} : { docType: doc.feature }),
      }));
    return [...features, ...documents];
  }, [corpus, mentions]);

  // Land focus in the picker's search field the moment it opens (the `@` key
  // never inserts; the picker is the continuation of the keystroke).
  useEffect(() => {
    containerRef.current?.querySelector("input")?.focus();
  }, []);

  const commit = (value: string) => {
    const mention: AgentMention | null = value.startsWith("feature:")
      ? { kind: "feature", value: value.slice(8), label: value.slice(8) }
      : value.startsWith("doc:")
        ? {
            kind: "document",
            value: value.slice(4),
            label:
              corpus.documents.find((doc) => doc.stem === value.slice(4))?.title ??
              value.slice(4),
          }
        : null;
    if (mention !== null) useAgentComposer.getState().addMention(mention);
    onDismiss();
  };

  return (
    <Popover
      open
      onDismiss={onDismiss}
      returnFocusRef={inputRef}
      role="dialog"
      aria-label={resolveMessage({ key: MSG.mentionAria }).message}
      className="absolute inset-x-0 bottom-full z-40 mb-fg-1 rounded-fg-md border border-rule bg-paper-raised p-fg-1 shadow-fg-popover"
      data-composer-mention
    >
      <div ref={containerRef}>
        <AutocompleteCombobox
          options={options}
          onCommit={commit}
          clearOnCommit
          placeholder={resolveMessage({ key: MSG.mentionPlaceholder }).message}
          ariaLabel={resolveMessage({ key: MSG.mentionAria }).message}
          emptyLabel={resolveMessage({ key: MSG.mentionEmpty }).message}
        />
      </div>
    </Popover>
  );
}

interface SlashRow {
  command: CommandDescriptor;
  label: string;
}

/** The two disabled-with-reason selector pills (Model and Team). The wire
 *  serves no model options and no team presets; the pills
 *  render the honest single-agent default and carry their reason — never hidden,
 *  never a silently-dead control. */
function ComposerSelectorPills() {
  const resolveMessage = useLocalizedMessageResolver();
  const modelLabel = resolveMessage({ key: MSG.model }).message;
  const modelValue = resolveMessage({ key: MSG.modelDefault }).message;
  const modelReason = resolveMessage({ key: MSG.modelUnavailable }).message;
  const teamLabel = resolveMessage({ key: MSG.team }).message;
  const teamValue = resolveMessage({ key: MSG.teamDefault }).message;
  const teamReason = resolveMessage({ key: MSG.teamUnavailable }).message;
  const modelPill = resolveMessage({
    key: MSG.selectorValue,
    values: { selector: modelLabel, value: modelValue },
  }).message;
  const modelAria = resolveMessage({
    key: MSG.selectorDisabled,
    values: { selector: modelLabel, value: modelValue, reason: modelReason },
  }).message;
  const teamPill = resolveMessage({
    key: MSG.selectorValue,
    values: { selector: teamLabel, value: teamValue },
  }).message;
  const teamAria = resolveMessage({
    key: MSG.selectorDisabled,
    values: { selector: teamLabel, value: teamValue, reason: teamReason },
  }).message;
  return (
    <div className="flex min-w-0 items-center gap-fg-1">
      <span title={modelReason} data-composer-model>
        <DropdownButton
          label={modelPill}
          onClick={() => undefined}
          disabled
          ariaLabel={modelAria}
        />
      </span>
      <span title={teamReason} data-composer-team>
        <DropdownButton
          label={teamPill}
          onClick={() => undefined}
          disabled
          ariaLabel={teamAria}
        />
      </span>
    </div>
  );
}

/**
 * The composer. Mounts into the panel's composer slot; consumes the agent slice
 * hooks and the composer chrome store only.
 */
export function Composer() {
  const resolveMessage = useLocalizedMessageResolver();
  const scope = useActiveScope();
  const currentSessionId = useAgentCurrentSessionId();
  const session = useSession(currentSessionId);
  const createSession = useCreateSession();
  const startTurn = useStartTurn();
  const resumeInterrupt = useResumeInterrupt();

  const mentions = useAgentMentions();
  const pendingInterrupt = useAgentPendingInterrupt();
  const queuedPrompt = useAgentQueuedPrompt();

  const [text, setText] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [sendFailed, setSendFailed] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const submittingRef = useRef(false);
  const queueDispatchedRef = useRef(false);

  const activeRun = session.data?.active_run ?? null;
  const activeRunId = activeRun?.run_id ?? null;
  // The SERVED session status (bounded enum). Stopping a run cancels the whole
  // session on this plane, and a non-active session rejects every further turn —
  // so a non-active current session routes the next submit to a fresh session.
  const sessionStatus = session.data?.session.status ?? null;
  const destination = agentSubmitDestination({
    sessionId: currentSessionId,
    sessionStatus,
    activeRunId,
    pendingInterrupt,
  });

  // --- slash mode: `/` at column 0, fed by the command plane --------------------
  const commandView = useCommandPaletteCommandView();
  const slashMode = text.startsWith("/") && !slashDismissed;
  const slashQuery = slashMode ? text.slice(1) : "";
  const slashRows = useMemo<SlashRow[]>(() => {
    if (!slashMode) return [];
    const resolveDescriptor: ActionPresentationResolver = (descriptor) =>
      resolveMessage(descriptor as MessageDescriptor);
    const eligible = composerEligibleCommands(commandView.commands).map((command) => ({
      command,
      label: resolveActionPresentation(command.label, resolveDescriptor).message,
    }));
    return filterComposerCommands(eligible, slashQuery).map((i) => eligible[i]!);
  }, [slashMode, slashQuery, commandView.commands, resolveMessage]);
  const slashOpen = slashMode && slashRows.length > 0;
  const activeSlashIndex = Math.min(slashIndex, Math.max(0, slashRows.length - 1));

  const runSlashCommand = (row: SlashRow) => {
    setText("");
    setSlashIndex(0);
    row.command.run();
    inputRef.current?.focus();
  };

  // --- auto-grow: min 1 line, CSS max-height caps at ~5 lines then scrolls ------
  useEffect(() => {
    const el = inputRef.current;
    if (el === null) return;
    el.style.height = "auto";
    if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight / 16}rem`;
  }, [text]);

  // --- hygiene: an interrupt staged for a run that is no longer the active run
  // is stale — drop it so the input never steers a settled run (bounded, honest).
  useEffect(() => {
    if (
      pendingInterrupt !== null &&
      pendingInterrupt.runId !== null &&
      pendingInterrupt.runId !== activeRunId
    ) {
      stageAgentInterrupt(null);
    }
  }, [pendingInterrupt, activeRunId]);

  const createSessionAsync = createSession.mutateAsync;
  const startTurnAsync = startTurn.mutateAsync;

  /** Deliver one prompt: bootstrap a fresh session first when none is usable
   *  (no current session, or the current one is no longer active — Stop cancels
   *  the whole session on this plane), then start the turn. Shared by the submit
   *  path and the queued-dispatch effect so both take the SAME lane. */
  const deliverPrompt = useCallback(
    async (prompt: string, bootstrap: boolean) => {
      let sessionId = currentSessionId;
      let createdSession = false;
      if (bootstrap || sessionId === null) {
        const outcome = await createSessionAsync({
          scope: scope ?? "",
          title: sessionTitleFromPrompt(prompt),
        });
        // An in-flight replay means a concurrent identical create is already
        // running — never double-create; the lifecycle event will surface it.
        if (outcome.kind !== "settled") return;
        sessionId = outcome.session_id;
        createdSession = true;
      }
      await startTurnAsync({ sessionId, payload: { prompt } });
      if (createdSession) setAgentCurrentSession(sessionId);
    },
    [createSessionAsync, currentSessionId, scope, startTurnAsync],
  );

  // --- queued dispatch: the held prompt fires as the next turn the
  // moment the run settles — exactly once (the slot clears before the send; a
  // failed send restores it rather than losing the prompt). A settle-by-Stop
  // cancelled the whole session, so the dispatch bootstraps a fresh one.
  useEffect(() => {
    if (activeRunId !== null) {
      queueDispatchedRef.current = false;
      return;
    }
    const bootstrap = sessionStatus !== null && sessionStatus !== "active";
    if (
      queuedPrompt === null ||
      currentSessionId === null ||
      session.data === undefined ||
      (bootstrap && scope === null) ||
      queueDispatchedRef.current
    ) {
      return;
    }
    queueDispatchedRef.current = true;
    const prompt = queuedPrompt;
    useAgentComposer.getState().setQueuedPrompt(null);
    deliverPrompt(prompt, bootstrap).catch(() => {
      useAgentComposer.getState().setQueuedPrompt(prompt);
      setSendFailed(true);
    });
  }, [
    activeRunId,
    queuedPrompt,
    currentSessionId,
    session.data,
    sessionStatus,
    scope,
    deliverPrompt,
  ]);

  const submit = async () => {
    const prompt = buildAgentPrompt(text, mentions);
    if (prompt.length === 0) return;
    if (destination === "queue") {
      // Mid-run: hold the one queued slot (latest wins) — the input never locks.
      useAgentComposer.getState().setQueuedPrompt(prompt);
      setText("");
      useAgentComposer.getState().clearMentions();
      return;
    }
    // A session cannot be created without a resolved scope; hold the submit
    // (the button is disabled in this state, and Enter is a no-op).
    if (destination === "bootstrap" && scope === null) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSendFailed(false);
    try {
      if (destination === "steer" && pendingInterrupt !== null) {
        // D4: the same input resumes the parked run. The decision body is the
        // opaque domain JSON the engine stores verbatim; the steer grammar is
        // client-defined until the interrupt plane serves a decision schema.
        await resumeInterrupt.mutateAsync({
          interruptId: pendingInterrupt.interruptId,
          payload: { decision: { kind: "steer", prompt } },
        });
        stageAgentInterrupt(null);
      } else {
        await deliverPrompt(prompt, destination === "bootstrap");
      }
      setText("");
      useAgentComposer.getState().clearMentions();
    } catch {
      // The draft is preserved; the failure is surfaced inline below the input.
      setSendFailed(true);
    } finally {
      submittingRef.current = false;
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (slashOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        setSlashIndex(Math.min(activeSlashIndex + 1, slashRows.length - 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        setSlashIndex(Math.max(activeSlashIndex - 1, 0));
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        const row = slashRows[activeSlashIndex];
        if (row !== undefined) runSlashCommand(row);
        return;
      }
      if (event.key === "Escape") {
        // Consume: dismiss the LIST, not the panel/dialog above it.
        event.preventDefault();
        event.stopPropagation();
        setSlashDismissed(true);
        return;
      }
    }
    if (event.key === "@") {
      const caret = event.currentTarget.selectionStart ?? text.length;
      if (
        isMentionTrigger(text, caret) &&
        mentions.length < AGENT_COMPOSER_MENTION_CAP
      ) {
        event.preventDefault();
        event.stopPropagation();
        setMentionOpen(true);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      // Enter submits; Shift+Enter falls through to the native newline.
      event.preventDefault();
      event.stopPropagation();
      if (!slashMode) void submit();
    }
  };

  const placeholderKey =
    destination === "steer" ? MSG.steerPlaceholder : MSG.idlePlaceholder;
  const placeholder = resolveMessage({ key: placeholderKey }).message;
  const sendDisabled =
    buildAgentPrompt(text, mentions).length === 0 ||
    slashMode ||
    (destination === "bootstrap" && scope === null);
  // Stop routes through the SHARED `agent:stop-run` descriptor so the button and
  // the Cmd+K command are one seam. The already-requested state disables
  // it; the imperative seam is idempotent besides.
  const stopDisabled = activeRun?.status === "cancel_requested";

  return (
    <div className="relative flex flex-col gap-fg-1-5" data-agent-composer>
      <ComposerChipRow />
      {mentionOpen && (
        <ComposerMentionPicker
          onDismiss={() => setMentionOpen(false)}
          inputRef={inputRef}
        />
      )}
      {slashOpen && (
        <ul
          role="listbox"
          aria-label={resolveMessage({ key: MSG.slashAria }).message}
          data-composer-slash
          className="absolute inset-x-0 bottom-full z-40 mb-fg-1 max-h-64 overflow-y-auto rounded-fg-md border border-rule bg-paper-raised py-fg-1 shadow-fg-popover"
        >
          {slashRows.map((row, index) => (
            <li key={row.command.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={index === activeSlashIndex}
                onMouseDown={(event) => {
                  event.preventDefault();
                  runSlashCommand(row);
                }}
                onMouseEnter={() => setSlashIndex(index)}
                className={`flex w-full items-center px-fg-3 py-fg-1 text-left text-label transition-colors duration-ui-fast ${
                  index === activeSlashIndex
                    ? "bg-paper-sunken text-ink"
                    : "text-ink-muted hover:bg-paper-sunken"
                }`}
              >
                <span className="truncate">{row.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <textarea
        ref={inputRef}
        value={text}
        rows={1}
        maxLength={AGENT_COMPOSER_TEXT_CAP}
        onChange={(event) => {
          setText(event.target.value);
          setSlashDismissed(false);
          setSlashIndex(0);
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={placeholder}
        role="combobox"
        aria-expanded={slashOpen}
        aria-autocomplete="list"
        data-composer-input
        className="max-h-[6.75rem] w-full resize-none overflow-y-auto rounded-fg-md border border-rule bg-paper-sunken px-fg-2 py-fg-1-5 text-body text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
      />
      {sendFailed && (
        <p className="text-meta text-state-broken" data-composer-error role="status">
          {resolveMessage({ key: MSG.sendFailed }).message}
        </p>
      )}
      <div className="flex items-center justify-between gap-fg-2">
        <ComposerSelectorPills />
        {activeRun !== null ? (
          <Button
            variant="danger"
            disabled={stopDisabled}
            onClick={() => agentStopRunAction().run?.()}
            data-composer-stop
          >
            {resolveMessage({ key: MSG.stop }).message}
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={sendDisabled}
            onClick={() => void submit()}
            data-composer-send
          >
            {resolveMessage({ key: MSG.send }).message}
          </Button>
        )}
      </div>
    </div>
  );
}
