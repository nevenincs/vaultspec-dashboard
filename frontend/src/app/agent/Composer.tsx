// The Agent panel composer uses one multiline input for three destinations,
// resolved by the
// pure `agentSubmitDestination` machine from the session snapshot's `active_run`
// and the SERVED pending-interrupt list (`useRunInterrupts`, agent-wire-gaps S41):
//
//   idle (no run)      → Enter starts the next prompt turn (creating the session
//                        first when none is current — the ambient-token path).
//   run parked on an
//   interrupt          → the same input resumes the interrupt (steer); the
//                        placeholder reflects it. Zero new chrome. The pending
//                        interrupt is read from the wire, so a reloaded panel
//                        recovers it — never a client-staged record.
//   run streaming      → Enter dispatches the turn; the engine ENQUEUES it behind
//                        the active run (served `queued_turn_ids`) and auto-promotes
//                        it on settle. The composer renders the served queue count
//                        as a read-only indicator — no client slot (S39).
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
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Clock3,
  FileCode2,
  FileText,
  Folder,
  Hash,
  MessageSquareText,
  Plus,
  Square,
  X,
} from "lucide-react";

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
  createTeamRunId,
  useCancelTeamRun,
  useCreateFeedbackBatch,
  useCreateSession,
  useResumeInterrupt,
  useRunInterrupts,
  useSession,
  useStartTeamRun,
  useStartTurn,
  useProviderCatalog,
  useTeamSelectorState,
} from "../../stores/server/agent";
import { useTeamRunProgress } from "./TeamRunProgressContext";
import { normalizePendingClarification } from "./clarification";
import {
  isCurrentCatalogSelection,
  type ProviderCatalogRecord,
  type ProviderCatalogSelection,
} from "../../stores/server/agent/a2aTeam";
import {
  setAgentCurrentSession,
  setAgentTeamRun,
  useAgentCurrentSessionId,
  useAgentTeamRunId,
  useAgentTeamRunScope,
} from "../../stores/view/agentPanel";
import { agentStopRunAction } from "../../stores/view/agentActions";
import {
  AGENT_COMPOSER_MENTION_CAP,
  AGENT_COMPOSER_TEXT_CAP,
  buildAgentPrompt,
  buildFeedbackBatchRequest,
  agentSubmitDestination,
  useAgentComposer,
  useAgentCommentBatch,
  useAgentMentions,
  type AgentCommentBatch,
  type AgentMention,
} from "../../stores/view/agentComposer";
import {
  useCommandPaletteCommandView,
  type CommandDescriptor,
} from "../../stores/view/commandPaletteCommands";
import { AutocompleteCombobox, type ComboOption } from "../viewer/AutocompleteCombobox";
import { Button, DropdownButton, IconButton, Popover, Spinner } from "../kit";
import { ComposerAutonomyBanner } from "./ComposerAutonomyBanner";
import { ComposerEvidencePicker } from "./ComposerEvidencePicker";
import {
  ComposerExpertSelection,
  reconcileExpertSelections,
} from "./ComposerExpertSelection";
import { ComposerModelPicker } from "./ComposerModelPicker";
import { ComposerFeatureChip } from "./ComposerFeatureChip";
import {
  featureStartBlocked,
  presetRequiresFeatureTag,
  resolveFeatureBinding,
  type FeatureBinding,
} from "./agentFeature";
import { deriveScopeShortName, useActiveDocId } from "../../stores/view/tabs";
import { clearComposerDraft, useComposerSeed } from "./composerDraft";

const MSG = {
  idlePlaceholder: "common:agent.composer.placeholder",
  steerPlaceholder: "common:agent.composer.steerPlaceholder",
  enterHint: "common:agent.composer.enterHint",
  stop: "common:agent.actions.stopRun",
  sendFailed: "common:agent.composer.sendFailed",
  workspace: "common:agent.composer.workspace",
  attach: "common:agent.composer.attach",
  attachedContext: "common:agent.composer.attachedContext",
  evidence: "common:agent.composer.evidenceAria",
  featureUnbound: "common:agent.composer.featureUnbound",
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
  modelUnavailable: "common:agent.composer.modelUnavailable",
  selectorValue: "common:agent.composer.selectorValue",
  selectorDisabled: "common:agent.composer.selectorDisabled",
  team: "common:agent.composer.team",
  teamDefault: "common:agent.composer.teamDefault",
  teamUnset: "common:agent.composer.teamUnset",
  teamMenuAria: "common:agent.composer.teamMenuAria",
  teamPresetUnavailable: "common:agent.composer.teamPresetUnavailable",
  cancelTeamRun: "common:agent.composer.cancelTeamRun",
  teamRunPhase: "common:agent.composer.teamRunPhase",
  teamRunRefused: "common:agent.composer.teamRunRefused",
  teamRunDegraded: "common:agent.composer.teamRunDegraded",
  teamRunDismiss: "common:agent.composer.teamRunDismiss",
  teamRunLocked: "common:agent.composer.teamRunLocked",
  clarificationParked: "common:agent.composer.clarificationParked",
  attachContext: "common:agent.composer.attachContext",
} as const;

const EMPTY_REQUIRED_ROLES: readonly string[] = [];
const EMPTY_REQUIRED_ROLE_LABELS: Readonly<Record<string, string>> = {};

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
 *  never a UI literal). Trimmed AFTER the cut: the engine refuses a padded
 *  title, and a 64-char cut can otherwise land on a space. */
function sessionTitleFromPrompt(prompt: string): string {
  const firstLine = prompt.split("\n", 1)[0] ?? "";
  return firstLine.slice(0, 64).trim();
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
 *  "N comments" batch chip, and the SERVED queued-turn indicator — one grammar.
 *  `queuedCount` is the served `queued_turn_ids.length` (S39): a read-only status
 *  the engine owns, not a removable client slot. */
function ComposerChipRow({ queuedCount }: { queuedCount: number }) {
  const resolveMessage = useLocalizedMessageResolver();
  const mentions = useAgentMentions();
  const commentBatch = useAgentCommentBatch();
  if (mentions.length === 0 && commentBatch === null && queuedCount === 0) {
    return null;
  }
  return (
    <ul
      className="flex flex-wrap gap-fg-1"
      aria-label={resolveMessage({ key: MSG.attachedContext }).message}
      data-composer-chips
    >
      {queuedCount > 0 && (
        <li>
          <span
            className="inline-flex items-center gap-fg-1 rounded-fg-1 bg-fg-surface-sunken px-fg-2 py-fg-1 text-fg-caption text-fg-muted"
            data-composer-chip="queued"
          >
            <Clock3 size={12} aria-hidden />
            {`${queuedCount} ${resolveMessage({ key: MSG.queuedChip }).message}`}
          </span>
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
                  commentBatch.comments.length,
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
              ) : mention.kind === "path" ? (
                <FileCode2 size={12} aria-hidden />
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

/** The LIVE agent-team selector: fed by the a2a team store layer (`a2aTeam.ts`, the
 *  SOLE team-run client). It lists the loadable presets AND every non-loadable one
 *  (never hides an unavailable team — the truthful set) and folds the tolerant
 *  `agent` tier read into a disabled-with-reason verdict when a2a is down. `locked`
 *  disables it while any run (single-agent or team) is in flight. Selecting a preset
 *  flips the composer into team mode; "Single agent" clears back to the single-agent
 *  path. */
function ComposerTeamSelector({
  selectedPresetId,
  onSelectPreset,
  locked,
}: {
  selectedPresetId: string | null;
  onSelectPreset: (id: string | null) => void;
  locked: boolean;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const state = useTeamSelectorState();
  const [open, setOpen] = useState(false);

  const selected =
    selectedPresetId !== null
      ? (state.presets.find((preset) => preset.id === selectedPresetId) ?? null)
      : null;
  const teamLabel = resolveMessage({ key: MSG.team }).message;
  const teamDefaultLabel = resolveMessage({ key: MSG.teamDefault }).message;
  // D8: label by the SERVED value, or by the captured unset idiom ("Select
  // team", the Select-Project shape) — never the invented "Single agent"
  // placeholder the owner rejected. The single-agent lane remains the implicit
  // default; the MENU still offers it as an explicit row to return to.
  const valueLabel = selected
    ? (selected.display_name ?? selected.id)
    : resolveMessage({ key: MSG.teamUnset }).message;
  const noTeams = state.presets.length === 0;
  // Nothing served and nothing wrong: there is no team to select, so no pill —
  // omit rather than invent (D8). A DISABLED plane still renders, with its
  // served reason, because "teams exist but are unreachable" is a truth.
  if (noTeams && !state.disabled) return null;
  const controlDisabled = state.disabled || noTeams || locked;
  const reason = state.disabled
    ? state.disabledReason
    : locked
      ? resolveMessage({ key: MSG.teamRunLocked }).message
      : undefined;

  const pill = resolveMessage({
    key: MSG.selectorValue,
    values: { selector: teamLabel, value: authoredDisplayText(valueLabel) },
  }).message;
  const ariaLabel = controlDisabled
    ? resolveMessage({
        key: MSG.selectorDisabled,
        values: {
          selector: teamLabel,
          value: authoredDisplayText(valueLabel),
          reason: authoredDisplayText(reason ?? ""),
        },
      }).message
    : pill;
  const disabledTitle =
    controlDisabled && reason !== undefined ? authoredDisplayText(reason) : undefined;
  const menuAria = resolveMessage({ key: MSG.teamMenuAria }).message;
  const presetUnavailable = resolveMessage({ key: MSG.teamPresetUnavailable }).message;

  const select = (id: string | null) => {
    onSelectPreset(id);
    setOpen(false);
  };

  return (
    <div className="relative" data-composer-team>
      <span title={disabledTitle} data-composer-team-trigger>
        {/* The pill shows the VALUE alone — every reference product labels these
            controls by what is selected ("Opus 5 High"), never "Model: …". The
            selector noun stays in the accessible name below. */}
        <DropdownButton
          label={authoredDisplayText(valueLabel)}
          open={open}
          onClick={() => setOpen((current) => !current)}
          disabled={controlDisabled}
          ariaLabel={ariaLabel}
        />
      </span>
      {open && !controlDisabled && (
        <Popover
          open
          onDismiss={() => setOpen(false)}
          ignoreSelector="[data-composer-team-trigger]"
          role="menu"
          aria-label={menuAria}
          data-composer-team-menu
          className="absolute left-0 bottom-full z-40 mb-fg-1 min-w-56 rounded-fg-md border border-rule bg-paper-raised p-fg-1 shadow-fg-popover"
        >
          <ul className="flex flex-col gap-fg-0-5">
            <li>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={selected === null}
                onClick={() => select(null)}
                className="flex w-full flex-col rounded-fg-sm px-fg-2 py-fg-1 text-left text-label text-ink transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus aria-[checked=true]:bg-paper-sunken"
              >
                {teamDefaultLabel}
              </button>
            </li>
            {state.presets.map((preset) => {
              const presetReason = preset.unavailable_reason ?? presetUnavailable;
              const presetLabel = authoredDisplayText(preset.display_name ?? preset.id);
              return (
                <li key={preset.id}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={selectedPresetId === preset.id}
                    disabled={!preset.loadable}
                    data-team-preset={preset.id}
                    title={preset.loadable ? undefined : presetReason}
                    onClick={preset.loadable ? () => select(preset.id) : undefined}
                    className="flex w-full flex-col gap-fg-0-5 rounded-fg-sm px-fg-2 py-fg-1 text-left text-label text-ink transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus aria-[checked=true]:bg-paper-sunken disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                  >
                    <span className="truncate">{presetLabel}</span>
                    {!preset.loadable && (
                      <span className="truncate text-meta text-ink-faint">
                        {presetReason}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </Popover>
      )}
    </div>
  );
}

/** Row 2 RIGHT — how it thinks (research G6, codified by D3): the team/preset
 *  selector and the served model profile. The send control sits to their right,
 *  rendered by the composer itself since it changes shape with the run. */
function ComposerThinkingControls({
  locked,
  providers,
  selection,
  showExpert,
  requiredRoles,
  requiredRoleLabels,
  overrides,
  fallbacks,
  onSelectSelection,
  onChangeOverrides,
  onChangeFallbacks,
}: {
  locked: boolean;
  providers: readonly ProviderCatalogRecord[];
  selection: ProviderCatalogSelection | null;
  showExpert: boolean;
  requiredRoles: readonly string[];
  requiredRoleLabels: Readonly<Record<string, string>>;
  overrides: Readonly<Record<string, ProviderCatalogSelection>>;
  fallbacks: readonly ProviderCatalogSelection[];
  onSelectSelection: (selection: ProviderCatalogSelection | null) => void;
  onChangeOverrides: (
    overrides: Readonly<Record<string, ProviderCatalogSelection>>,
  ) => void;
  onChangeFallbacks: (fallbacks: readonly ProviderCatalogSelection[]) => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-fg-1" data-composer-thinking>
      <ComposerModelPicker
        providers={providers}
        selection={selection}
        onSelectSelection={onSelectSelection}
        locked={locked}
      />
      {showExpert && (
        <ComposerExpertSelection
          requiredRoles={requiredRoles}
          requiredRoleLabels={requiredRoleLabels}
          providers={providers}
          selection={selection}
          overrides={overrides}
          fallbacks={fallbacks}
          onChangeOverrides={onChangeOverrides}
          onChangeFallbacks={onChangeFallbacks}
          locked={locked}
        />
      )}
    </div>
  );
}

/** Row 2 LEFT — what the agent works on (research G6, codified by D3/D11): the
 *  `+` attach affordance opening a LABELED menu (the captured `+` is an attach
 *  entry point, never a mystery icon), the team selector, and the feature chip.
 *  The workspace chip lives ABOVE the card (the captured Select-Project line),
 *  and the permission posture is the C7 banner — a standing pill for it is our
 *  invention, present in no captured composer. */
function ComposerScopeControls({
  onAttachCorpus,
  onAttachEvidence,
  attachDisabled,
  teamSelector,
  featureChip,
}: {
  onAttachCorpus: () => void;
  onAttachEvidence: () => void;
  attachDisabled: boolean;
  /** Which agent (one, or a team) the prompt is worked by — WHAT it runs on, so it
   *  sits in this group and not beside the model (agent-panel UX research G6). */
  teamSelector: ReactNode;
  /** The standing feature chip (S44), or null for a lane that needs no feature. */
  featureChip: ReactNode;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const attach = resolveMessage({ key: MSG.attach });
  const corpusItem = resolveMessage({ key: MSG.attachContext });
  const evidenceItem = resolveMessage({ key: MSG.evidence });
  const [attachOpen, setAttachOpen] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-fg-1-5" data-composer-scope>
      {!attach.usedFallback && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setAttachOpen((open) => !open)}
            aria-label={attach.message}
            aria-expanded={attachOpen}
            title={attach.message}
            data-composer-attach
            className="inline-flex size-fg-5 shrink-0 items-center justify-center rounded-fg-sm border border-rule text-ink-faint transition-colors duration-ui-fast hover:bg-paper-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={14} aria-hidden />
          </button>
          {attachOpen && (
            <Popover
              open
              onDismiss={() => setAttachOpen(false)}
              role="menu"
              aria-label={attach.message}
              data-composer-attach-menu
              className="absolute bottom-full left-0 z-40 mb-fg-1 flex w-60 flex-col gap-fg-0-5 rounded-fg-md border border-rule bg-paper-raised p-fg-1 shadow-fg-popover"
            >
              <button
                type="button"
                role="menuitem"
                disabled={attachDisabled}
                data-composer-attach-corpus
                onClick={() => {
                  setAttachOpen(false);
                  onAttachCorpus();
                }}
                className="rounded-fg-sm px-fg-2 py-fg-1 text-left text-label text-ink transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50"
              >
                {corpusItem.message}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={attachDisabled}
                data-composer-attach-evidence
                onClick={() => {
                  setAttachOpen(false);
                  onAttachEvidence();
                }}
                className="rounded-fg-sm px-fg-2 py-fg-1 text-left text-label text-ink transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50"
              >
                {evidenceItem.message}
              </button>
            </Popover>
          )}
        </div>
      )}
      {teamSelector}
      {featureChip}
    </div>
  );
}

/** The workspace line ABOVE the composer card (G5's exact captured shape: the
 *  `Select Project ˅` line sits on its own row immediately above the input,
 *  outside the card border). Ours renders the BOUND workspace — the same truth
 *  the run-start generation fence enforces — and is withheld while unresolved. */
function ComposerWorkspaceLine({
  scopeShortName,
  scopeFull,
}: {
  scopeShortName: string | null;
  scopeFull: string | null;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const workspace = resolveMessage({ key: MSG.workspace });
  if (scopeShortName === null || workspace.usedFallback) return null;
  const aria = resolveMessage({
    key: MSG.selectorValue,
    values: {
      selector: workspace.message,
      value: authoredDisplayText(scopeShortName),
    },
  }).message;
  return (
    <div className="flex" data-composer-workspace-line>
      <span
        className="inline-flex min-w-0 items-center gap-fg-1-5 rounded-fg-pill px-fg-1 py-fg-0-5 text-label text-ink-muted"
        data-composer-scope-chip
        aria-label={aria}
        title={scopeFull ?? undefined}
      >
        <Folder size={14} aria-hidden className="shrink-0 text-ink-faint" />
        <span className="min-w-0 truncate">{scopeShortName}</span>
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
  const createFeedbackBatch = useCreateFeedbackBatch();
  const resumeInterrupt = useResumeInterrupt();

  const mentions = useAgentMentions();
  const commentBatch = useAgentCommentBatch();

  const [text, setText] = useState("");
  const enterHintId = useId();
  const [mentionOpen, setMentionOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [sendFailed, setSendFailed] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const submittingRef = useRef(false);

  // The LIVE team plane (a2a `a2aTeam.ts`, the sole team-run client): the selected
  // preset drives team mode; the started run id feeds the authoritative progress
  // read; a business refusal is surfaced honestly inline. Team runs do NOT carry
  // the comment feedback batch — that is the single-agent path only.
  const [selectedTeamPreset, setSelectedTeamPreset] = useState<string | null>(null);
  // Lifted to the shared panel store so the Transcript renders this run's live
  // relayed activity; the Composer still owns start/cancel/clear.
  const storedTeamRunId = useAgentTeamRunId();
  const teamRunScope = useAgentTeamRunScope();
  // Scope-gate synchronously: an A binding is never streamed or rendered while
  // the dashboard has already selected B, even before the cleanup effect runs.
  const teamRunId = teamRunScope === scope ? storedTeamRunId : null;
  const [teamRefused, setTeamRefused] = useState<{ detail?: string } | null>(null);
  const startTeamRun = useStartTeamRun();
  const cancelTeamRun = useCancelTeamRun();
  const teamProgress = useTeamRunProgress();
  const teamRunActive = teamRunId !== null;
  // Lifecycle posture is owned exclusively by the authoritative run-status
  // snapshot. Relay terminal frames only trigger its immediate reconciliation.
  const teamTerminal = teamProgress.terminal;
  const teamPhase = teamProgress.status?.semantic_phase ?? teamProgress.status?.status;
  // D5: while the run is PARKED on a clarification, the card is the sole answer
  // surface (one authority per state). The composer disables itself and says why,
  // rather than accepting a message the parked graph would never see. Read from the
  // authoritative status, so a reloaded panel is disabled for the same reason.
  const parkedOnClarification =
    normalizePendingClarification(teamProgress.status?.pending_clarification) !== null;
  const teamMode = selectedTeamPreset !== null;
  // Team topology remains preset-owned, while the provider/model that produces a
  // new artifact is an explicit current A2A catalog selection. Neither the preset
  // nor the Dashboard gets to fill a missing selection with a static default.
  const teamSelector = useTeamSelectorState();
  const activePreset =
    selectedTeamPreset === null
      ? null
      : (teamSelector.presets.find((preset) => preset.id === selectedTeamPreset) ??
        null);
  const requiredRoles = activePreset?.required_roles ?? EMPTY_REQUIRED_ROLES;
  const requiredRoleLabels =
    activePreset?.required_role_labels ?? EMPTY_REQUIRED_ROLE_LABELS;
  const providerCatalog = useProviderCatalog(scope, { enabled: teamMode });
  const providers = teamMode ? (providerCatalog.data?.providers ?? []) : [];
  const [selectedCatalogSelection, setSelectedCatalogSelection] =
    useState<ProviderCatalogSelection | null>(null);
  const [roleOverrides, setRoleOverrides] = useState<
    Readonly<Record<string, ProviderCatalogSelection>>
  >({});
  const [fallbacks, setFallbacks] = useState<readonly ProviderCatalogSelection[]>([]);
  useEffect(() => {
    setSelectedCatalogSelection(null);
    setRoleOverrides({});
    setFallbacks([]);
  }, [scope, selectedTeamPreset]);
  // A retained browser selection is meaningful only while the same provider lane,
  // catalog revision, entry and native options remain served and selectable.
  const runSelection = useMemo(
    () =>
      providers.find((provider) =>
        isCurrentCatalogSelection(provider, selectedCatalogSelection),
      ) === undefined
        ? null
        : selectedCatalogSelection,
    [providers, selectedCatalogSelection],
  );
  useEffect(() => {
    if (selectedCatalogSelection !== null && runSelection === null) {
      setSelectedCatalogSelection(null);
    }
  }, [runSelection, selectedCatalogSelection]);
  const reconciledExpertSelections = useMemo(
    () =>
      reconcileExpertSelections({
        requiredRoles,
        providers,
        overrides: roleOverrides,
        fallbacks,
      }),
    [fallbacks, providers, requiredRoles, roleOverrides],
  );
  // A refreshed catalog or a switched preset can revoke a retained expert choice.
  // Keep the browser state aligned before the start mutation sees it; the server
  // remains the final admission authority for the supplied current references.
  useEffect(() => {
    if (roleOverrides !== reconciledExpertSelections.overrides) {
      setRoleOverrides(reconciledExpertSelections.overrides);
    }
    if (fallbacks !== reconciledExpertSelections.fallbacks) {
      setFallbacks(reconciledExpertSelections.fallbacks);
    }
  }, [fallbacks, reconciledExpertSelections, roleOverrides]);
  const runOverrides = reconciledExpertSelections.overrides;
  const runFallbacks = reconciledExpertSelections.fallbacks;

  // S44 — the CORNERSTONE feature binding. Which presets need one is SERVED
  // (`authoring_capability`), the default comes from the open document, and the
  // explicit choice clears with the preset for the same reason the profile choice
  // does: it belongs to the lane that asked for it.
  const composerLocale = useActiveLocale();
  const corpus = useEditorLinkingCorpus(scope, composerLocale);
  const activeDocId = useActiveDocId();
  const [chosenFeature, setChosenFeature] = useState<string | null>(null);
  useEffect(() => {
    setChosenFeature(null);
  }, [selectedTeamPreset]);
  const featureBinding: FeatureBinding = useMemo(
    () =>
      resolveFeatureBinding({
        chosen: chosenFeature,
        activeDocId,
        documents: corpus.documents,
      }),
    [chosenFeature, activeDocId, corpus.documents],
  );
  const featureRequired = presetRequiresFeatureTag(activePreset);
  const featureBlocked = featureStartBlocked(activePreset, featureBinding);
  // Only a lane that ASKS for a feature sends one. A coding preset that received a
  // `feature_tag` would be carrying a field the sibling neither needs nor validates.
  const runFeatureTag = featureRequired ? featureBinding.tag : null;

  const activeRun = session.data?.active_run ?? null;
  const activeRunId = activeRun?.run_id ?? null;
  // Steer-eligibility is SERVED (agent-wire-gaps S41): the active run's pending
  // interrupts come from `GET /runs/{id}/interrupts` (D3), not a client-staged
  // record, so a reloaded panel recovers a parked permission prompt from the wire.
  // The list is scoped to the active run, so its first `pending` entry is the one
  // the same input steers.
  const runInterrupts = useRunInterrupts(activeRunId);
  const pendingInterrupt = useMemo(
    () =>
      runInterrupts.data?.items.find((item) => item.resume_state === "pending") ?? null,
    [runInterrupts.data],
  );
  // The SERVED session status (bounded enum). Since D2 the run-scoped Stop leaves
  // the session active; only an explicit session cancel makes it non-active, which
  // then routes the next submit to a fresh session.
  const sessionStatus = session.data?.session.status ?? null;
  const destination = agentSubmitDestination({
    sessionId: currentSessionId,
    sessionStatus,
    activeRunId,
    hasPendingInterrupt: pendingInterrupt !== null,
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

  // A starter affordance from the begin state seeds the draft ONCE. The seed is
  // consumed on delivery, so it can never re-apply over what the user typed next,
  // and focus lands in the input so the starter continues into typing.
  const seed = useComposerSeed();
  useEffect(() => {
    if (seed === null) return;
    setText(seed);
    clearComposerDraft();
    const el = inputRef.current;
    if (el !== null) {
      el.focus();
      el.setSelectionRange(seed.length, seed.length);
    }
  }, [seed]);

  // --- auto-grow: min 1 line, CSS max-height caps at ~5 lines then scrolls ------
  useEffect(() => {
    const el = inputRef.current;
    if (el === null) return;
    el.style.height = "auto";
    if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight / 16}rem`;
  }, [text]);

  // No stale-interrupt hygiene is needed: the served list is scoped to the active
  // run and the shared lifecycle feed invalidates it, so a settled/replaced run's
  // interrupts drop from the read on their own (agent-wire-gaps S41).

  const createSessionAsync = createSession.mutateAsync;
  const startTurnAsync = startTurn.mutateAsync;
  const createFeedbackBatchAsync = createFeedbackBatch.mutateAsync;

  /** Deliver one prompt: bootstrap a fresh session first when none is usable
   *  (no current session, or the current one is no longer active — Stop cancels
   *  the whole session on this plane), then start the turn. When a comment batch is
   *  staged, freeze it into an engine feedback batch (once the session id is known,
   *  since the batch is session-scoped) and carry its opaque id on the turn
   *  — a2a never sees the content, only the id. Shared by the
   *  submit path and the queued-dispatch effect so both take the SAME lane. */
  const deliverPrompt = useCallback(
    async (
      prompt: string,
      bootstrap: boolean,
      commentBatch: AgentCommentBatch | null = null,
    ) => {
      let sessionId = currentSessionId;
      let createdSession = false;
      if (bootstrap || sessionId === null) {
        // The engine refuses an empty title, and a comments-only first submit
        // carries no prompt text — the first comment's body is the user-authored
        // fallback (one of the two always exists; submit requires a payload).
        const title =
          [prompt, commentBatch?.comments[0]?.body ?? ""]
            .map(sessionTitleFromPrompt)
            .find((candidate) => candidate.length > 0) ?? "";
        const outcome = await createSessionAsync({
          scope: scope ?? "",
          title,
        });
        // An in-flight replay means a concurrent identical create is already
        // running — never double-create; the lifecycle event will surface it.
        if (outcome.kind !== "settled") return;
        sessionId = outcome.session_id;
        createdSession = true;
      }
      const batchRequest = buildFeedbackBatchRequest(commentBatch, sessionId);
      const feedbackBatchId =
        batchRequest === null
          ? undefined
          : (await createFeedbackBatchAsync(batchRequest)).batchId;
      await startTurnAsync({
        sessionId,
        payload:
          feedbackBatchId === undefined
            ? { prompt }
            : { prompt, feedback_batch_id: feedbackBatchId },
      });
      if (createdSession) setAgentCurrentSession(sessionId);
    },
    [
      createFeedbackBatchAsync,
      createSessionAsync,
      currentSessionId,
      scope,
      startTurnAsync,
    ],
  );

  // The client one-slot queue + its dispatch effect were REMOVED (S39): a mid-run
  // submit dispatches the turn now (below), the engine enqueues it, and the engine
  // auto-promotes the next queued turn when the active run settles — server-side, in
  // the same unit of work — so there is no client dispatch-on-settle to manage.

  const submit = async () => {
    const prompt = buildAgentPrompt(text, mentions);
    // A submit needs prompt text: the engine refuses an empty prompt turn
    // (validate_prompt), so a staged comment batch ATTACHES to a typed message
    // rather than standing in for one — the chip row makes the attachment
    // visible, and the user says what to do with it.
    if (prompt.length === 0) return;
    // A mid-run submit (`destination === "queue"`) is NOT a client-held slot anymore
    // (S39): it takes the SAME deliver path as a normal turn — the engine enqueues it
    // when a run is active (surfacing in served `queued_turn_ids`) and auto-promotes it
    // on settle. So `queue` falls through to `deliverPrompt` below like `turn`.
    // A session cannot be created without a resolved scope; hold the submit
    // (the button is disabled in this state, and Enter is a no-op).
    if (destination === "bootstrap" && scope === null) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSendFailed(false);
    setTeamRefused(null);
    try {
      if (destination === "steer" && pendingInterrupt !== null) {
        // D4/S18: the same input resumes the parked run through the TYPED steer
        // decision (`{prompt}` — the engine's `InterruptResumeDecision::Steer`),
        // no longer an opaque client-defined blob. The interrupt id is read from
        // the SERVED pending list (S41); the resume's invalidation refreshes it, so
        // the resolved interrupt drops from the read with no client clearing.
        await resumeInterrupt.mutateAsync({
          interruptId: pendingInterrupt.interrupt_id,
          payload: { decision: { prompt } },
        });
      } else {
        await deliverPrompt(prompt, destination === "bootstrap", commentBatch);
      }
      setText("");
      useAgentComposer.getState().clearMentions();
      useAgentComposer.getState().stageCommentBatch(null);
    } catch {
      // The draft is preserved; the failure is surfaced inline below the input.
      setSendFailed(true);
    } finally {
      submittingRef.current = false;
    }
  };

  /** Start a TEAM run over the sole a2a team client. Requires a non-empty prompt
   *  and a selected preset (both re-verified engine-side). On a successful start the
   *  run id feeds the progress read and the draft clears; a business refusal (the
   *  sibling's forwarded 4xx) surfaces honestly inline rather than as a fake start. */
  const startTeam = async () => {
    const prompt = buildAgentPrompt(text, mentions);
    if (
      prompt.length === 0 ||
      selectedTeamPreset === null ||
      scope === null ||
      runSelection === null
    )
      return;
    // A document-authoring run without its cornerstone feature is a run the sibling
    // will refuse. Hold it here and say so, rather than spending a round trip to be
    // told something the served capability already told us.
    if (featureBlocked) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSendFailed(false);
    setTeamRefused(null);
    try {
      const result = await startTeamRun.mutateAsync({
        run_id: createTeamRunId(),
        team_preset: selectedTeamPreset,
        message: prompt,
        expected_scope: scope,
        selection: runSelection,
        ...(Object.keys(runOverrides).length === 0 ? {} : { overrides: runOverrides }),
        ...(runFallbacks.length === 0 ? {} : { fallbacks: runFallbacks }),
        title: sessionTitleFromPrompt(prompt),
        ...(runFeatureTag === null ? {} : { feature_tag: runFeatureTag }),
      });
      if (result.ok && result.run_id !== undefined && result.run_id.length > 0) {
        setAgentTeamRun({ runId: result.run_id, prompt, scope });
        setText("");
        useAgentComposer.getState().clearMentions();
      } else {
        setSendFailed(true);
        setTeamRefused({ detail: result.refusal_detail });
      }
    } catch {
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
        // `@` is the EVIDENCE key (agent-panel-shell-integration D3): rel paths off
        // the files providers, scoped to the bound workspace. The corpus picker
        // (features + documents) keeps its own affordance on the `+` attach button,
        // so neither capability was traded for the other.
        event.preventDefault();
        event.stopPropagation();
        setEvidenceOpen(true);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      // Enter submits; Shift+Enter falls through to the native newline. In team
      // mode (a preset selected, no run in flight) Enter starts the team run so the
      // key matches the primary button; while a team run is active Enter is inert
      // (the run is driven by the Stop/Dismiss control, not a fresh submit).
      event.preventDefault();
      event.stopPropagation();
      if (slashMode || teamRunActive) return;
      if (teamMode && activeRun === null) {
        void startTeam();
      } else {
        void submit();
      }
    }
  };

  const placeholderKey = parkedOnClarification
    ? MSG.clarificationParked
    : destination === "steer"
      ? MSG.steerPlaceholder
      : MSG.idlePlaceholder;
  const placeholder = resolveMessage({ key: placeholderKey }).message;
  // The served run phase, rendered verbatim (never client-classified). Falls back
  // to an ellipsis before the first status snapshot lands.
  const teamPhaseLabel = resolveMessage({
    key: MSG.teamRunPhase,
    values: { phase: authoredDisplayText(teamPhase ?? "…") },
  }).message;
  // Stop routes through the SHARED `agent:stop-run` descriptor so the button and
  // the Cmd+K command are one seam. The already-requested state disables
  // it; the imperative seam is idempotent besides.
  const stopDisabled = activeRun?.status === "cancel_requested";

  return (
    <div className="flex flex-col gap-fg-1-5" data-agent-composer-region>
      {/* G5, the captured shape exactly: the workspace line sits ABOVE the card,
          outside its border, the way Select Project does in the references. */}
      <ComposerWorkspaceLine
        scopeShortName={scope === null ? null : deriveScopeShortName(scope)}
        scopeFull={scope}
      />
      {/* D11: the composer is ONE two-row card — a single bordered container
          holding the input and both control clusters, the shape every captured
          reference composer shares. The input inside is borderless; the card
          carries the focus ring. */}
      <div
        className="relative flex flex-col gap-fg-1-5 rounded-fg-md border border-rule bg-paper p-fg-2 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-focus"
        data-agent-composer
      >
        <ComposerChipRow queuedCount={session.data?.queued_turn_ids.length ?? 0} />
        {mentionOpen && (
          <ComposerMentionPicker
            onDismiss={() => setMentionOpen(false)}
            inputRef={inputRef}
          />
        )}
        {evidenceOpen && (
          <ComposerEvidencePicker
            onDismiss={() => setEvidenceOpen(false)}
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
          disabled={parkedOnClarification}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-describedby={enterHintId}
          role="combobox"
          aria-expanded={slashOpen}
          aria-autocomplete="list"
          data-composer-input
          className="max-h-[6.75rem] w-full resize-none overflow-y-auto bg-transparent px-fg-1 py-fg-1 text-body text-ink outline-none placeholder:text-ink-faint"
        />
        {/* No send button exists in any captured composer — Enter is the send. The
          verb still has to be DISCOVERABLE without guessing, so the input names it
          for assistive tech (and the keyboard legend lists it). */}
        <span id={enterHintId} className="sr-only" data-composer-enter-hint>
          {resolveMessage({ key: MSG.enterHint }).message}
        </span>
        {sendFailed && (
          <p className="text-meta text-state-broken" data-composer-error role="status">
            {teamRefused !== null
              ? `${resolveMessage({ key: MSG.teamRunRefused }).message}${
                  teamRefused.detail !== undefined && teamRefused.detail.length > 0
                    ? ` ${teamRefused.detail}`
                    : ""
                }`
              : resolveMessage({ key: MSG.sendFailed }).message}
          </p>
        )}
        {/* S44: a held start says what is missing. The button being disabled is not an
          explanation, and the sibling's refusal would arrive too late to be one. */}
        {featureBlocked && !teamRunActive && (
          <p
            className="text-meta text-ink-muted"
            role="status"
            data-composer-feature-hint
          >
            {resolveMessage({ key: MSG.featureUnbound }).message}
          </p>
        )}
        {teamRunActive && (
          <div
            className="flex items-center gap-fg-2 text-meta text-ink-muted"
            role="status"
            data-composer-team-run
          >
            {!teamTerminal && <Spinner size="sm" label={teamPhaseLabel} />}
            <span className="min-w-0 truncate">{teamPhaseLabel}</span>
            {teamProgress.degraded && (
              <span className="text-ink-faint" data-composer-team-degraded>
                {resolveMessage({ key: MSG.teamRunDegraded }).message}
              </span>
            )}
          </div>
        )}
        {/* C7: the standing elevated-autonomy warning sits directly ABOVE the
          composer's control row — never modal, never blocking the prompt. */}
        <ComposerAutonomyBanner />
        {/* Row 2 (G6, codified by D3): LEFT changes what the agent works on, RIGHT
          changes how it thinks, and send is terminal-right.
          The row WRAPS rather than overflowing. At panel width — the default
          [document|agent] split — the pills plus the send control exceed one line,
          and an unwrapped row does not clip the least important thing, it clips the
          LAST one: the primary action slid under the model pill and became
          unclickable. Wrapping keeps both clusters intact and their order (and so
          the law) while guaranteeing the action is always reachable; `ml-auto`
          keeps the right cluster right-aligned on whichever line it lands. */}
        <div className="flex flex-wrap items-center justify-between gap-fg-2">
          <ComposerScopeControls
            onAttachCorpus={() => setMentionOpen(true)}
            onAttachEvidence={() => setEvidenceOpen(true)}
            attachDisabled={mentions.length >= AGENT_COMPOSER_MENTION_CAP}
            teamSelector={
              <ComposerTeamSelector
                selectedPresetId={selectedTeamPreset}
                onSelectPreset={setSelectedTeamPreset}
                locked={activeRun !== null || teamRunActive || startTeamRun.isPending}
              />
            }
            featureChip={
              featureRequired ? (
                <ComposerFeatureChip
                  binding={featureBinding}
                  featureTags={corpus.featureTags}
                  onSelectFeature={setChosenFeature}
                  locked={teamRunActive || startTeamRun.isPending}
                />
              ) : null
            }
          />
          <div className="ml-auto flex min-w-0 items-center gap-fg-2">
            <ComposerThinkingControls
              locked={activeRun !== null || teamRunActive || startTeamRun.isPending}
              providers={providers}
              selection={runSelection}
              showExpert={teamMode}
              requiredRoles={requiredRoles}
              requiredRoleLabels={requiredRoleLabels}
              overrides={runOverrides}
              fallbacks={runFallbacks}
              onSelectSelection={setSelectedCatalogSelection}
              onChangeOverrides={setRoleOverrides}
              onChangeFallbacks={setFallbacks}
            />
            {/* The RUN SLOT (D10, C6): nothing at idle — Enter sends and Enter
              starts a team run; there is no send or start button to drift from
              the references. While ANY run streams the slot holds the square
              Stop (one verb, both planes); a terminal team run leaves a small
              dismiss to fold the run away. */}
            {teamRunActive && !teamTerminal ? (
              <IconButton
                label={resolveMessage({ key: MSG.cancelTeamRun }).message}
                disabled={cancelTeamRun.isPending}
                onClick={() => void cancelTeamRun.mutateAsync(teamRunId!)}
                data-composer-team-cancel
              >
                <Square size={14} aria-hidden fill="currentColor" />
              </IconButton>
            ) : teamRunActive && teamTerminal ? (
              <Button
                variant="secondary"
                onClick={() => setAgentTeamRun(null)}
                data-composer-team-dismiss
              >
                {resolveMessage({ key: MSG.teamRunDismiss }).message}
              </Button>
            ) : activeRun !== null ? (
              <IconButton
                label={resolveMessage({ key: MSG.stop }).message}
                disabled={stopDisabled}
                onClick={() => agentStopRunAction().run?.()}
                data-composer-stop
              >
                <Square size={14} aria-hidden fill="currentColor" />
              </IconButton>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
