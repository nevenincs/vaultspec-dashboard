import {
  resolveActionPresentation,
  type ActionPresentationResolver,
} from "../../platform/actions/action";
import type {
  PaletteCommand,
  ResolvedPaletteCommand,
} from "../../stores/view/commandPaletteCommands";

export function resolvePaletteCommands(
  commands: readonly PaletteCommand[],
  resolveDescriptor: ActionPresentationResolver,
): ResolvedPaletteCommand[] {
  const resolved: ResolvedPaletteCommand[] = [];
  for (const command of commands) {
    const label = resolveActionPresentation(command.label, resolveDescriptor);
    const unavailableReason = resolveDescriptor({
      key: "common:disabledReasons.actionUnavailable",
    });
    const legacyConfirmPrompt =
      command.confirm === true
        ? resolveDescriptor({
            key: "common:accessibility.confirmAction",
            values: { action: label.message },
          })
        : null;
    const confirmationResults =
      command.confirmation === undefined
        ? []
        : [
            resolveDescriptor(command.confirmation.title),
            resolveDescriptor(command.confirmation.body),
            resolveDescriptor(command.confirmation.confirmLabel),
            resolveDescriptor(command.confirmation.cancelLabel),
          ];

    let disabledReason: string | undefined;
    let reasonUsedFallback = false;
    if (command.disabledReason !== undefined) {
      const reason = resolveActionPresentation(
        command.disabledReason,
        resolveDescriptor,
      );
      disabledReason = reason.message;
      reasonUsedFallback = reason.usedFallback;
    }

    const { disabledReason: _rawDisabledReason, ...withoutDisabledReason } = command;
    const fallbackDisabled =
      label.usedFallback ||
      reasonUsedFallback ||
      legacyConfirmPrompt?.usedFallback === true ||
      confirmationResults.some((result) => result.usedFallback);
    const disabled = command.disabled === true || fallbackDisabled;
    if (disabled && (fallbackDisabled || disabledReason === undefined)) {
      disabledReason = unavailableReason.message;
    }
    const item: ResolvedPaletteCommand =
      disabledReason === undefined
        ? {
            ...withoutDisabledReason,
            label: label.message,
            disabled,
            presentationSafe: !fallbackDisabled,
            fallbackDisabled,
            legacyConfirmPrompt: legacyConfirmPrompt?.message ?? null,
          }
        : {
            ...withoutDisabledReason,
            label: label.message,
            disabledReason,
            disabled,
            presentationSafe: !fallbackDisabled,
            fallbackDisabled,
            legacyConfirmPrompt: legacyConfirmPrompt?.message ?? null,
          };
    resolved.push(item);
  }
  return resolved;
}

export function filterResolvedPaletteCommands(
  commands: readonly ResolvedPaletteCommand[],
  query: string,
  locale: string,
): ResolvedPaletteCommand[] {
  const needle = query.trim().toLocaleLowerCase(locale);
  if (needle.length === 0) return [...commands];
  const tokens = needle.split(/\s+/u).filter(Boolean);
  return commands.filter((command) => {
    const label = command.label.toLocaleLowerCase(locale);
    return tokens.every((token) => label.includes(token));
  });
}

export interface CommandPaletteProjectionSnapshot {
  readonly query: string;
  readonly cursor: number;
  readonly orderedIds: readonly string[];
  readonly activeCommandId: string | null;
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function repairCommandPaletteCursorById(
  previous: CommandPaletteProjectionSnapshot | null,
  query: string,
  cursor: number,
  ordered: readonly Pick<ResolvedPaletteCommand, "id">[],
): number {
  if (ordered.length === 0) return -1;
  const ids = ordered.map((command) => command.id);
  if (
    previous !== null &&
    previous.query === query &&
    previous.cursor === cursor &&
    !sameIds(previous.orderedIds, ids) &&
    previous.activeCommandId !== null
  ) {
    const moved = ids.indexOf(previous.activeCommandId);
    if (moved >= 0) return moved;
  }
  return Math.min(Math.max(0, cursor), ordered.length - 1);
}
