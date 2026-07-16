import { DecorativeGlyph } from "../../../../src/app/kit/DecorativeGlyph";
import {
  authoredDisplayText,
  compareAuthoredDisplayText,
  compareRepositoryPaths,
  compareStableIdentifiers,
  repositoryPath,
  stableIdentifier,
} from "../../../../src/platform/localization/displayText";

export function canonicalDisplaySemantics(locale: string) {
  compareStableIdentifiers(stableIdentifier("node:a"), stableIdentifier("node:b"));
  compareRepositoryPaths(repositoryPath("src/a.ts"), repositoryPath("src/b.ts"));
  compareAuthoredDisplayText(
    locale,
    authoredDisplayText("Authored A"),
    authoredDisplayText("Authored B"),
  );
  return <DecorativeGlyph name="plus" />;
}
