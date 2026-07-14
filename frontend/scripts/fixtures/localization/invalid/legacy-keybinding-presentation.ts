import * as keymapRegistry from "../../../../src/platform/keymap/registry";
import {
  legacyKeybindingPresentation as directLegacyKeybindingPresentation,
  type LegacyKeybindingPresentation,
} from "../../../../src/platform/keymap/registry";

function legacyKeybindingPresentation(value: string): string {
  return value;
}

const localLegacyKeybindingPresentation = directLegacyKeybindingPresentation;
declare const unresolvedLegacyKeybindingPresentation: (
  value: string,
) => LegacyKeybindingPresentation;

export function legacyKeybindingPresentationFixture(dynamicCopy: string) {
  return {
    direct: {
      label: directLegacyKeybindingPresentation("Legacy static shortcut"),
    },
    dynamic: {
      group: directLegacyKeybindingPresentation(dynamicCopy),
    },
    namespaceAlias: {
      label: keymapRegistry.legacyKeybindingPresentation(
        "Legacy namespace shortcut",
      ),
    },
    localAlias: {
      label: localLegacyKeybindingPresentation("Legacy locally aliased shortcut"),
    },
    unresolved: {
      label: unresolvedLegacyKeybindingPresentation(
        "Unresolved legacy shortcut",
      ),
    },
    counterfeit: {
      label: legacyKeybindingPresentation("Counterfeit legacy shortcut"),
    },
  };
}
