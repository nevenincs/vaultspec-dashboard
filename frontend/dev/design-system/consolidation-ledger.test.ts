import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, relative, resolve } from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  CANONICAL_OWNER_LAYERS,
  CHROME_AND_SHELL_RELATIVE_VALUE_LEDGER,
  CONSOLIDATION_BASELINE_COUNTS,
  CONSOLIDATION_DISPOSITIONS,
  CONSOLIDATION_INVARIANT_BOUNDARIES,
  CONSOLIDATION_INVARIANTS,
  CONSOLIDATION_LEDGER,
  CONSOLIDATION_LEDGER_SCHEMA_VERSION,
  CONSOLIDATION_SOURCE_SCOPE,
  DISPOSITION_RATIONALE_FIELDS,
  KIT_RELATIVE_VALUE_LEDGER,
  invariantEvidenceKey,
  ledgerSourceKey,
  NAMING_DEBT_LEDGER,
  NATIVE_CONTROL_ELEMENTS,
  NATIVE_CONTROL_LEDGER,
  PALETTE_AND_AGENT_RELATIVE_VALUE_LEDGER,
  RELATIVE_VALUE_LEDGER,
  RELATIVE_VALUE_UNITS,
  RESIDUAL_RELATIVE_VALUE_LEDGER,
  STAGE_AND_TIMELINE_RELATIVE_VALUE_LEDGER,
  VIEWER_RELATIVE_VALUE_LEDGER,
  type NativeControlElement,
  type NativeControlLedgerEntry,
  type NamingDebtLedgerEntry,
  type RelativeValueLedgerEntry,
  type RelativeValueUnit,
} from "./consolidation-ledger";

const FRONTEND_ROOT = resolve(import.meta.dirname, "../..");
const REPOSITORY_ROOT = resolve(FRONTEND_ROOT, "..");
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

interface RelativeValueLineSite {
  path: `frontend/${string}`;
  line: number;
  expression: string;
}

const RAW_RELATIVE_VALUE_PATTERN = /\[[^\]]*(?:rem|em|vw|vh|%)\]/;
const ARBITRARY_UTILITY_PATTERN = /(?:^|[\s"'`])([@!a-zA-Z0-9:_-]+-\[[^\]\r\n]+\])/g;
const NUMERIC_RELATIVE_UNIT_PATTERN =
  /[-+]?(?:\d+(?:\.\d+)?|\.\d+)(cqw|rem|em|vw|vh|%)/g;

const RELATIVE_SCANNER_DEFECTS = [
  {
    path: "frontend/src/app/left/CreateDocDialog.tsx",
    owner: "CreateDocDialog",
    slot: "related-array-scan-false-positive",
    expression: "[...related, stem]",
    units: ["em"],
  },
  {
    path: "frontend/src/app/viewer/RelatedDocPicker.tsx",
    owner: "RelatedDocPicker",
    slot: "selected-array-scan-false-positive",
    expression: "[...selected, stem]",
    units: ["em"],
  },
  {
    path: "frontend/src/app/stage/CategoryLegend.tsx",
    owner: "CategoryLegend",
    slot: "active-item-destructure-scan-false-positive",
    expression: "[activeItem, setActiveItem]",
    units: ["em"],
  },
  {
    path: "frontend/src/app/timeline/DateBasisSelect.tsx",
    owner: "DateBasisSelect",
    slot: "menu-width-comment-scan-false-positive",
    expression: "min-w-[11rem]",
    units: ["rem"],
  },
  {
    path: "frontend/src/app/left/FolderBrowser.tsx",
    owner: "FolderBrowser",
    slot: "focus-effect-dependencies-scan-false-positive",
    expression: "[currentPath, firstRowPath, focusIntent, focusItem]",
    units: ["em"],
  },
] as const satisfies readonly {
  path: `frontend/${string}`;
  owner: string;
  slot: string;
  expression: string;
  units: readonly [RelativeValueUnit, ...RelativeValueUnit[]];
}[];

const DOCUMENTED_RELATIVE_VALUE_EXAMPLE = {
  path: "frontend/src/app/kit/Skeleton.tsx",
  expression: "w-[5rem]",
  slot: "width-api-documentation-example",
} as const;

const RELATIVE_VALUE_PARTITIONS = [
  ["S172", KIT_RELATIVE_VALUE_LEDGER, 18],
  ["S173", CHROME_AND_SHELL_RELATIVE_VALUE_LEDGER, 14],
  ["S174", VIEWER_RELATIVE_VALUE_LEDGER, 24],
  ["S175", PALETTE_AND_AGENT_RELATIVE_VALUE_LEDGER, 9],
  ["S176", STAGE_AND_TIMELINE_RELATIVE_VALUE_LEDGER, 16],
  ["S177", RESIDUAL_RELATIVE_VALUE_LEDGER, 25],
] as const satisfies readonly (readonly [
  string,
  readonly RelativeValueLedgerEntry[],
  number,
])[];

const CAMPAIGN_COMPONENT_NAMING_DEBT = [
  {
    path: "frontend/src/app/kit/TextField.tsx",
    name: "TextField",
    debtKind: "code-only-name",
    layer: "app-kit",
    status: "planned",
  },
  {
    path: "frontend/src/app/kit/TextArea.tsx",
    name: "TextArea",
    debtKind: "code-only-name",
    layer: "app-kit",
    status: "planned",
  },
  {
    path: "frontend/src/app/kit/OptionRow.tsx",
    name: "OptionRow",
    debtKind: "code-only-name",
    layer: "app-kit",
    status: "planned",
  },
  {
    path: "frontend/src/app/kit/ActivityIndicator.tsx",
    name: "ActivityIndicator",
    debtKind: "unresolved-design-alias",
    layer: "app-kit",
    status: "existing",
  },
  {
    path: "frontend/src/app/chrome/AppErrorBoundary.tsx",
    name: "AppErrorBoundary",
    debtKind: "code-only-name",
    layer: "shared-chrome",
    status: "planned",
  },
  {
    path: "frontend/src/app/chrome/ModalSurface.tsx",
    name: "ModalSurface",
    debtKind: "code-only-name",
    layer: "shared-chrome",
    status: "planned",
  },
] as const satisfies readonly {
  path: `frontend/${string}`;
  name: string;
  debtKind: NamingDebtLedgerEntry["debtKind"];
  layer: NamingDebtLedgerEntry["canonicalOwner"]["layer"];
  status: NamingDebtLedgerEntry["canonicalOwner"]["status"];
}[];

const EXPECTED_CAMPAIGN_INVARIANTS = [
  ["scene-source-byte-freeze", "scene-source"],
  ["graph-semantics-freeze", "graph-semantics"],
  ["store-policy-preservation", "store-policy"],
  ["wire-contract-preservation", "wire-contract"],
  ["responsive-mode-preservation", "responsive-mode"],
  ["no-figma-campaign-evidence", "figma-exclusion"],
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

function normalizeRelativeExpression(expression: string): string {
  return expression.replace(/\s+/g, " ").trim();
}

function arbitraryRelativeUtilities(text: string): string[] {
  const utilities: string[] = [];
  for (const match of text.matchAll(
    new RegExp(ARBITRARY_UTILITY_PATTERN.source, "g"),
  )) {
    const utility = match[1];
    if (
      utility !== undefined &&
      new RegExp(NUMERIC_RELATIVE_UNIT_PATTERN.source).test(utility)
    ) {
      utilities.push(utility);
    }
  }
  return utilities;
}

function scanRawRelativeValueLines(files: readonly string[]): RelativeValueLineSite[] {
  const sites: RelativeValueLineSite[] = [];
  for (const file of files.filter((candidate) => candidate.endsWith(".tsx"))) {
    const source = readFileSync(file, "utf8");
    source.split(/\r?\n/).forEach((line, index) => {
      if (!RAW_RELATIVE_VALUE_PATTERN.test(line)) return;
      const utilities = arbitraryRelativeUtilities(line);
      const falsePositive = line.match(RAW_RELATIVE_VALUE_PATTERN)?.[0];
      const expression = utilities.join(" ") || falsePositive;
      if (expression === undefined) {
        throw new Error(`Raw relative-value match has no expression in ${file}`);
      }
      sites.push({
        path: repositoryPath(file),
        line: index + 1,
        expression: normalizeRelativeExpression(expression),
      });
    });
  }
  return sites;
}

function stringLiteralSpans(sourceFile: ts.SourceFile): readonly [number, number][] {
  const spans = new Map<string, [number, number]>();
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteralLike(node) ||
      node.kind === ts.SyntaxKind.TemplateHead ||
      node.kind === ts.SyntaxKind.TemplateMiddle ||
      node.kind === ts.SyntaxKind.TemplateTail
    ) {
      const span: [number, number] = [node.getStart(sourceFile), node.getEnd()];
      spans.set(JSON.stringify(span), span);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...spans.values()];
}

function scanExecutableRelativeValueLines(
  files: readonly string[],
): RelativeValueLineSite[] {
  const sites: RelativeValueLineSite[] = [];
  for (const file of files.filter((candidate) => candidate.endsWith(".tsx"))) {
    const source = readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const spans = stringLiteralSpans(sourceFile);
    const sourceLines = source.split(/\r?\n/);
    const byLine = new Map<number, { offset: number; utilities: string[] }>();
    for (const match of source.matchAll(
      new RegExp(ARBITRARY_UTILITY_PATTERN.source, "g"),
    )) {
      const utility = match[1];
      if (
        utility === undefined ||
        !new RegExp(NUMERIC_RELATIVE_UNIT_PATTERN.source).test(utility)
      ) {
        continue;
      }
      const relativeOffset = match[0].lastIndexOf(utility);
      const offset = (match.index ?? 0) + relativeOffset;
      const end = offset + utility.length;
      if (!spans.some(([start, finish]) => offset >= start && end <= finish)) continue;
      const line = sourceFile.getLineAndCharacterOfPosition(offset).line + 1;
      // Preserve the accepted dated raw-line baseline: a compound line enters the
      // inventory only when the original scanner sees a supported suffix before
      // `]`. Once admitted, retain every co-located supported-unit utility.
      if (!RAW_RELATIVE_VALUE_PATTERN.test(sourceLines[line - 1] ?? "")) continue;
      const group = byLine.get(line) ?? { offset, utilities: [] };
      group.offset = Math.min(group.offset, offset);
      group.utilities.push(utility);
      byLine.set(line, group);
    }
    for (const [line, group] of [...byLine].sort((a, b) => a[1].offset - b[1].offset)) {
      sites.push({
        path: repositoryPath(file),
        line,
        expression: normalizeRelativeExpression(group.utilities.join(" ")),
      });
    }
  }
  return sites;
}

function relativeSiteKey(
  site: Pick<RelativeValueLineSite, "path" | "expression">,
): string {
  return JSON.stringify([site.path, normalizeRelativeExpression(site.expression)]);
}

function ledgerRelativeSiteKey(entry: RelativeValueLedgerEntry): string {
  return relativeSiteKey({ path: entry.source.path, expression: entry.expression });
}

function multisetDifference(
  left: readonly string[],
  right: readonly string[],
): string[] {
  const available = new Map<string, number>();
  for (const key of right) available.set(key, (available.get(key) ?? 0) + 1);
  const difference: string[] = [];
  for (const key of left) {
    const remaining = available.get(key) ?? 0;
    if (remaining === 0) difference.push(key);
    else available.set(key, remaining - 1);
  }
  return difference;
}

function duplicateKeys(keys: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...counts].filter(([, count]) => count > 1).map(([key]) => key);
}

function numericRelativeUnits(expression: string): RelativeValueUnit[] {
  const units: RelativeValueUnit[] = [];
  for (const match of expression.matchAll(
    new RegExp(NUMERIC_RELATIVE_UNIT_PATTERN.source, "g"),
  )) {
    const unit = match[1] as RelativeValueUnit;
    if (!units.includes(unit)) units.push(unit);
  }
  return units;
}

function jsonTokenExists(file: string, tokenName: string): boolean {
  let value: unknown = JSON.parse(readFileSync(file, "utf8"));
  for (const segment of tokenName.split(".")) {
    if (typeof value !== "object" || value === null || !(segment in value))
      return false;
    value = (value as Record<string, unknown>)[segment];
  }
  return true;
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

function rationaleKeys(
  entry: Pick<
    NativeControlLedgerEntry | RelativeValueLedgerEntry | NamingDebtLedgerEntry,
    "rationale"
  >,
): string[] {
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

describe("design-system consolidation relative-value ledger", () => {
  const files = productionSourceFiles();
  const raw = scanRawRelativeValueLines(files);
  const executable = scanExecutableRelativeValueLines(files);
  const ledgerKeys = RELATIVE_VALUE_LEDGER.map(ledgerRelativeSiteKey);
  const rawKeys = raw.map(relativeSiteKey);

  it("separates executable utilities from the reviewed raw-scanner exceptions", () => {
    expect(CONSOLIDATION_BASELINE_COUNTS.arbitraryRelativeValueSites).toBe(106);
    expect(raw).toHaveLength(106);
    expect(executable).toHaveLength(100);

    const rawOnly = multisetDifference(rawKeys, executable.map(relativeSiteKey));
    const expectedRawOnly = [
      ...RELATIVE_SCANNER_DEFECTS,
      DOCUMENTED_RELATIVE_VALUE_EXAMPLE,
    ].map(relativeSiteKey);
    expect(multisetDifference(rawOnly, expectedRawOnly)).toEqual([]);
    expect(multisetDifference(expectedRawOnly, rawOnly)).toEqual([]);

    const repairs = RELATIVE_VALUE_LEDGER.filter(
      ({ disposition }) => disposition === "repair-local-defect",
    );
    expect(repairs).toHaveLength(RELATIVE_SCANNER_DEFECTS.length);
    for (const defect of RELATIVE_SCANNER_DEFECTS) {
      expect(repairs).toContainEqual(
        expect.objectContaining({
          source: {
            path: defect.path,
            owner: defect.owner,
            slot: defect.slot,
          },
          expression: defect.expression,
          units: defect.units,
          disposition: "repair-local-defect",
        }),
      );
    }

    expect(RELATIVE_VALUE_LEDGER).toContainEqual(
      expect.objectContaining({
        source: expect.objectContaining({
          path: DOCUMENTED_RELATIVE_VALUE_EXAMPLE.path,
          slot: DOCUMENTED_RELATIVE_VALUE_EXAMPLE.slot,
        }),
        expression: DOCUMENTED_RELATIVE_VALUE_EXAMPLE.expression,
        disposition: "retain-exact-geometry",
      }),
    );
    expect(
      raw.find(({ path }) => path === "frontend/src/app/kit/Breadcrumb.tsx")
        ?.expression,
    ).toBe("text-[0.8125rem]");
    expect(
      RELATIVE_VALUE_LEDGER.find(
        ({ source }) =>
          source.path === "frontend/src/app/viewer/CommentThreadPanel.tsx" &&
          source.slot === "thread-panel-viewport-bounds",
      ),
    ).toEqual(expect.objectContaining({ units: expect.arrayContaining(["cqw"]) }));
  });

  it("partitions all 106 raw line-sites without overlaps, missing sites, or stale sites", () => {
    for (const [step, partition, expectedCount] of RELATIVE_VALUE_PARTITIONS) {
      expect(partition, step).toHaveLength(expectedCount);
    }
    const partitionEntries = RELATIVE_VALUE_PARTITIONS.flatMap(([, entries]) => [
      ...entries,
    ]);
    expect(partitionEntries).toHaveLength(106);
    expect(RELATIVE_VALUE_LEDGER).toEqual(partitionEntries);

    const stableKeys = RELATIVE_VALUE_LEDGER.map(({ source }) =>
      ledgerSourceKey(source),
    );
    expect(duplicateKeys(stableKeys)).toEqual([]);
    expect(multisetDifference(rawKeys, ledgerKeys)).toEqual([]);
    expect(multisetDifference(ledgerKeys, rawKeys)).toEqual([]);
  });

  it("enforces relative-value schema, ownership, unit, and rationale completeness", () => {
    expect(CONSOLIDATION_LEDGER.relativeValues).toBe(RELATIVE_VALUE_LEDGER);
    const allowedDispositions = new Set([
      "migrate",
      "retain-exact-geometry",
      "repair-local-defect",
    ]);
    const allowedUnits = new Set<string>(RELATIVE_VALUE_UNITS);
    const ownerLayers = new Set<string>(CANONICAL_OWNER_LAYERS);

    for (const entry of RELATIVE_VALUE_LEDGER) {
      const key = ledgerSourceKey(entry.source);
      expect(allowedDispositions.has(entry.disposition), key).toBe(true);
      expect(entry.expression.trim(), key).not.toBe("");
      expect(entry.units.length, key).toBeGreaterThan(0);
      expect(new Set(entry.units).size, key).toBe(entry.units.length);
      expect(
        entry.units.every((unit) => allowedUnits.has(unit)),
        key,
      ).toBe(true);

      const defect = RELATIVE_SCANNER_DEFECTS.find(
        ({ path, owner, slot }) => ledgerSourceKey({ path, owner, slot }) === key,
      );
      if (defect !== undefined) expect(entry.units, key).toEqual(defect.units);
      else expect(entry.units, key).toEqual(numericRelativeUnits(entry.expression));

      expect(ownerLayers.has(entry.canonicalOwner.layer), key).toBe(true);
      expect(entry.canonicalOwner.path.startsWith("frontend/"), key).toBe(true);
      expect(entry.canonicalOwner.path.includes("\\"), key).toBe(false);
      expect(entry.canonicalOwner.name.trim(), key).not.toBe("");
      expect(["existing", "planned"], key).toContain(entry.canonicalOwner.status);
      if (entry.canonicalOwner.status === "existing") {
        const ownerFile = resolve(
          FRONTEND_ROOT,
          entry.canonicalOwner.path.slice("frontend/".length),
        );
        expect(existsSync(ownerFile), entry.canonicalOwner.path).toBe(true);
        if (extname(ownerFile) === ".json") {
          expect(
            jsonTokenExists(ownerFile, entry.canonicalOwner.name),
            `${entry.canonicalOwner.path} must define ${entry.canonicalOwner.name}`,
          ).toBe(true);
        } else {
          expect(
            declaredOwnerNames(ownerFile).has(entry.canonicalOwner.name),
            `${entry.canonicalOwner.path} must declare ${entry.canonicalOwner.name}`,
          ).toBe(true);
        }
      }

      expect(entry.source.owner.trim(), key).not.toBe("");
      expect(entry.source.slot.trim(), key).not.toBe("");
      expect(entry.source.path.includes("\\"), key).toBe(false);
      expect(
        CONSOLIDATION_SOURCE_SCOPE.roots.some((root) =>
          entry.source.path.startsWith(`${root}/`),
        ),
        key,
      ).toBe(true);
      expect(existsSync(resolve(FRONTEND_ROOT, entry.source.path.slice(9))), key).toBe(
        true,
      );

      const required = [...DISPOSITION_RATIONALE_FIELDS[entry.disposition]].sort();
      expect(rationaleKeys(entry), key).toEqual(required);
      for (const field of required) {
        expect(
          (entry.rationale as Record<string, string>)[field]?.trim(),
          `${key} rationale.${field}`,
        ).not.toBe("");
      }
    }
  });

  it("detects representative missing, stale, and duplicate ledger mutations", () => {
    const missingEntry = ledgerKeys.slice(1);
    expect(multisetDifference(rawKeys, missingEntry)).toEqual([ledgerKeys[0]]);

    const staleEntry = [...ledgerKeys];
    staleEntry[0] = relativeSiteKey({
      path: "frontend/src/app/stale.tsx",
      expression: "w-[1rem]",
    });
    expect(multisetDifference(rawKeys, staleEntry)).toEqual([ledgerKeys[0]]);
    expect(multisetDifference(staleEntry, rawKeys)).toEqual([staleEntry[0]]);

    const stableKeys = RELATIVE_VALUE_LEDGER.map(({ source }) =>
      ledgerSourceKey(source),
    );
    expect(duplicateKeys([...stableKeys, stableKeys[0]])).toEqual([stableKeys[0]]);
  });
});

describe("design-system consolidation naming-debt ledger", () => {
  it("exhaustively records the six campaign-scoped component names", () => {
    const actual = NAMING_DEBT_LEDGER.map(
      ({ source, codeName, debtKind, canonicalOwner }) => ({
        path: source.path,
        name: codeName,
        debtKind,
        layer: canonicalOwner.layer,
        status: canonicalOwner.status,
      }),
    );
    expect(actual).toEqual(CAMPAIGN_COMPONENT_NAMING_DEBT);
    expect(NAMING_DEBT_LEDGER).toHaveLength(6);
    expect(
      NAMING_DEBT_LEDGER.filter(({ debtKind }) => debtKind === "code-only-name"),
    ).toHaveLength(5);
    expect(
      NAMING_DEBT_LEDGER.filter(
        ({ debtKind }) => debtKind === "unresolved-design-alias",
      ),
    ).toHaveLength(1);

    const plannedPrimitiveOwners = [
      ...new Map(
        NATIVE_CONTROL_LEDGER.filter(
          ({ canonicalOwner }) =>
            canonicalOwner.status === "planned" &&
            canonicalOwner.layer === "app-kit" &&
            canonicalOwner.path.endsWith(".tsx"),
        ).map(({ canonicalOwner }) => [canonicalOwner.name, canonicalOwner]),
      ).values(),
    ].map(({ path, name }) => ({ path, name }));
    expect(plannedPrimitiveOwners).toEqual(
      CAMPAIGN_COMPONENT_NAMING_DEBT.slice(0, 3).map(({ path, name }) => ({
        path,
        name,
      })),
    );
  });

  it("enforces stable identities, unresolved aliases, owners, and debt rationale", () => {
    expect(CONSOLIDATION_LEDGER.namingDebt).toBe(NAMING_DEBT_LEDGER);
    const stableKeys = NAMING_DEBT_LEDGER.map(({ source }) => ledgerSourceKey(source));
    expect(duplicateKeys(stableKeys)).toEqual([]);
    expect(new Set(NAMING_DEBT_LEDGER.map(({ codeName }) => codeName)).size).toBe(
      NAMING_DEBT_LEDGER.length,
    );

    for (const entry of NAMING_DEBT_LEDGER) {
      const key = ledgerSourceKey(entry.source);
      expect(entry.source.owner, key).toBe(entry.codeName);
      expect(entry.source.slot, key).toBe("component-export-name");
      expect(entry.designAlias, key).toBeNull();
      expect(entry.disposition, key).toBe("track-parity-debt");
      expect(entry.canonicalOwner.name, key).toBe(entry.codeName);
      expect(entry.canonicalOwner.path, key).toBe(entry.source.path);
      expect(["app-kit", "shared-chrome"], key).toContain(entry.canonicalOwner.layer);

      const sourceFile = resolve(FRONTEND_ROOT, entry.source.path.slice(9));
      if (entry.canonicalOwner.status === "existing") {
        expect(existsSync(sourceFile), key).toBe(true);
        expect(declaredOwnerNames(sourceFile).has(entry.codeName), key).toBe(true);
        expect(readFileSync(sourceFile, "utf8"), key).not.toMatch(
          /^\s*\/\/\s*@figma\s/m,
        );
      } else {
        expect(entry.canonicalOwner.status, key).toBe("planned");
        expect(existsSync(sourceFile), key).toBe(false);
      }

      const required = [...DISPOSITION_RATIONALE_FIELDS["track-parity-debt"]].sort();
      expect(rationaleKeys(entry), key).toEqual(required);
      for (const field of required) {
        expect(
          (entry.rationale as Record<string, string>)[field]?.trim(),
          `${key} rationale.${field}`,
        ).not.toBe("");
      }
      expect(entry.rationale.unresolvedBinding, key).toContain("no-Figma");
      expect(entry.rationale.reconciliation, key).toContain(
        "separately authorized design reconciliation",
      );
    }
  });
});

describe("design-system consolidation campaign invariants", () => {
  it("pins one explicit invariant to each accepted campaign boundary", () => {
    expect(CONSOLIDATION_INVARIANTS.map(({ id, boundary }) => [id, boundary])).toEqual(
      EXPECTED_CAMPAIGN_INVARIANTS,
    );
    expect(CONSOLIDATION_INVARIANTS).toHaveLength(6);
    expect(new Set(CONSOLIDATION_INVARIANTS.map(({ id }) => id)).size).toBe(6);
    expect(CONSOLIDATION_INVARIANTS.map(({ boundary }) => boundary)).toEqual(
      CONSOLIDATION_INVARIANT_BOUNDARIES,
    );
    expect(CONSOLIDATION_LEDGER.invariants).toBe(CONSOLIDATION_INVARIANTS);
  });

  it("requires unique live evidence identities and enforceable statements", () => {
    const allEvidenceKeys: string[] = [];
    const allEvidencePaths: string[] = [];
    for (const invariant of CONSOLIDATION_INVARIANTS) {
      expect(invariant.id.trim()).not.toBe("");
      expect(invariant.statement.trim(), invariant.id).not.toBe("");
      expect(invariant.rationale.trim(), invariant.id).not.toBe("");
      expect(invariant.evidence.length, invariant.id).toBeGreaterThan(0);

      const evidenceKeys = invariant.evidence.map(invariantEvidenceKey);
      expect(duplicateKeys(evidenceKeys), invariant.id).toEqual([]);
      allEvidenceKeys.push(...evidenceKeys);
      allEvidencePaths.push(...invariant.evidence.map(({ path }) => path));
      for (const evidence of invariant.evidence) {
        const evidencePath = resolve(REPOSITORY_ROOT, evidence.path);
        expect(existsSync(evidencePath), invariantEvidenceKey(evidence)).toBe(true);
        expect(evidence.owner.trim(), invariant.id).not.toBe("");
        expect(evidence.slot.trim(), invariant.id).not.toBe("");
        if (
          evidence.path.startsWith("frontend/") &&
          [".ts", ".tsx"].includes(extname(evidence.path))
        ) {
          expect(
            declaredOwnerNames(evidencePath).has(evidence.owner),
            `${evidence.path} must declare ${evidence.owner}`,
          ).toBe(true);
        }
      }
    }
    expect(duplicateKeys(allEvidenceKeys)).toEqual([]);
    expect(allEvidencePaths.some((path) => path.startsWith(".vault/adr/"))).toBe(true);
    expect(allEvidencePaths.some((path) => path.startsWith(".codex/rules/"))).toBe(
      true,
    );
  });

  it("links the scene freeze to its exact worktree fingerprint and controller contract", () => {
    const baselinePath = resolve(
      FRONTEND_ROOT,
      "dev/design-system/scene-freeze-baseline.json",
    );
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as {
      schema: string;
      sceneDiffFingerprint: { algorithm: string; value: string };
      sceneControllerContract: { path: string; worktreeSha256: string };
    };
    expect(baseline.schema).toBe("vaultspec.design-system.scene-freeze-baseline.v1");
    expect(baseline.sceneControllerContract.path).toBe(
      "frontend/src/scene/sceneController.ts",
    );
    expect(baseline.sceneControllerContract.worktreeSha256).toMatch(/^[a-f0-9]{64}$/);

    const sceneDiff = spawnSync("git", ["diff", "--", "frontend/src/scene"], {
      cwd: REPOSITORY_ROOT,
      encoding: "buffer",
    });
    expect(sceneDiff.status).toBe(0);
    const fingerprint = spawnSync("git", ["hash-object", "--stdin"], {
      cwd: REPOSITORY_ROOT,
      input: sceneDiff.stdout,
      encoding: "utf8",
    });
    expect(fingerprint.status).toBe(0);
    expect(baseline.sceneDiffFingerprint.algorithm).toBe("git-blob-sha1");
    expect(fingerprint.stdout.trim()).toBe(baseline.sceneDiffFingerprint.value);

    const sceneInvariant = CONSOLIDATION_INVARIANTS.find(
      ({ boundary }) => boundary === "scene-source",
    );
    expect(sceneInvariant?.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "frontend/dev/design-system/scene-freeze-baseline.json",
          slot: "worktree-preimages",
        }),
        expect.objectContaining({
          path: baseline.sceneControllerContract.path,
          owner: "SceneController",
        }),
      ]),
    );
  });

  it("keeps the no-Figma fence explicit without changing long-term authority", () => {
    const invariant = CONSOLIDATION_INVARIANTS.find(
      ({ boundary }) => boundary === "figma-exclusion",
    );
    expect(invariant?.statement).toContain("does not use Figma capture");
    expect(invariant?.statement).toContain("makes no Figma-parity claim");
    expect(invariant?.statement).toContain(
      "does not supersede Figma's separate long-term design authority",
    );
    expect(invariant?.evidence.map(({ path }) => path)).toEqual([
      ".vault/adr/2026-09-05-design-system-consolidation-adr.md",
      ".vault/research/2026-09-05-design-system-consolidation-horizontal-polish-research.md",
      ".codex/rules/design-system.md",
    ]);
  });
});
