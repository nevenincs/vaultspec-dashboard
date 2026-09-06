#!/usr/bin/env node

import { Buffer } from "node:buffer";
import {
  readFileSync,
  readdirSync,
  lstatSync,
  realpathSync,
  existsSync,
} from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const defaultFrontendRoot = resolve(here, "..", "..");

const LIMITS = Object.freeze({
  files: 5_000,
  fileBytes: 2 * 1024 * 1024,
  findings: 50_000,
  gitBytes: 16 * 1024 * 1024,
  gitTimeoutMs: 15_000,
  snippetChars: 180,
});

const REPORT_SCHEMA = "vaultspec.design-system.scan.v1";
const LEDGER_PATH = "frontend/dev/design-system/consolidation-ledger.ts";
const NATIVE_ELEMENT_COUNTS = Object.freeze({
  button: 100,
  input: 19,
  select: 1,
  textarea: 5,
});
const EXPECTED_INVARIANTS = Object.freeze([
  ["scene-source-byte-freeze", "scene-source"],
  ["graph-semantics-freeze", "graph-semantics"],
  ["store-policy-preservation", "store-policy"],
  ["wire-contract-preservation", "wire-contract"],
  ["responsive-mode-preservation", "responsive-mode"],
  ["no-figma-campaign-evidence", "figma-exclusion"],
]);

const PENDING_APP_KIT_DEEP_IMPORTS = new Set([
  keyOf("frontend/src/app/agent/AgentBeginView.tsx", "../kit/StateBlock"),
  keyOf(
    "frontend/src/app/chrome/DataActivityIndicator.tsx",
    "../kit/ActivityIndicator",
  ),
  keyOf("frontend/src/app/chrome/RowMenuDisclosure.tsx", "../kit/IconButton"),
  keyOf("frontend/src/app/settings/AdvancedSection.tsx", "../kit/FoldSection"),
  keyOf("frontend/src/app/shell/BottomTabBar.tsx", "../kit/glyphs"),
  keyOf("frontend/src/app/shell/CompactAppShell.tsx", "../kit/glyphs"),
  keyOf("frontend/src/app/shell/IconRail.tsx", "../kit/glyphs"),
  keyOf("frontend/src/app/shell/MobileTopBar.tsx", "../kit/glyphs"),
  keyOf("frontend/src/app/stage/DockWorkspace.tsx", "../kit/glyphs"),
  keyOf("frontend/src/app/stage/FilterMenu.tsx", "../kit/FacetRow"),
  keyOf("frontend/src/app/timeline/DateBasisSelect.tsx", "../kit/glyphs"),
  keyOf("frontend/src/app/viewer/AutocompleteCombobox.tsx", "../kit/category"),
]);

const PENDING_LOWER_LAYER_KIT_IMPORTS = new Set([
  keyOf("frontend/src/stores/view/filterPresentation.ts", "../../app/kit/FacetRow"),
]);

const KNOWN_RELATIVE_SCANNER_DEFECTS = Object.freeze([
  {
    path: "frontend/src/app/left/CreateDocDialog.tsx",
    owner: "CreateDocDialog",
    slot: "related-array-scan-false-positive",
    expression: "[...related, stem]",
  },
  {
    path: "frontend/src/app/viewer/RelatedDocPicker.tsx",
    owner: "RelatedDocPicker",
    slot: "selected-array-scan-false-positive",
    expression: "[...selected, stem]",
  },
  {
    path: "frontend/src/app/stage/CategoryLegend.tsx",
    owner: "CategoryLegend",
    slot: "active-item-destructure-scan-false-positive",
    expression: "[activeItem, setActiveItem]",
  },
  {
    path: "frontend/src/app/timeline/DateBasisSelect.tsx",
    owner: "DateBasisSelect",
    slot: "menu-width-comment-scan-false-positive",
    expression: "min-w-[11rem]",
  },
  {
    path: "frontend/src/app/left/FolderBrowser.tsx",
    owner: "FolderBrowser",
    slot: "focus-effect-dependencies-scan-false-positive",
    expression: "[currentPath, firstRowPath, focusIntent, focusItem]",
  },
]);

const DOCUMENTED_RELATIVE_VALUE_EXAMPLE = Object.freeze({
  path: "frontend/src/app/kit/Skeleton.tsx",
  owner: "SkeletonBar",
  slot: "width-api-documentation-example",
  expression: "w-[5rem]",
});

// Repeated native controls are bound explicitly instead of trusting ledger order.
// Each slot maps to the zero-based AST occurrence within path + owner + element.
const DUPLICATE_SITE_BINDINGS = Object.freeze([
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
]);

const NUMERIC_RELATIVE_UNIT_PATTERN =
  /[-+]?(?:\d+(?:\.\d+)?|\.\d+)(cqw|rem|em|vw|vh|%)/gu;
const RAW_RELATIVE_VALUE_PATTERN = /\[[^\]]*(?:cqw|rem|em|vw|vh|%)\]/u;
const ARBITRARY_UTILITY_PATTERN = /(?:^|[\s"'`])([@!a-zA-Z0-9:_-]+-\[[^\]\r\n]+\])/gu;
const TEST_SOURCE = /\.(?:test|spec)\.[tj]sx?$/u;
const SOURCE_EXTENSION = /\.[tj]sx?$/u;

function keyOf(...parts) {
  return JSON.stringify(parts);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function insideRoot(file, root) {
  const rel = relative(root, file);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function repositoryPath(frontendRoot, file) {
  return `frontend/${relative(frontendRoot, file).split(sep).join("/")}`;
}

function normalizeExpression(expression) {
  return expression.replace(/\s+/gu, " ").trim();
}

function validRepositoryPath(path, roots = ["frontend/"]) {
  if (
    typeof path !== "string" ||
    !roots.some((root) => path.startsWith(root)) ||
    path.includes("\\")
  ) {
    return false;
  }
  return !path
    .split("/")
    .some((segment) => segment === "" || segment === "." || segment === "..");
}

function lineAndColumn(sourceFile, offset) {
  const position = sourceFile.getLineAndCharacterOfPosition(offset);
  return { line: position.line + 1, column: position.character + 1 };
}

function collectFiles(root, accept, frontendRoot) {
  if (!existsSync(root)) return [];
  const canonicalRoot = realpathSync(root);
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      compareText(a.name, b.name),
    )) {
      const full = join(directory, entry.name);
      const stat = lstatSync(full);
      if (stat.isSymbolicLink()) {
        throw new Error(
          `Design-system scan refuses symbolic links: ${repositoryPath(frontendRoot, full)}`,
        );
      }
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      if (!stat.isFile() || !accept(full)) continue;
      const canonical = realpathSync(full);
      if (!insideRoot(canonical, canonicalRoot)) {
        throw new Error(
          `Design-system scan found an out-of-root file: ${repositoryPath(frontendRoot, full)}`,
        );
      }
      if (stat.size > LIMITS.fileBytes) {
        throw new Error(
          `Design-system source file limit exceeded: ${repositoryPath(frontendRoot, full)}`,
        );
      }
      files.push(canonical);
      if (files.length > LIMITS.files) {
        throw new Error("Design-system source file count limit exceeded.");
      }
    }
  };
  walk(canonicalRoot);
  return files;
}

function classificationFiles(frontendRoot, sourceScope) {
  const acceptedScope = {
    roots: ["frontend/src/app", "frontend/src/platform"],
    extensions: [".ts", ".tsx"],
    excludedSuffixes: [".test.ts", ".test.tsx"],
  };
  if (JSON.stringify(sourceScope) !== JSON.stringify(acceptedScope)) {
    throw new Error(
      "Design-system ledger source scope is not the accepted bounded scope.",
    );
  }
  const files = [];
  for (const root of sourceScope.roots) {
    const absoluteRoot = resolve(frontendRoot, root.replace(/^frontend\//u, ""));
    files.push(
      ...collectFiles(
        absoluteRoot,
        (file) =>
          sourceScope.extensions.some((suffix) => file.endsWith(suffix)) &&
          !sourceScope.excludedSuffixes.some((suffix) => file.endsWith(suffix)),
        frontendRoot,
      ),
    );
  }
  return files.sort(compareText);
}

function ownershipFiles(frontendRoot) {
  return collectFiles(
    resolve(frontendRoot, "src"),
    (file) =>
      SOURCE_EXTENSION.test(file) &&
      !TEST_SOURCE.test(file) &&
      !file.endsWith(".d.ts") &&
      !repositoryPath(frontendRoot, file).startsWith("frontend/src/scene/"),
    frontendRoot,
  ).sort(compareText);
}

async function loadLedgerModule(frontendRoot) {
  const ledgerFile = resolve(frontendRoot, "dev/design-system/consolidation-ledger.ts");
  const source = readFileSync(ledgerFile, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: true,
    },
    fileName: ledgerFile,
    reportDiagnostics: true,
  });
  const errors = (transpiled.diagnostics ?? []).filter(
    ({ category }) => category === ts.DiagnosticCategory.Error,
  );
  if (errors.length > 0) {
    throw new Error("Design-system ledger could not be transpiled.");
  }
  const encoded = Buffer.from(transpiled.outputText, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

function parseSource(file) {
  const source = readFileSync(file, "utf8");
  return {
    source,
    sourceFile: ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      extname(file) === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    ),
  };
}

function propertyName(node, sourceFile) {
  return ts.isIdentifier(node) || ts.isStringLiteralLike(node)
    ? node.text
    : node.getText(sourceFile);
}

function containingVariableName(node) {
  let current = node.parent;
  while (current !== undefined) {
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
      return current.name.text;
    }
    current = current.parent;
  }
  return null;
}

function sourceOwner(node, sourceFile) {
  let current = node.parent;
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

function scanNativeControls(files, frontendRoot, nativeElements) {
  const sites = [];
  for (const file of files.filter((candidate) => candidate.endsWith(".tsx"))) {
    const { sourceFile } = parseSource(file);
    const visit = (node) => {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        ts.isIdentifier(node.tagName) &&
        nativeElements.has(node.tagName.text)
      ) {
        const offset = node.getStart(sourceFile);
        sites.push({
          path: repositoryPath(frontendRoot, file),
          owner: sourceOwner(node, sourceFile),
          element: node.tagName.text,
          offset,
          ...lineAndColumn(sourceFile, offset),
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return sites;
}

function stringLiteralSpans(sourceFile) {
  const spans = new Map();
  const visit = (node) => {
    if (
      ts.isStringLiteralLike(node) ||
      node.kind === ts.SyntaxKind.TemplateHead ||
      node.kind === ts.SyntaxKind.TemplateMiddle ||
      node.kind === ts.SyntaxKind.TemplateTail
    ) {
      const span = [node.getStart(sourceFile), node.getEnd()];
      spans.set(keyOf(...span), span);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...spans.values()];
}

function scanRelativeValues(files, frontendRoot) {
  const sites = [];
  for (const file of files.filter((candidate) => candidate.endsWith(".tsx"))) {
    const { source, sourceFile } = parseSource(file);
    const spans = stringLiteralSpans(sourceFile);
    const sourceLines = source.split(/\r?\n/u);
    const byLine = new Map();
    for (const match of source.matchAll(
      new RegExp(ARBITRARY_UTILITY_PATTERN.source, "gu"),
    )) {
      const utility = match[1];
      if (
        utility === undefined ||
        !new RegExp(NUMERIC_RELATIVE_UNIT_PATTERN.source, "u").test(utility)
      )
        continue;
      const relativeOffset = match[0].lastIndexOf(utility);
      const offset = (match.index ?? 0) + relativeOffset;
      const end = offset + utility.length;
      if (!spans.some(([start, finish]) => offset >= start && end <= finish)) continue;
      const { line, column } = lineAndColumn(sourceFile, offset);
      // Preserve the accepted 106-line baseline: a line is admitted only by the
      // original bounded matcher, then every co-located supported-unit utility is
      // retained in full (including nested calc/min/max expressions).
      if (!RAW_RELATIVE_VALUE_PATTERN.test(sourceLines[line - 1] ?? "")) continue;
      const group = byLine.get(line) ?? { line, column, offset, utilities: [] };
      group.column = Math.min(group.column, column);
      group.offset = Math.min(group.offset, offset);
      group.utilities.push(utility);
      byLine.set(line, group);
    }
    for (const group of [...byLine.values()].sort((a, b) => a.offset - b.offset)) {
      sites.push({
        path: repositoryPath(frontendRoot, file),
        line: group.line,
        column: group.column,
        expression: normalizeExpression(group.utilities.join(" ")),
      });
    }
  }
  return sites;
}

function declaredOwnerNames(file) {
  const { sourceFile } = parseSource(file);
  const names = new Set();
  const visit = (node) => {
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
      if (registry !== null)
        names.add(`${registry}.${propertyName(node.name, sourceFile)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return names;
}

function jsonTokenExists(file, tokenName) {
  let value = JSON.parse(readFileSync(file, "utf8"));
  for (const segment of tokenName.split(".")) {
    if (typeof value !== "object" || value === null || !(segment in value))
      return false;
    value = value[segment];
  }
  return true;
}

function numericRelativeUnits(expression) {
  const units = [];
  for (const match of expression.matchAll(
    new RegExp(NUMERIC_RELATIVE_UNIT_PATTERN.source, "gu"),
  )) {
    if (!units.includes(match[1])) units.push(match[1]);
  }
  return units;
}

function duplicateKeys(keys) {
  const counts = new Map();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...counts]
    .filter(([, count]) => count > 1)
    .map(([key]) => key)
    .sort(compareText);
}

function multisetDifference(left, right) {
  const remaining = new Map();
  for (const key of right) remaining.set(key, (remaining.get(key) ?? 0) + 1);
  const difference = [];
  for (const key of left) {
    const count = remaining.get(key) ?? 0;
    if (count === 0) difference.push(key);
    else remaining.set(key, count - 1);
  }
  return difference.sort(compareText);
}

function structuralGroupKey({ path, owner, element }) {
  return keyOf(path, owner, element);
}

function sourceNativeKeys(controls) {
  const occurrences = new Map();
  return controls.map(({ path, owner, element }) => {
    const group = structuralGroupKey({ path, owner, element });
    const occurrence = occurrences.get(group) ?? 0;
    occurrences.set(group, occurrence + 1);
    return keyOf(path, owner, element, occurrence);
  });
}

function ledgerNativeKeys(
  entries,
  sourceControls,
  ledgerSourceKey,
  duplicateSiteBindings,
  add,
) {
  const groupCounts = new Map();
  for (const site of sourceControls) {
    const group = structuralGroupKey(site);
    groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1);
  }
  const bound = new Map();
  for (const [path, owner, element, slots] of duplicateSiteBindings) {
    const group = structuralGroupKey({ path, owner, element });
    if ((groupCounts.get(group) ?? 0) !== slots.length) {
      add(
        "native-binding-cardinality",
        path,
        1,
        1,
        `${owner}/${element} expected ${slots.length} occurrences`,
      );
    }
    slots.forEach((slot, occurrence) => {
      bound.set(ledgerSourceKey({ path, owner, slot }), occurrence);
    });
  }
  return entries.map(({ source, element }) => {
    const group = structuralGroupKey({ ...source, element });
    const sourceCount = groupCounts.get(group) ?? 0;
    const occurrence = sourceCount <= 1 ? 0 : bound.get(ledgerSourceKey(source));
    if (occurrence === undefined) {
      add(
        "native-binding-missing",
        source.path,
        1,
        1,
        `${source.owner}/${source.slot}`,
      );
      return keyOf(source.path, source.owner, element, "unbound");
    }
    return keyOf(source.path, source.owner, element, occurrence);
  });
}

function moduleSpecifiers(sourceFile) {
  const imports = [];
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      imports.push({ node, specifier: node.moduleSpecifier.text });
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      imports.push({ node, specifier: node.arguments[0].text });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return imports;
}

function kitImportKind(file, specifier, frontendRoot) {
  const kitRoot = resolve(frontendRoot, "src/app/kit");
  let target = null;
  if (specifier === "@app/kit") return "barrel";
  if (specifier.startsWith("@app/kit/"))
    target = resolve(kitRoot, specifier.slice("@app/kit/".length));
  else if (specifier.startsWith(".")) target = resolve(dirname(file), specifier);
  if (target === null) return null;
  if (target === kitRoot || target === resolve(kitRoot, "index")) return "barrel";
  return insideRoot(target, kitRoot) ? "deep" : null;
}

function hasExportModifier(node) {
  return (
    node.modifiers?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword) ?? false
  );
}

function returnedExpression(body) {
  if (body === undefined) return null;
  if (!ts.isBlock(body)) return body;
  if (body.statements.length !== 1 || !ts.isReturnStatement(body.statements[0]))
    return null;
  return body.statements[0].expression ?? null;
}

function forwardingKitTag(expression, kitBindings) {
  const jsx = ts.isParenthesizedExpression(expression)
    ? expression.expression
    : expression;
  let opening = null;
  let children = [];
  if (ts.isJsxSelfClosingElement(jsx)) opening = jsx;
  else if (ts.isJsxElement(jsx)) {
    opening = jsx.openingElement;
    children = jsx.children.filter(
      (child) => !ts.isJsxText(child) || child.text.trim() !== "",
    );
  }
  if (opening === null || children.length > 0 || !ts.isIdentifier(opening.tagName))
    return null;
  if (
    !kitBindings.has(opening.tagName.text) ||
    opening.attributes.properties.length !== 1
  )
    return null;
  return ts.isJsxSpreadAttribute(opening.attributes.properties[0])
    ? opening.tagName.text
    : null;
}

function scanOwnership(files, frontendRoot, add) {
  const seenPendingDeep = new Set();
  const seenPendingLayer = new Set();
  for (const file of files) {
    const path = repositoryPath(frontendRoot, file);
    const { sourceFile } = parseSource(file);
    const kitBindings = new Set();
    for (const node of sourceFile.statements) {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteralLike(node.moduleSpecifier) &&
        kitImportKind(file, node.moduleSpecifier.text, frontendRoot) !== null
      ) {
        const clause = node.importClause;
        if (clause?.name) kitBindings.add(clause.name.text);
        if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
          kitBindings.add(clause.namedBindings.name.text);
        } else if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements)
            kitBindings.add(element.name.text);
        }
      }
    }

    for (const { node, specifier } of moduleSpecifiers(sourceFile)) {
      const kind = kitImportKind(file, specifier, frontendRoot);
      if (kind === null) continue;
      const position = lineAndColumn(sourceFile, node.getStart(sourceFile));
      const identity = keyOf(path, specifier);
      const isKitInternals = path.startsWith("frontend/src/app/kit/");
      if (kind === "deep" && !isKitInternals && path.startsWith("frontend/src/app/")) {
        if (
          PENDING_APP_KIT_DEEP_IMPORTS.has(identity) &&
          !seenPendingDeep.has(identity)
        ) {
          seenPendingDeep.add(identity);
        } else {
          add("kit-deep-import", path, position.line, position.column, specifier);
        }
      }
      if (
        (path.startsWith("frontend/src/stores/") ||
          path.startsWith("frontend/src/platform/")) &&
        kind !== null
      ) {
        if (
          PENDING_LOWER_LAYER_KIT_IMPORTS.has(identity) &&
          !seenPendingLayer.has(identity)
        ) {
          seenPendingLayer.add(identity);
        } else {
          add("layer-direction", path, position.line, position.column, specifier);
        }
      }
      if (ts.isExportDeclaration(node) && !isKitInternals) {
        add(
          "compatibility-facade",
          path,
          position.line,
          position.column,
          `re-export from ${specifier}`,
        );
      }
    }

    const visitFacade = (node) => {
      if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier === undefined &&
        node.exportClause !== undefined &&
        ts.isNamedExports(node.exportClause)
      ) {
        for (const element of node.exportClause.elements) {
          const localName = element.propertyName?.text ?? element.name.text;
          if (kitBindings.has(localName)) {
            const position = lineAndColumn(sourceFile, element.getStart(sourceFile));
            add(
              "compatibility-facade",
              path,
              position.line,
              position.column,
              `local export alias of ${localName}`,
            );
          }
        }
      }
      if (
        ts.isExportAssignment(node) &&
        ts.isIdentifier(node.expression) &&
        kitBindings.has(node.expression.text)
      ) {
        const position = lineAndColumn(sourceFile, node.getStart(sourceFile));
        add(
          "compatibility-facade",
          path,
          position.line,
          position.column,
          `export assignment of ${node.expression.text}`,
        );
      }
      if (ts.isVariableStatement(node) && hasExportModifier(node)) {
        for (const declaration of node.declarationList.declarations) {
          if (
            ts.isIdentifier(declaration.initializer) &&
            kitBindings.has(declaration.initializer.text)
          ) {
            const position = lineAndColumn(
              sourceFile,
              declaration.getStart(sourceFile),
            );
            add(
              "compatibility-facade",
              path,
              position.line,
              position.column,
              `exported alias of ${declaration.initializer.text}`,
            );
          }
          if (
            declaration.initializer &&
            (ts.isArrowFunction(declaration.initializer) ||
              ts.isFunctionExpression(declaration.initializer))
          ) {
            const expression = returnedExpression(declaration.initializer.body);
            const tag =
              expression === null ? null : forwardingKitTag(expression, kitBindings);
            if (tag !== null) {
              const position = lineAndColumn(
                sourceFile,
                declaration.getStart(sourceFile),
              );
              add(
                "compatibility-facade",
                path,
                position.line,
                position.column,
                `exported props-only wrapper around ${tag}`,
              );
            }
          }
        }
      }
      if (ts.isFunctionDeclaration(node) && hasExportModifier(node)) {
        const expression = returnedExpression(node.body);
        const tag =
          expression === null ? null : forwardingKitTag(expression, kitBindings);
        if (tag !== null) {
          const position = lineAndColumn(sourceFile, node.getStart(sourceFile));
          add(
            "compatibility-facade",
            path,
            position.line,
            position.column,
            `exported props-only wrapper around ${tag}`,
          );
        }
      }
      ts.forEachChild(node, visitFacade);
    };
    visitFacade(sourceFile);
  }
  return {
    pendingDeepImports: seenPendingDeep.size,
    pendingLayerImports: seenPendingLayer.size,
  };
}

function validateLedger(
  frontendRoot,
  ledgerModule,
  files,
  nativeSites,
  relativeSites,
  expectedNativeElementCounts,
  duplicateSiteBindings,
  relativeExceptions,
  add,
) {
  const ledger = ledgerModule.CONSOLIDATION_LEDGER;
  const sourceKey = ledgerModule.ledgerSourceKey;
  const ledgerFile = LEDGER_PATH;
  if (!ledger || typeof sourceKey !== "function") {
    throw new Error(
      "Design-system ledger does not expose its required runtime contract.",
    );
  }
  const safeSourceKey = (source, context) => {
    try {
      return sourceKey(source);
    } catch {
      add("ledger-invalid", ledgerFile, 1, 1, `${context} invalid source identity`);
      return keyOf("invalid-source", context);
    }
  };
  if (ledger.schemaVersion !== ledgerModule.CONSOLIDATION_LEDGER_SCHEMA_VERSION) {
    add("ledger-schema", ledgerFile, 1, 1, "schema version mismatch");
  }
  if (
    ledger.nativeControls.length !==
    ledgerModule.CONSOLIDATION_BASELINE_COUNTS.nativeControlSites
  ) {
    add(
      "ledger-count",
      ledgerFile,
      1,
      1,
      "native-control count does not match baseline",
    );
  }
  if (
    ledger.relativeValues.length !==
    ledgerModule.CONSOLIDATION_BASELINE_COUNTS.arbitraryRelativeValueSites
  ) {
    add(
      "ledger-count",
      ledgerFile,
      1,
      1,
      "relative-value count does not match baseline",
    );
  }

  const ownerCache = new Map();
  const allowedLayers = new Set(ledgerModule.CANONICAL_OWNER_LAYERS);
  const allowedOwnerStatuses = new Set(["existing", "planned"]);
  const allowedRelativeUnits = new Set(ledgerModule.RELATIVE_VALUE_UNITS);
  const allowedByFamily = {
    "native-control": new Set([
      "canonical-owner",
      "migrate",
      "retain-semantic-seam",
      "repair-local-defect",
    ]),
    "relative-value": new Set([
      "canonical-owner",
      "migrate",
      "retain-exact-geometry",
      "repair-local-defect",
    ]),
    "naming-debt": new Set(["track-parity-debt"]),
  };
  const validateEntries = (entries, family) => {
    for (const duplicate of duplicateKeys(
      entries.map(({ source }, index) => safeSourceKey(source, `${family}[${index}]`)),
    )) {
      add("ledger-duplicate", ledgerFile, 1, 1, `${family} ${duplicate}`);
    }
    for (const [index, entry] of entries.entries()) {
      const key = safeSourceKey(entry.source, `${family}[${index}]`);
      const sourceShapeValid =
        validRepositoryPath(entry.source?.path) &&
        typeof entry.source?.owner === "string" &&
        entry.source.owner.trim() !== "" &&
        typeof entry.source?.slot === "string" &&
        entry.source.slot.trim() !== "";
      if (!sourceShapeValid) {
        add("ledger-invalid", ledgerFile, 1, 1, `${family} invalid source identity`);
      }
      if (sourceShapeValid) {
        const sourcePath = resolve(
          frontendRoot,
          entry.source.path.replace(/^frontend\//u, ""),
        );
        if (family !== "naming-debt" && !existsSync(sourcePath)) {
          add("ledger-stale", entry.source.path, 1, 1, `${key} source file is missing`);
        } else if (
          family !== "naming-debt" &&
          [".ts", ".tsx"].includes(extname(sourcePath))
        ) {
          const sourceOwners =
            ownerCache.get(sourcePath) ?? declaredOwnerNames(sourcePath);
          ownerCache.set(sourcePath, sourceOwners);
          if (!sourceOwners.has(entry.source.owner)) {
            add(
              "ledger-stale",
              entry.source.path,
              1,
              1,
              `${key} source owner declaration is missing`,
            );
          }
        }
      }
      if (!allowedByFamily[family].has(entry.disposition))
        add("ledger-invalid", ledgerFile, 1, 1, `${key} invalid disposition`);
      const owner = entry.canonicalOwner;
      const ownerShapeValid =
        typeof owner === "object" &&
        owner !== null &&
        allowedLayers.has(owner.layer) &&
        validRepositoryPath(owner.path) &&
        typeof owner.name === "string" &&
        owner.name.trim() !== "" &&
        allowedOwnerStatuses.has(owner.status);
      if (!ownerShapeValid) {
        add("ledger-invalid", ledgerFile, 1, 1, `${key} invalid canonical owner`);
      }
      const required = [
        ...(ledgerModule.DISPOSITION_RATIONALE_FIELDS[entry.disposition] ?? []),
      ].sort(compareText);
      const actual = Object.keys(entry.rationale ?? {}).sort(compareText);
      if (
        keyOf(...required) !== keyOf(...actual) ||
        required.some(
          (field) =>
            typeof entry.rationale?.[field] !== "string" ||
            entry.rationale[field].trim() === "",
        )
      ) {
        add(
          "ledger-invalid",
          ledgerFile,
          1,
          1,
          `${key} incomplete disposition rationale`,
        );
      }
      if (ownerShapeValid && owner.status === "existing") {
        const ownerPath = resolve(frontendRoot, owner.path.replace(/^frontend\//u, ""));
        if (!existsSync(ownerPath))
          add(
            "ledger-stale",
            owner.path,
            1,
            1,
            `${key} canonical owner file is missing`,
          );
        else if ([".ts", ".tsx"].includes(extname(ownerPath))) {
          const owners = ownerCache.get(ownerPath) ?? declaredOwnerNames(ownerPath);
          ownerCache.set(ownerPath, owners);
          if (!owners.has(owner.name))
            add(
              "ledger-stale",
              owner.path,
              1,
              1,
              `${key} canonical owner declaration is missing`,
            );
        } else if (
          extname(ownerPath) === ".json" &&
          !jsonTokenExists(ownerPath, owner.name)
        ) {
          add("ledger-stale", owner.path, 1, 1, `${key} canonical token is missing`);
        }
      }
      if (
        family === "native-control" &&
        !ledgerModule.NATIVE_CONTROL_ELEMENTS.includes(entry.element)
      ) {
        add("ledger-invalid", ledgerFile, 1, 1, `${key} invalid native element`);
      }
      if (family === "relative-value") {
        if (typeof entry.expression !== "string" || entry.expression.trim() === "") {
          add("ledger-invalid", ledgerFile, 1, 1, `${key} empty relative expression`);
        }
        if (
          !Array.isArray(entry.units) ||
          entry.units.length === 0 ||
          duplicateKeys(entry.units).length > 0 ||
          entry.units.some((unit) => !allowedRelativeUnits.has(unit))
        ) {
          add("ledger-invalid", ledgerFile, 1, 1, `${key} invalid relative units`);
        }
      }
      if (family === "naming-debt") {
        const validDebtKind = ["code-only-name", "unresolved-design-alias"].includes(
          entry.debtKind,
        );
        const validCodeName =
          typeof entry.codeName === "string" && entry.codeName.trim() !== "";
        const corresponds =
          sourceShapeValid &&
          ownerShapeValid &&
          entry.source.slot === "component-export-name" &&
          entry.source.path === owner.path &&
          entry.source.owner === entry.codeName &&
          owner.name === entry.codeName;
        if (
          !validDebtKind ||
          !validCodeName ||
          entry.designAlias !== null ||
          !corresponds
        ) {
          add("ledger-invalid", ledgerFile, 1, 1, `${key} invalid naming-debt shape`);
        }
      }
    }
  };
  validateEntries(ledger.nativeControls, "native-control");
  validateEntries(ledger.relativeValues, "relative-value");
  validateEntries(ledger.namingDebt, "naming-debt");

  const elementCounts = { button: 0, input: 0, select: 0, textarea: 0 };
  for (const site of nativeSites) elementCounts[site.element] += 1;
  if (keyOf(elementCounts) !== keyOf(expectedNativeElementCounts)) {
    add("native-baseline", ledgerFile, 1, 1, `found ${keyOf(elementCounts)}`);
  }
  const sourceNative = sourceNativeKeys(nativeSites);
  const ledgerNative = ledgerNativeKeys(
    ledger.nativeControls,
    nativeSites,
    safeSourceKey,
    duplicateSiteBindings,
    add,
  );
  for (const key of multisetDifference(sourceNative, ledgerNative))
    add("native-control-missing", ledgerFile, 1, 1, key);
  for (const key of multisetDifference(ledgerNative, sourceNative))
    add("native-control-stale", ledgerFile, 1, 1, key);

  const exceptionEntries = relativeExceptions;
  for (const expected of exceptionEntries) {
    const expectedKey = safeSourceKey(expected, "relative exception");
    const entry = ledger.relativeValues.find(
      ({ source }, index) =>
        safeSourceKey(source, `relative-value[${index}]`) === expectedKey,
    );
    if (!entry || normalizeExpression(entry.expression) !== expected.expression) {
      add("relative-exception-stale", ledgerFile, 1, 1, expectedKey);
    }
  }
  const exceptionKeys = new Set(
    exceptionEntries.map((entry) => safeSourceKey(entry, "relative exception")),
  );
  const executableLedger = ledger.relativeValues.filter(
    ({ source }, index) =>
      !exceptionKeys.has(safeSourceKey(source, `relative-value[${index}]`)),
  );
  const sourceRelative = relativeSites.map(({ path, expression }) =>
    keyOf(path, normalizeExpression(expression)),
  );
  const ledgerRelative = executableLedger.map(({ source, expression }) =>
    keyOf(source.path, normalizeExpression(expression)),
  );
  for (const key of multisetDifference(sourceRelative, ledgerRelative))
    add("relative-value-missing", ledgerFile, 1, 1, key);
  for (const key of multisetDifference(ledgerRelative, sourceRelative))
    add("relative-value-stale", ledgerFile, 1, 1, key);
  for (const entry of ledger.relativeValues) {
    const key = safeSourceKey(entry.source, "relative-value unit validation");
    const actualUnits = numericRelativeUnits(
      typeof entry.expression === "string" ? entry.expression : "",
    );
    if (
      entry.disposition !== "repair-local-defect" &&
      Array.isArray(entry.units) &&
      keyOf(...entry.units) !== keyOf(...actualUnits)
    ) {
      add(
        "ledger-invalid",
        ledgerFile,
        1,
        1,
        `${key} unit list does not match expression`,
      );
    }
  }

  const invariantPairs = ledger.invariants.map(({ id, boundary }) => [id, boundary]);
  if (JSON.stringify(invariantPairs) !== JSON.stringify(EXPECTED_INVARIANTS)) {
    add("invariant-stale", ledgerFile, 1, 1, "campaign invariant set changed");
  }
  const evidenceKeys = [];
  for (const invariant of ledger.invariants) {
    if (
      !invariant.statement?.trim() ||
      !invariant.rationale?.trim() ||
      invariant.evidence.length === 0
    ) {
      add("invariant-invalid", ledgerFile, 1, 1, invariant.id);
    }
    for (const evidence of invariant.evidence) {
      const key = ledgerModule.invariantEvidenceKey(evidence);
      evidenceKeys.push(key);
      if (!existsSync(resolve(dirname(frontendRoot), evidence.path))) {
        add(
          "invariant-stale",
          evidence.path,
          1,
          1,
          `${invariant.id} evidence file is missing`,
        );
      }
    }
  }
  for (const key of duplicateKeys(evidenceKeys))
    add("invariant-invalid", ledgerFile, 1, 1, `duplicate evidence ${key}`);
  const figma = ledger.invariants.find(
    ({ boundary }) => boundary === "figma-exclusion",
  );
  if (
    !figma?.statement.includes("does not use Figma capture") ||
    !figma.statement.includes("makes no Figma-parity claim") ||
    !figma.statement.includes(
      "does not supersede Figma's separate long-term design authority",
    )
  ) {
    add("invariant-invalid", ledgerFile, 1, 1, "no-Figma fence is incomplete");
  }
  if (
    ledgerModule.CONSOLIDATION_SOURCE_SCOPE.roots.some((root) =>
      root.startsWith("frontend/src/scene"),
    )
  ) {
    add(
      "invariant-invalid",
      ledgerFile,
      1,
      1,
      "classification scope includes scene source",
    );
  }

  return {
    classificationFiles: files.length,
    nativeControls: nativeSites.length,
    relativeExecutableSites: relativeSites.length,
    relativeClassifiedExceptions: exceptionEntries.length,
  };
}

function verifySceneFingerprint(frontendRoot, add) {
  const baselinePath = resolve(
    frontendRoot,
    "dev/design-system/scene-freeze-baseline.json",
  );
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  const repositoryRoot = dirname(frontendRoot);
  const sceneDiff = spawnSync("git", ["diff", "--", "frontend/src/scene"], {
    cwd: repositoryRoot,
    encoding: "buffer",
    maxBuffer: LIMITS.gitBytes,
    timeout: LIMITS.gitTimeoutMs,
  });
  if (sceneDiff.error || sceneDiff.status !== 0)
    throw new Error("Could not read the frozen scene diff.");
  const fingerprint = spawnSync("git", ["hash-object", "--stdin"], {
    cwd: repositoryRoot,
    input: sceneDiff.stdout,
    encoding: "utf8",
    maxBuffer: LIMITS.gitBytes,
    timeout: LIMITS.gitTimeoutMs,
  });
  if (fingerprint.error || fingerprint.status !== 0)
    throw new Error("Could not fingerprint the frozen scene diff.");
  const actual = fingerprint.stdout.trim();
  if (
    baseline.sceneDiffFingerprint?.algorithm !== "git-blob-sha1" ||
    actual !== baseline.sceneDiffFingerprint?.value
  ) {
    add(
      "scene-freeze-drift",
      "frontend/src/scene",
      1,
      1,
      `expected ${baseline.sceneDiffFingerprint?.value ?? "missing"}, found ${actual}`,
    );
  }
  return actual;
}

export async function scanDesignSystem(options = {}) {
  const frontendRoot = resolve(options.frontendRoot ?? defaultFrontendRoot);
  const ledgerModule = options.ledgerModule ?? (await loadLedgerModule(frontendRoot));
  const findings = [];
  const add = (code, path, line, column, detail) => {
    findings.push({
      code,
      path,
      line,
      column,
      detail: normalizeExpression(detail).slice(0, LIMITS.snippetChars),
    });
    if (findings.length > LIMITS.findings)
      throw new Error("Design-system finding limit exceeded.");
  };
  const files = classificationFiles(
    frontendRoot,
    ledgerModule.CONSOLIDATION_SOURCE_SCOPE,
  );
  const nativeSites = scanNativeControls(
    files,
    frontendRoot,
    new Set(ledgerModule.NATIVE_CONTROL_ELEMENTS),
  );
  const relativeSites = scanRelativeValues(files, frontendRoot);
  const classification = validateLedger(
    frontendRoot,
    ledgerModule,
    files,
    nativeSites,
    relativeSites,
    options.expectedNativeElementCounts ?? NATIVE_ELEMENT_COUNTS,
    options.duplicateSiteBindings ?? DUPLICATE_SITE_BINDINGS,
    options.relativeExceptions ?? [
      ...KNOWN_RELATIVE_SCANNER_DEFECTS,
      DOCUMENTED_RELATIVE_VALUE_EXAMPLE,
    ],
    add,
  );
  const ownership = scanOwnership(ownershipFiles(frontendRoot), frontendRoot, add);
  const sceneFingerprint =
    options.checkSceneFingerprint === false
      ? null
      : verifySceneFingerprint(frontendRoot, add);
  findings.sort(
    (a, b) =>
      compareText(a.path, b.path) ||
      a.line - b.line ||
      a.column - b.column ||
      compareText(a.code, b.code) ||
      compareText(a.detail, b.detail),
  );
  return Object.freeze({
    schema: REPORT_SCHEMA,
    status: findings.length === 0 ? "clean" : "violations",
    summary: Object.freeze({
      ...classification,
      ownershipFiles: ownershipFiles(frontendRoot).length,
      pendingAppKitDeepImports: ownership.pendingDeepImports,
      pendingLowerLayerKitImports: ownership.pendingLayerImports,
      findings: findings.length,
      sceneFingerprint,
    }),
    findings: Object.freeze(findings.map((finding) => Object.freeze(finding))),
  });
}

function printHuman(report) {
  if (report.findings.length > 0) {
    process.stderr.write("design-system-scan: ownership or ledger violations found:\n");
    for (const finding of report.findings) {
      process.stderr.write(
        `  ${finding.code} ${finding.path}:${finding.line}:${finding.column} ${finding.detail}\n`,
      );
    }
    process.stderr.write(
      "design-system-scan FAILED. Classify new sites or migrate directly to the canonical owner; do not widen the ratchets.\n",
    );
    return;
  }
  const summary = report.summary;
  process.stdout.write(
    `design-system-scan: clean. ${summary.nativeControls} native controls; ` +
      `${summary.relativeExecutableSites} executable relative-value sites + ` +
      `${summary.relativeClassifiedExceptions} classified raw exceptions; ` +
      `${summary.pendingAppKitDeepImports} pending deep imports; ` +
      `${summary.pendingLowerLayerKitImports} pending lower-layer import.\n`,
  );
}

async function run() {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => arg !== "--json");
  if (unknown.length > 0) throw new Error(`Unknown argument(s): ${unknown.join(", ")}`);
  const report = await scanDesignSystem();
  if (args.includes("--json")) process.stdout.write(`${JSON.stringify(report)}\n`);
  else printHuman(report);
  if (report.status !== "clean") process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  try {
    await run();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Design-system scan failed.";
    process.stderr.write(`design-system-scan: ${message}\n`);
    process.exitCode = 1;
  }
}

export {
  DOCUMENTED_RELATIVE_VALUE_EXAMPLE,
  DUPLICATE_SITE_BINDINGS,
  KNOWN_RELATIVE_SCANNER_DEFECTS,
  LIMITS,
  PENDING_APP_KIT_DEEP_IMPORTS,
  PENDING_LOWER_LAYER_KIT_IMPORTS,
  REPORT_SCHEMA,
};
