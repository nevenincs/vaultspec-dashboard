import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, relative, resolve } from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  CANONICAL_OWNER_LAYERS,
  CONSOLIDATION_BASELINE_COUNTS,
  CONSOLIDATION_DISPOSITIONS,
  CONSOLIDATION_LEDGER,
  CONSOLIDATION_LEDGER_SCHEMA_VERSION,
  CONSOLIDATION_SOURCE_SCOPE,
  DISPOSITION_RATIONALE_FIELDS,
  ledgerSourceKey,
  NATIVE_CONTROL_ELEMENTS,
  NATIVE_CONTROL_LEDGER,
  type NativeControlElement,
  type NativeControlLedgerEntry,
} from "./consolidation-ledger";

const FRONTEND_ROOT = resolve(import.meta.dirname, "../..");
const NATIVE_ELEMENTS = new Set<string>(NATIVE_CONTROL_ELEMENTS);

interface SourceControlSite {
  path: `frontend/${string}`;
  owner: string;
  element: NativeControlElement;
  offset: number;
  line: number;
}

interface RawControlLexeme {
  path: `frontend/${string}`;
  offset: number;
  line: number;
}

const PROSE_FALSE_POSITIVES = [
  {
    path: "frontend/src/app/kit/FacetRow.tsx",
    line: 4,
    text: "<input>",
  },
  {
    path: "frontend/src/app/kit/Tab.tsx",
    line: 62,
    text: "<button>",
  },
  {
    path: "frontend/src/app/stage/FilterMenu.tsx",
    line: 346,
    text: '<input type="date">',
  },
] as const;

/**
 * Semantic slots for repeated controls are explicitly bound to their zero-based
 * AST occurrence within path + owner + element. This is intentionally reviewed
 * data: deriving the ordinal independently from ledger order would allow a stale
 * slot to be replaced by a different control without the test noticing.
 */
const DUPLICATE_SITE_BINDINGS = [
  [
    "frontend/src/app/agent/ClarificationCard.tsx",
    "ClarificationCard",
    "input",
    ["choice-other-text-input", "free-text-input"],
  ],
  [
    "frontend/src/app/viewer/PropertiesPopover.tsx",
    "PropertiesPopover",
    "input",
    ["document-name-input", "document-date-input"],
  ],
  [
    "frontend/src/app/stage/FilterMenu.tsx",
    "ChipsBody",
    "button",
    ["reset-filters-action", "show-results-action"],
  ],
  [
    "frontend/src/app/palette/SearchPaletteSurface.tsx",
    "SearchPaletteSurface",
    "button",
    [
      "compact-cancel-action",
      "compact-search-result",
      "split-search-result",
      "collapsed-search-result",
    ],
  ],
  [
    "frontend/src/app/agent/Composer.tsx",
    "ComposerScopeControls",
    "button",
    ["attach-trigger", "attach-corpus-option", "attach-evidence-option"],
  ],
  [
    "frontend/src/app/palette/SearchPaletteSurface.tsx",
    "SearchPaletteSurface",
    "input",
    ["compact-query-input", "regular-query-input"],
  ],
  [
    "frontend/src/app/stage/FilterMenu.tsx",
    "CustomRangeInputs",
    "input",
    ["date-from-input", "date-to-input"],
  ],
  [
    "frontend/src/app/stage/CategoryLegend.tsx",
    "CategoryLegend",
    "button",
    [
      "code-module-compact-toggle",
      "document-type-compact-toggle",
      "document-type-filter-option",
      "document-type-filter-reset",
    ],
  ],
  [
    "frontend/src/app/stage/WorkingSet.tsx",
    "WorkingSet",
    "button",
    ["collapse-item-action", "clear-action"],
  ],
  [
    "frontend/src/app/agent/AgentPanel.tsx",
    "AgentPanelHeader",
    "button",
    ["archive-current-session-command", "recent-session-command"],
  ],
  [
    "frontend/src/app/agent/Composer.tsx",
    "ComposerTeamSelector",
    "button",
    ["default-team-option", "preset-team-option"],
  ],
  [
    "frontend/src/app/left/CreateDocDialog.tsx",
    "DocumentStage",
    "button",
    ["back-action", "document-type-option", "remove-linked-document-action"],
  ],
  [
    "frontend/src/app/left/WorktreePicker.tsx",
    "WorktreePicker",
    "button",
    ["identity-trigger", "retry-action"],
  ],
  [
    "frontend/src/app/right/StatusTab.tsx",
    "PlanPill",
    "button",
    ["plan-disclosure-row", "open-plan-action"],
  ],
  [
    "frontend/src/app/right/StatusTab.tsx",
    "RecentCommitItem",
    "button",
    ["message-disclosure-action", "commit-selection-row"],
  ],
  [
    "frontend/src/app/shell/MobileTopBar.tsx",
    "MobileTopBar",
    "button",
    ["workspace-title-trigger", "text-action"],
  ],
  [
    "frontend/src/app/viewer/CodeViewer.tsx",
    "CopyMenu",
    "button",
    ["copy-contents-command", "copy-path-command"],
  ],
  [
    "frontend/src/app/viewer/CommentThreadPanel.tsx",
    "CommentRow",
    "button",
    ["reanchor-action", "body-edit-trigger"],
  ],
  [
    "frontend/src/platform/errors/ErrorBoundary.tsx",
    "DefaultFallback",
    "button",
    ["app-reload-action", "region-retry-action"],
  ],
] as const satisfies readonly (readonly [
  `frontend/${string}`,
  string,
  NativeControlElement,
  readonly string[],
])[];

function repositoryPath(file: string): `frontend/${string}` {
  return `frontend/${relative(FRONTEND_ROOT, file).replaceAll("\\", "/")}`;
}

function productionSourceFiles(): string[] {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        visit(path);
        continue;
      }
      if (
        CONSOLIDATION_SOURCE_SCOPE.extensions.some((suffix) => path.endsWith(suffix)) &&
        !CONSOLIDATION_SOURCE_SCOPE.excludedSuffixes.some((suffix) =>
          path.endsWith(suffix),
        )
      ) {
        files.push(path);
      }
    }
  };

  for (const root of CONSOLIDATION_SOURCE_SCOPE.roots) {
    visit(resolve(FRONTEND_ROOT, root.replace(/^frontend\//, "")));
  }
  return files;
}

function propertyName(node: ts.PropertyName, sourceFile: ts.SourceFile): string {
  return ts.isIdentifier(node) || ts.isStringLiteralLike(node)
    ? node.text
    : node.getText(sourceFile);
}

function containingVariableName(node: ts.Node): string | null {
  let current: ts.Node | undefined = node.parent;
  while (current !== undefined) {
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
      return current.name.text;
    }
    current = current.parent;
  }
  return null;
}

/**
 * Resolve the nearest named JSX owner without line-number coupling. Object renderer
 * methods include their containing registry (`COMPONENTS.input`), while anonymous
 * map callbacks fall through to the component or helper that owns the returned JSX.
 */
function sourceOwner(node: ts.Node, sourceFile: ts.SourceFile): string {
  let current: ts.Node | undefined = node.parent;
  while (current !== undefined) {
    if (
      (ts.isFunctionDeclaration(current) || ts.isFunctionExpression(current)) &&
      current.name !== undefined
    ) {
      return current.name.text;
    }
    if (ts.isMethodDeclaration(current)) {
      const method = propertyName(current.name, sourceFile);
      const registry = containingVariableName(current);
      return registry === null ? method : `${registry}.${method}`;
    }
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      const parent = current.parent;
      if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
        return parent.name.text;
      }
      if (ts.isPropertyAssignment(parent)) {
        const property = propertyName(parent.name, sourceFile);
        const registry = containingVariableName(parent);
        return registry === null ? property : `${registry}.${property}`;
      }
    }
    current = current.parent;
  }
  throw new Error(`Native JSX control has no stable owner in ${sourceFile.fileName}`);
}

function scanExecutableControls(files: readonly string[]): SourceControlSite[] {
  const sites: SourceControlSite[] = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      extname(file) === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const visit = (node: ts.Node) => {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        ts.isIdentifier(node.tagName) &&
        NATIVE_ELEMENTS.has(node.tagName.text)
      ) {
        const offset = node.getStart(sourceFile);
        sites.push({
          path: repositoryPath(file),
          owner: sourceOwner(node, sourceFile),
          element: node.tagName.text as NativeControlElement,
          offset,
          line: sourceFile.getLineAndCharacterOfPosition(offset).line + 1,
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return sites;
}

function scanRawControlLexemes(files: readonly string[]): RawControlLexeme[] {
  const lexemes: RawControlLexeme[] = [];
  for (const file of files.filter((candidate) => candidate.endsWith(".tsx"))) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/<(?:button|input|select|textarea)\b/g)) {
      const offset = match.index;
      lexemes.push({
        path: repositoryPath(file),
        offset,
        line: source.slice(0, offset).split("\n").length,
      });
    }
  }
  return lexemes;
}

function elementCounts(
  controls: readonly { element: NativeControlElement }[],
): Record<NativeControlElement, number> {
  const counts: Record<NativeControlElement, number> = {
    button: 0,
    input: 0,
    select: 0,
    textarea: 0,
  };
  for (const control of controls) counts[control.element] += 1;
  return counts;
}

/**
 * Give source and ledger sites the same line-independent structural identity.
 * Semantic `slot` names are checked independently for uniqueness; occurrence is
 * scoped to path + owner + element so two controls owned by one component remain
 * distinguishable without making formatting coordinates part of the contract.
 */
function structuralGroupKey(
  control: Pick<SourceControlSite, "path" | "owner" | "element">,
): string {
  return JSON.stringify([control.path, control.owner, control.element]);
}

function sourceStructuralIdentityKeys(
  controls: readonly SourceControlSite[],
): string[] {
  const occurrences = new Map<string, number>();
  return controls.map(({ path, owner, element }) => {
    const group = structuralGroupKey({ path, owner, element });
    const occurrence = occurrences.get(group) ?? 0;
    occurrences.set(group, occurrence + 1);
    return JSON.stringify([path, owner, element, occurrence]);
  });
}

function ledgerStructuralIdentityKeys(
  controls: readonly NativeControlLedgerEntry[],
  sourceControls: readonly SourceControlSite[],
): string[] {
  const sourceGroupCounts = new Map<string, number>();
  for (const control of sourceControls) {
    const group = structuralGroupKey(control);
    sourceGroupCounts.set(group, (sourceGroupCounts.get(group) ?? 0) + 1);
  }

  const boundOccurrences = new Map<string, number>();
  for (const [path, owner, element, slots] of DUPLICATE_SITE_BINDINGS) {
    const group = structuralGroupKey({ path, owner, element });
    expect(
      sourceGroupCounts.get(group),
      `${group} must retain its reviewed repeated-site cardinality`,
    ).toBe(slots.length);
    slots.forEach((slot, occurrence) => {
      boundOccurrences.set(ledgerSourceKey({ path, owner, slot }), occurrence);
    });
  }

  return controls.map(({ source, element }) => {
    const group = structuralGroupKey({ ...source, element });
    const sourceCount = sourceGroupCounts.get(group) ?? 0;
    const occurrence =
      sourceCount <= 1 ? 0 : boundOccurrences.get(ledgerSourceKey(source));
    expect(
      occurrence,
      `${ledgerSourceKey(source)} must have an explicit repeated-site occurrence binding`,
    ).toBeTypeOf("number");
    return JSON.stringify([source.path, source.owner, element, occurrence]);
  });
}

function declaredOwnerNames(file: string): Set<string> {
  const source = readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    extname(file) === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const names = new Set<string>();
  const visit = (node: ts.Node) => {
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isEnumDeclaration(node)) &&
      node.name !== undefined
    ) {
      names.add(node.name.text);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      names.add(node.name.text);
    }
    if (ts.isPropertyAssignment(node) || ts.isMethodDeclaration(node)) {
      const registry = containingVariableName(node);
      if (registry !== null) {
        names.add(`${registry}.${propertyName(node.name, sourceFile)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return names;
}

function rationaleKeys(entry: NativeControlLedgerEntry): string[] {
  return Object.keys(entry.rationale).sort();
}

describe("design-system consolidation native-control ledger", () => {
  const files = productionSourceFiles();
  const executable = scanExecutableControls(files);

  it("pins the syntax-aware executable baseline and excludes the three prose hits", () => {
    expect(executable).toHaveLength(125);
    expect(elementCounts(executable)).toEqual({
      button: 100,
      input: 19,
      select: 1,
      textarea: 5,
    });
    expect(CONSOLIDATION_BASELINE_COUNTS.nativeControlSites).toBe(125);

    const raw = scanRawControlLexemes(files);
    expect(raw).toHaveLength(128);
    const executableOffsets = new Set(
      executable.map(({ path, offset }) => JSON.stringify([path, offset])),
    );
    const prose = raw
      .filter(
        ({ path, offset }) => !executableOffsets.has(JSON.stringify([path, offset])),
      )
      .map(({ path, line }) => ({ path, line }));
    expect(prose).toEqual(
      PROSE_FALSE_POSITIVES.map(({ path, line }) => ({ path, line })),
    );

    for (const falsePositive of PROSE_FALSE_POSITIVES) {
      const line = readFileSync(
        resolve(FRONTEND_ROOT, falsePositive.path.slice(9)),
        "utf8",
      ).split(/\r?\n/)[falsePositive.line - 1];
      expect(line, `${falsePositive.path}:${falsePositive.line}`).toContain(
        falsePositive.text,
      );
      expect(executable).not.toContainEqual(
        expect.objectContaining({
          path: falsePositive.path,
          line: falsePositive.line,
        }),
      );
    }
  });

  it("matches every executable site to the ledger with no missing, stale, or duplicate identity", () => {
    expect(NATIVE_CONTROL_LEDGER).toHaveLength(125);
    const stableKeys = NATIVE_CONTROL_LEDGER.map(({ source }) =>
      ledgerSourceKey(source),
    );
    expect(new Set(stableKeys).size).toBe(125);

    const sourceIdentities = new Set(sourceStructuralIdentityKeys(executable));
    const ledgerIdentities = new Set(
      ledgerStructuralIdentityKeys(NATIVE_CONTROL_LEDGER, executable),
    );
    const missing = [...sourceIdentities].filter((key) => !ledgerIdentities.has(key));
    const stale = [...ledgerIdentities].filter((key) => !sourceIdentities.has(key));
    expect({ missing, stale }).toEqual({ missing: [], stale: [] });
    expect(ledgerIdentities.size).toBe(125);
  });

  it("enforces the current schema, disposition, owner, and rationale contracts", () => {
    expect(CONSOLIDATION_LEDGER.schemaVersion).toBe(
      CONSOLIDATION_LEDGER_SCHEMA_VERSION,
    );
    expect(CONSOLIDATION_LEDGER.nativeControls).toBe(NATIVE_CONTROL_LEDGER);

    const dispositions = new Set<string>(CONSOLIDATION_DISPOSITIONS);
    const ownerLayers = new Set<string>(CANONICAL_OWNER_LAYERS);
    const elements = new Set<string>(NATIVE_CONTROL_ELEMENTS);
    for (const entry of NATIVE_CONTROL_LEDGER) {
      expect(elements.has(entry.element), ledgerSourceKey(entry.source)).toBe(true);
      expect(dispositions.has(entry.disposition), ledgerSourceKey(entry.source)).toBe(
        true,
      );
      expect(
        ["canonical-owner", "migrate", "retain-semantic-seam", "repair-local-defect"],
        ledgerSourceKey(entry.source),
      ).toContain(entry.disposition);
      expect(ownerLayers.has(entry.canonicalOwner.layer)).toBe(true);
      expect(entry.canonicalOwner.path.startsWith("frontend/")).toBe(true);
      expect(entry.canonicalOwner.path.includes("\\")).toBe(false);
      expect(entry.canonicalOwner.name.trim()).not.toBe("");
      expect(["existing", "planned"]).toContain(entry.canonicalOwner.status);
      if (entry.canonicalOwner.status === "existing") {
        const ownerFile = resolve(
          FRONTEND_ROOT,
          entry.canonicalOwner.path.slice("frontend/".length),
        );
        expect(existsSync(ownerFile), entry.canonicalOwner.path).toBe(true);
        expect(
          declaredOwnerNames(ownerFile).has(entry.canonicalOwner.name),
          `${entry.canonicalOwner.path} must declare ${entry.canonicalOwner.name}`,
        ).toBe(true);
      }

      expect(entry.source.owner.trim()).not.toBe("");
      expect(entry.source.slot.trim()).not.toBe("");
      expect(entry.source.path.includes("\\")).toBe(false);
      expect(
        CONSOLIDATION_SOURCE_SCOPE.roots.some((root) =>
          entry.source.path.startsWith(`${root}/`),
        ),
      ).toBe(true);
      expect(
        CONSOLIDATION_SOURCE_SCOPE.excludedSuffixes.some((suffix) =>
          entry.source.path.endsWith(suffix),
        ),
      ).toBe(false);
      expect(existsSync(resolve(FRONTEND_ROOT, entry.source.path.slice(9)))).toBe(true);

      const required = [...DISPOSITION_RATIONALE_FIELDS[entry.disposition]].sort();
      expect(rationaleKeys(entry), ledgerSourceKey(entry.source)).toEqual(required);
      for (const field of required) {
        expect(
          (entry.rationale as Record<string, string>)[field]?.trim(),
          `${ledgerSourceKey(entry.source)} rationale.${field}`,
        ).not.toBe("");
      }
    }
  });
});
