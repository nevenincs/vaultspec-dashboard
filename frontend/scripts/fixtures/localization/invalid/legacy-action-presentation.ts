import {
  legacyActionPresentation as directLegacyPresentation,
  type LegacyActionPresentation,
} from "../../../../src/platform/actions/action";
import { legacyActionPresentation as reexportedLegacyPresentation } from "../legacy-action-presentation-barrel";

function legacyActionPresentation(value: string): string {
  return value;
}

const localLegacyPresentation = directLegacyPresentation;
declare const unresolvedLegacyPresentation: (value: string) => LegacyActionPresentation;

export function legacyPresentationFixture(dynamicCopy: string) {
  return {
    direct: {
      label: directLegacyPresentation("Legacy static action"),
    },
    dynamic: {
      disabledReason: directLegacyPresentation(dynamicCopy),
    },
    reexported: {
      label: reexportedLegacyPresentation("Legacy re-exported action"),
    },
    localAlias: {
      label: localLegacyPresentation("Legacy locally aliased action"),
    },
    unresolved: {
      label: unresolvedLegacyPresentation("Unresolved legacy action"),
    },
    counterfeit: {
      label: legacyActionPresentation("Counterfeit legacy action"),
    },
  };
}
