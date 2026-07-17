#!/usr/bin/env node

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";

import ts from "typescript";
import {
  PRESENTATION_FIELD_NAMES,
  UNSAFE_DYNAMIC_PRESENTATION_NAMES,
} from "./scan-localization-policy.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(here, "..");
const sourceRoot = join(frontendRoot, "src");
const tsconfigPath = join(frontendRoot, "tsconfig.json");

const LIMITS = Object.freeze({
  constantDepth: 8,
  files: 5_000,
  fileBytes: 2 * 1024 * 1024,
  findings: 50_000,
  parts: 64,
  snippetChars: 160,
});

const FINDING_CODES = Object.freeze({
  authoredCaseTransform: "authored-case-transform",
  directLocaleFormat: "direct-locale-format",
  dynamicMessageKey: "dynamic-message-key",
  fixedLocaleFormat: "fixed-locale-format",
  imperativeDisplay: "imperative-display",
  jsxAttribute: "jsx-attribute",
  jsxText: "jsx-text",
  presentationField: "presentation-field",
  punctuation: "punctuation",
  translatedFragment: "translated-fragment",
  translationDefault: "translation-default",
  unsafeDynamicPresentation: "unsafe-dynamic-presentation",
});

// Em dash (U+2014) is prohibited in user copy, and a run of two or more ASCII
// periods is the hand-typed ellipsis that must be the single "…" character. Any
// user-facing source literal carrying either is a punctuation defect.
const PROHIBITED_PUNCTUATION = /—|\.{2,}/u;
const SOURCE_EXT = /\.(?:css|ts|tsx)$/u;
const TYPESCRIPT_SOURCE_EXT = /\.(?:ts|tsx)$/u;
const CSS_SOURCE_EXT = /\.css$/u;
const TEST_SOURCE = /\.(?:test|spec)\.(?:css|ts|tsx)$/u;
const EXACT_SOURCE_EXCLUSIONS = new Set([
  "src/localization/testing/addProjectResources.ts",
  "src/localization/testing/agentResources.ts",
  "src/localization/testing/graphResources.ts",
  "src/localization/testing/resources.ts",
  "src/localization/testing/settingsResources.ts",
  "src/localization/testing/threeLabResources.ts",
]);
const EXACT_GENERATED_SOURCES = new Set();
const FORMATTER_OWNER = "src/platform/localization/formatters.ts";
const AUTHORED_DISPLAY_OWNER = "src/platform/localization/displayText.ts";

const JSX_ATTRIBUTE_NAMES = new Set([
  "accessibleName",
  "alt",
  "aria-description",
  "aria-label",
  "ariaLabel",
  "description",
  "emptyText",
  "errorText",
  "label",
  "loadingText",
  "message",
  "placeholder",
  "statusText",
  "title",
]);
const IMPERATIVE_CALL_NAMES = new Set([
  "alert",
  "confirm",
  "notify",
  "prompt",
  "setError",
  "setFeedback",
  "setStatus",
  "showError",
  "toast",
]);
const TRANSLATION_FACTORY_KINDS = new Map([
  ["createMessageDescriptor", "message-factory"],
  ["createConfirmationDescriptor", "confirmation-factory"],
]);
const LOCALE_METHODS = new Map([
  ["localeCompare", 1],
  ["toLocaleDateString", 0],
  ["toLocaleString", 0],
  ["toLocaleTimeString", 0],
]);
const INTL_FORMATTERS = new Set([
  "Collator",
  "DateTimeFormat",
  "ListFormat",
  "NumberFormat",
  "RelativeTimeFormat",
]);
const CLASS_CASE_TRANSFORMS = new Set(["capitalize", "lowercase", "uppercase"]);
const CSS_CAPS_TRANSFORMS = new Set([
  "all-petite-caps",
  "all-small-caps",
  "petite-caps",
  "small-caps",
  "titling-caps",
  "unicase",
]);

function toRelative(file) {
  return relative(frontendRoot, file).split(sep).join("/");
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function insideRoot(file, root) {
  const rel = relative(root, file);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function collectSourceFiles(root = sourceRoot) {
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
          `Localization scan refuses symbolic links: ${toRelative(full)}`,
        );
      }
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      if (!stat.isFile() || !SOURCE_EXT.test(entry.name)) continue;
      const canonical = realpathSync(full);
      if (!insideRoot(canonical, canonicalRoot)) {
        throw new Error(
          `Localization scan found an out-of-root file: ${toRelative(full)}`,
        );
      }
      files.push(canonical);
      if (files.length > LIMITS.files)
        throw new Error("Localization source file limit exceeded.");
    }
  };
  walk(canonicalRoot);
  return files;
}

function sourceIsExcluded(file) {
  const rel = toRelative(file);
  return (
    TEST_SOURCE.test(rel) ||
    rel.endsWith(".d.ts") ||
    rel.startsWith("src/locales/") ||
    EXACT_SOURCE_EXCLUSIONS.has(rel) ||
    EXACT_GENERATED_SOURCES.has(rel)
  );
}

function compilerOptions() {
  const config = ts.readConfigFile(tsconfigPath, (file) => readFileSync(file, "utf8"));
  if (config.error)
    throw new Error("Localization scan could not read TypeScript config.");
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, frontendRoot);
  if (parsed.errors.length > 0) {
    throw new Error("Localization scan found an invalid TypeScript config.");
  }
  return parsed.options;
}

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
  return null;
}

function normalizeText(value) {
  return value.replace(/\s+/gu, " ").trim();
}

function meaningful(value) {
  return normalizeText(value).length > 0;
}

function unsafeDynamicPresentationNodes(node) {
  const matches = [];
  const visit = (current) => {
    if (
      ts.isArrowFunction(current) ||
      ts.isFunctionExpression(current) ||
      ts.isJsxElement(current) ||
      ts.isJsxSelfClosingElement(current) ||
      ts.isJsxFragment(current)
    ) {
      return;
    }
    if (
      ts.isPropertyAccessExpression(current) &&
      UNSAFE_DYNAMIC_PRESENTATION_NAMES.has(current.name.text)
    ) {
      matches.push(current);
      return;
    }
    if (
      ts.isIdentifier(current) &&
      UNSAFE_DYNAMIC_PRESENTATION_NAMES.has(current.text) &&
      !ts.isPropertyAccessExpression(current.parent)
    ) {
      matches.push(current);
      return;
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return matches;
}

function classCaseTransform(value) {
  for (const token of value.split(/\s+/u)) {
    const arbitraryStart = token.lastIndexOf("[");
    const utility = (
      arbitraryStart >= 0 && token.endsWith("]")
        ? token.slice(arbitraryStart)
        : token.slice(token.lastIndexOf(":") + 1)
    )
      .replace(/^!/u, "")
      .toLowerCase();
    if (CLASS_CASE_TRANSFORMS.has(utility)) return utility;
    const arbitrary = /^\[(text-transform|font-variant(?:-caps)?):(.+)\]$/u.exec(
      utility,
    );
    if (arbitrary) {
      const [, property, authoredValue] = arbitrary;
      if (
        (property === "text-transform" && authoredValue !== "none") ||
        (property === "font-variant-caps" && authoredValue !== "normal") ||
        (property === "font-variant" &&
          (authoredValue.includes("var(") ||
            authoredValue
              .split(/[_\s]+/u)
              .some((part) => CSS_CAPS_TRANSFORMS.has(part))))
      ) {
        return utility;
      }
    }
  }
  return null;
}

function authoredStyleTransforms(node, property, checker, bindings) {
  if (!node) return ["dynamic"];
  const parts = staticParts(node, checker, bindings);
  const values = parts.texts.map((value) => normalizeText(value).toLowerCase());
  const transforms = new Set(
    property === "fontVariant"
      ? values.filter(
          (value) =>
            value.includes("var(") ||
            value.split(/\s+/u).some((token) => CSS_CAPS_TRANSFORMS.has(token)),
        )
      : values.filter(
          (value) =>
            value.length > 0 &&
            value !== (property === "textTransform" ? "none" : "normal"),
        ),
  );
  if (parts.dynamic || parts.texts.length === 0) transforms.add("dynamic");
  return [...transforms].sort(compareText);
}

function maskCssCommentsAndStrings(source) {
  let masked = "";
  let index = 0;
  while (index < source.length) {
    if (source.startsWith("/*", index)) {
      masked += "  ";
      index += 2;
      while (index < source.length && !source.startsWith("*/", index)) {
        masked += source[index] === "\n" ? "\n" : " ";
        index += 1;
      }
      if (index < source.length) {
        masked += "  ";
        index += 2;
      }
      continue;
    }
    const quote = source[index];
    if (quote === '"' || quote === "'") {
      masked += " ";
      index += 1;
      while (index < source.length) {
        if (source[index] === "\\" && index + 1 < source.length) {
          masked += "  ";
          index += 2;
          continue;
        }
        if (source[index] === quote) {
          masked += " ";
          index += 1;
          break;
        }
        masked += source[index] === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }
    masked += source[index];
    index += 1;
  }
  return masked;
}

function lineAndColumnAt(source, offset) {
  const before = source.slice(0, offset);
  const lastLineBreak = before.lastIndexOf("\n");
  return {
    column: offset - lastLineBreak,
    line: before.split("\n").length,
  };
}

function classCaseTransforms(node, checker, bindings, seen = new Set(), depth = 0) {
  const transforms = new Set();
  const inspectText = (text) => {
    const transform = classCaseTransform(text);
    if (transform !== null) transforms.add(transform);
  };
  const inspect = (expression, currentSeen = seen, currentDepth = depth) => {
    if (!expression || currentDepth > LIMITS.constantDepth) return;
    const parts = staticParts(expression, checker, bindings, currentSeen, currentDepth);
    for (const text of parts.texts) inspectText(text);
    if (
      ts.isParenthesizedExpression(expression) ||
      ts.isAsExpression(expression) ||
      ts.isSatisfiesExpression(expression)
    ) {
      inspect(expression.expression, currentSeen, currentDepth + 1);
      return;
    }
    if (ts.isCallExpression(expression)) {
      for (const argument of expression.arguments) {
        inspect(argument, currentSeen, currentDepth + 1);
      }
      return;
    }
    if (ts.isArrayLiteralExpression(expression)) {
      for (const element of expression.elements) {
        if (!ts.isOmittedExpression(element)) {
          inspect(element, currentSeen, currentDepth + 1);
        }
      }
      return;
    }
    if (ts.isObjectLiteralExpression(expression)) {
      for (const property of expression.properties) {
        if (ts.isPropertyAssignment(property)) {
          const name = propertyName(property.name);
          if (name !== null) inspectText(name);
        } else if (ts.isShorthandPropertyAssignment(property)) {
          inspectText(property.name.text);
        } else if (ts.isSpreadAssignment(property)) {
          inspect(property.expression, currentSeen, currentDepth + 1);
        }
      }
      return;
    }
    if (
      ts.isBinaryExpression(expression) &&
      (expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        expression.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    ) {
      if (expression.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) {
        inspect(expression.left, currentSeen, currentDepth + 1);
      }
      inspect(expression.right, currentSeen, currentDepth + 1);
      return;
    }
    if (ts.isIdentifier(expression) || ts.isPropertyAccessExpression(expression)) {
      const resolved = symbolInitializer(expression, checker);
      if (!resolved || currentSeen.has(resolved.symbol)) return;
      const nextSeen = new Set(currentSeen);
      nextSeen.add(resolved.symbol);
      inspect(resolved.initializer, nextSeen, currentDepth + 1);
    }
  };
  inspect(node);
  return [...transforms].sort(compareText);
}

function classBearingName(name) {
  return (
    name === "className" ||
    name.endsWith("ClassName") ||
    /_CLASS(?:_NAME)?$/u.test(name)
  );
}

function mergeParts(parts, next) {
  if (parts.texts.length + next.texts.length > LIMITS.parts || next.overflow) {
    throw new Error("Localization constant resolution part limit exceeded.");
  }
  parts.texts.push(...next.texts);
  parts.translation ||= next.translation;
  parts.dynamic ||= next.dynamic;
  return parts;
}

function emptyParts() {
  return { dynamic: false, overflow: false, texts: [], translation: false };
}

function appendText(parts, text) {
  if (parts.texts.length >= LIMITS.parts) {
    throw new Error("Localization constant resolution part limit exceeded.");
  }
  parts.texts.push(text);
}

function unwrapAlias(symbol, checker) {
  if (symbol && (symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    try {
      return checker.getAliasedSymbol(symbol);
    } catch {
      return symbol;
    }
  }
  return symbol;
}

function isConstDeclaration(declaration) {
  return (
    ts.isVariableDeclaration(declaration) &&
    declaration.parent &&
    ts.isVariableDeclarationList(declaration.parent) &&
    (declaration.parent.flags & ts.NodeFlags.Const) !== 0
  );
}

function symbolAt(node, checker) {
  return node ? checker.getSymbolAtLocation(node) : undefined;
}


function translationBindings(sourceFile, checker) {
  const bindings = {
    calls: new Set(),
    factoryKinds: new Map(),
    hookNamespaces: new Set(),
    hookResults: new Set(),
    hooks: new Set(),
    i18nextNamespaces: new Set(),
    receivers: new Set(),
    runtimeFactories: new Set(),
    runtimeNamespaces: new Set(),
  };
  const runtimeModule = (name) =>
    name === "./runtime" || /(?:^|\/)localization\/runtime$/u.test(name);

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.importClause
    ) {
      continue;
    }
    const moduleName = statement.moduleSpecifier.text;
    const clause = statement.importClause;
    if (moduleName === "i18next" && clause.name) {
      bindings.receivers.add(symbolAt(clause.name, checker));
    }
    const named = clause.namedBindings;
    if (named && ts.isNamespaceImport(named)) {
      const symbol = symbolAt(named.name, checker);
      if (moduleName === "react-i18next") bindings.hookNamespaces.add(symbol);
      if (moduleName === "i18next") bindings.i18nextNamespaces.add(symbol);
      if (runtimeModule(moduleName)) bindings.runtimeNamespaces.add(symbol);
      continue;
    }
    if (!named || !ts.isNamedImports(named)) continue;
    for (const element of named.elements) {
      const original = element.propertyName?.text ?? element.name.text;
      const symbol = symbolAt(element.name, checker);
      if (moduleName === "react-i18next" && original === "useTranslation") {
        bindings.hooks.add(symbol);
      }
      if (moduleName === "i18next" && original === "t") bindings.calls.add(symbol);
      if (runtimeModule(moduleName) && original === "localization") {
        bindings.receivers.add(symbol);
      }
      if (runtimeModule(moduleName) && original === "createLocalizationRuntime") {
        bindings.runtimeFactories.add(symbol);
      }
      if (
        (moduleName === "./message" ||
          /(?:^|\/)localization\/message$/u.test(moduleName)) &&
        TRANSLATION_FACTORY_KINDS.has(original)
      ) {
        bindings.factoryKinds.set(symbol, TRANSLATION_FACTORY_KINDS.get(original));
      }
    }
  }

  const isHookCall = (node) =>
    ts.isCallExpression(node) &&
    ((ts.isIdentifier(node.expression) &&
      bindings.hooks.has(symbolAt(node.expression, checker))) ||
      (ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "useTranslation" &&
        ts.isIdentifier(node.expression.expression) &&
        bindings.hookNamespaces.has(symbolAt(node.expression.expression, checker))));
  const isRuntimeFactoryCall = (node) =>
    ts.isCallExpression(node) &&
    ((ts.isIdentifier(node.expression) &&
      bindings.runtimeFactories.has(symbolAt(node.expression, checker))) ||
      (ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "createLocalizationRuntime" &&
        ts.isIdentifier(node.expression.expression) &&
        bindings.runtimeNamespaces.has(symbolAt(node.expression.expression, checker))));

  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isIdentifier(node.name)) {
        const symbol = symbolAt(node.name, checker);
        if (isHookCall(node.initializer)) bindings.hookResults.add(symbol);
        if (isRuntimeFactoryCall(node.initializer)) bindings.receivers.add(symbol);
      } else if (ts.isObjectBindingPattern(node.name) && isHookCall(node.initializer)) {
        for (const element of node.name.elements) {
          if (!ts.isIdentifier(element.name)) continue;
          const original = propertyName(element.propertyName ?? element.name);
          const symbol = symbolAt(element.name, checker);
          if (original === "t") bindings.calls.add(symbol);
          if (original === "i18n") bindings.receivers.add(symbol);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return bindings;
}

function callName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function isReceiverExpression(expression, bindings, checker) {
  if (ts.isIdentifier(expression)) {
    const symbol = symbolAt(expression, checker);
    return bindings.receivers.has(symbol) || bindings.hookResults.has(symbol);
  }
  return (
    ts.isPropertyAccessExpression(expression) &&
    ((expression.name.text === "localization" &&
      ts.isIdentifier(expression.expression) &&
      bindings.runtimeNamespaces.has(symbolAt(expression.expression, checker))) ||
      (expression.name.text === "i18n" &&
        ts.isIdentifier(expression.expression) &&
        bindings.hookResults.has(symbolAt(expression.expression, checker))))
  );
}

function translationCallKind(node, bindings, checker) {
  if (!ts.isCallExpression(node)) return null;
  const expression = node.expression;
  if (ts.isIdentifier(expression)) {
    const symbol = symbolAt(expression, checker);
    if (bindings.calls.has(symbol)) return "translation";
    return bindings.factoryKinds.get(symbol) ?? null;
  }
  return ts.isPropertyAccessExpression(expression) &&
    expression.name.text === "t" &&
    ((ts.isIdentifier(expression.expression) &&
      bindings.i18nextNamespaces.has(symbolAt(expression.expression, checker))) ||
      isReceiverExpression(expression.expression, bindings, checker))
    ? "translation"
    : null;
}

function isTranslationCall(node, bindings, checker) {
  return translationCallKind(node, bindings, checker) !== null;
}

function symbolInitializer(node, checker) {
  const symbol = unwrapAlias(symbolAt(node, checker), checker);
  if (!symbol) return null;
  for (const declaration of symbol.declarations ?? []) {
    if (isConstDeclaration(declaration) && declaration.initializer) {
      return { initializer: declaration.initializer, symbol };
    }
    if (ts.isPropertyAssignment(declaration)) {
      return { initializer: declaration.initializer, symbol };
    }
    if (ts.isShorthandPropertyAssignment(declaration)) {
      const valueSymbol = checker.getShorthandAssignmentValueSymbol(declaration);
      if (!valueSymbol) return null;
      for (const valueDeclaration of valueSymbol.declarations ?? []) {
        if (isConstDeclaration(valueDeclaration) && valueDeclaration.initializer) {
          return { initializer: valueDeclaration.initializer, symbol: valueSymbol };
        }
      }
    }
  }
  return null;
}

function resolveObjectFields(node, checker, seen = new Set(), depth = 0) {
  if (!node || depth > LIMITS.constantDepth) return null;
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    return resolveObjectFields(node.expression, checker, seen, depth + 1);
  }
  if (ts.isObjectLiteralExpression(node)) {
    if (seen.has(node)) return null;
    const nextSeen = new Set(seen);
    nextSeen.add(node);
    const fields = new Map();
    for (const property of node.properties) {
      if (ts.isPropertyAssignment(property)) {
        const name = propertyName(property.name);
        if (name === null) return null;
        fields.set(name, { expression: property.initializer, origin: property });
      } else if (ts.isShorthandPropertyAssignment(property)) {
        const resolved = symbolInitializer(property.name, checker);
        if (!resolved || nextSeen.has(resolved.symbol)) return null;
        fields.set(property.name.text, {
          expression: resolved.initializer,
          origin: property,
        });
      } else if (ts.isSpreadAssignment(property)) {
        const spreadFields = resolveObjectFields(
          property.expression,
          checker,
          nextSeen,
          depth + 1,
        );
        if (spreadFields === null) return null;
        for (const [name, field] of spreadFields) fields.set(name, field);
      } else {
        return null;
      }
      if (fields.size > LIMITS.parts) {
        throw new Error("Localization constant resolution part limit exceeded.");
      }
    }
    return fields;
  }
  if (!ts.isIdentifier(node) && !ts.isPropertyAccessExpression(node)) return null;
  const resolved = symbolInitializer(node, checker);
  if (!resolved || seen.has(resolved.symbol)) return null;
  const nextSeen = new Set(seen);
  nextSeen.add(resolved.symbol);
  return resolveObjectFields(resolved.initializer, checker, nextSeen, depth + 1);
}

function isStaticMessageKey(node, checker, bindings) {
  const keyParts = staticParts(node, checker, bindings);
  return (
    !keyParts.dynamic && keyParts.texts.length === 1 && meaningful(keyParts.texts[0])
  );
}

function staticParts(node, checker, bindings, seen = new Set(), depth = 0) {
  const result = emptyParts();
  if (!node || depth > LIMITS.constantDepth) return { ...result, dynamic: true };
  if (ts.isStringLiteralLike(node)) {
    appendText(result, node.text);
    return result;
  }
  if (ts.isJsxText(node)) {
    appendText(result, node.text);
    return result;
  }
  if (isTranslationCall(node, bindings, checker)) {
    result.translation = true;
    return result;
  }
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    return staticParts(node.expression, checker, bindings, seen, depth + 1);
  }
  if (ts.isTemplateExpression(node)) {
    appendText(result, node.head.text);
    for (const span of node.templateSpans) {
      mergeParts(
        result,
        staticParts(span.expression, checker, bindings, seen, depth + 1),
      );
      appendText(result, span.literal.text);
    }
    return result;
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    mergeParts(result, staticParts(node.left, checker, bindings, seen, depth + 1));
    mergeParts(result, staticParts(node.right, checker, bindings, seen, depth + 1));
    return result;
  }
  if (ts.isConditionalExpression(node)) {
    mergeParts(result, staticParts(node.whenTrue, checker, bindings, seen, depth + 1));
    mergeParts(result, staticParts(node.whenFalse, checker, bindings, seen, depth + 1));
    return result;
  }
  if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) {
    const symbol = unwrapAlias(checker.getSymbolAtLocation(node), checker);
    if (!symbol || seen.has(symbol)) return { ...result, dynamic: true };
    const nextSeen = new Set(seen);
    nextSeen.add(symbol);
    for (const declaration of symbol.declarations ?? []) {
      let initializer = null;
      if (isConstDeclaration(declaration)) initializer = declaration.initializer;
      if (ts.isPropertyAssignment(declaration)) initializer = declaration.initializer;
      if (initializer) {
        mergeParts(
          result,
          staticParts(initializer, checker, bindings, nextSeen, depth + 1),
        );
      }
    }
    if (result.texts.length > 0 || result.translation) return result;
  }
  result.dynamic = true;
  return result;
}

function literalLocale(node, checker, bindings) {
  if (!node) return false;
  const parts = staticParts(node, checker, bindings);
  return !parts.dynamic && parts.texts.some(meaningful);
}

function safeSnippet(node, sourceFile) {
  return normalizeText(node.getText(sourceFile)).slice(0, LIMITS.snippetChars);
}

function scanProgram(files, allowOutsideSource = false) {
  const typescriptFiles = files.filter((file) => TYPESCRIPT_SOURCE_EXT.test(file));
  const cssFiles = files.filter((file) => CSS_SOURCE_EXT.test(file));
  const program = ts.createProgram({
    rootNames: typescriptFiles,
    options: compilerOptions(),
  });
  const requestedFiles = new Set(files.map((file) => resolve(file)));
  if (program.getSyntacticDiagnostics().length > 0) {
    throw new Error("Localization scan found source syntax errors.");
  }
  const checker = program.getTypeChecker();
  const rawFindings = [];
  const pushFinding = (finding) => {
    if (rawFindings.length >= LIMITS.findings) {
      throw new Error("Localization finding limit exceeded.");
    }
    rawFindings.push(finding);
  };
  const add = (code, node, sourceFile, context, text = "") => {
    const position = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );
    pushFinding({
      code,
      column: position.character + 1,
      context,
      line: position.line + 1,
      path: toRelative(sourceFile.fileName),
      snippet: safeSnippet(node, sourceFile),
      text: normalizeText(text),
    });
  };

  for (const sourceFile of program.getSourceFiles()) {
    const file = resolve(sourceFile.fileName);
    if (
      (!allowOutsideSource && !insideRoot(file, sourceRoot)) ||
      (allowOutsideSource && !requestedFiles.has(file) && !insideRoot(file, sourceRoot))
    ) {
      continue;
    }
    const bytes = Buffer.byteLength(sourceFile.text, "utf8");
    if (bytes > LIMITS.fileBytes)
      throw new Error(`Localization file limit exceeded: ${toRelative(file)}`);
    if (sourceIsExcluded(file)) continue;
    const bindings = translationBindings(sourceFile, checker);
    const formatterOwner = toRelative(file) === FORMATTER_OWNER;
    const authoredDisplayOwner = toRelative(file) === AUTHORED_DISPLAY_OWNER;

    const reportPunctuation = (node, context, text) => {
      if (PROHIBITED_PUNCTUATION.test(text))
        add(FINDING_CODES.punctuation, node, sourceFile, context, text);
    };
    const reportStatic = (code, node, context, expression = node) => {
      const parts = staticParts(expression, checker, bindings);
      for (const text of parts.texts.filter(meaningful)) {
        add(code, node, sourceFile, context, text);
        reportPunctuation(node, context, text);
      }
    };
    const reportUnsafeDynamic = (node, context, expression) => {
      if (
        !ts.isIdentifier(expression) &&
        !ts.isPropertyAccessExpression(expression) &&
        !ts.isTemplateExpression(expression) &&
        !ts.isBinaryExpression(expression) &&
        !ts.isConditionalExpression(expression)
      ) {
        return;
      }
      if (staticParts(expression, checker, bindings).translation) return;
      const dynamicRoots = ts.isConditionalExpression(expression)
        ? [expression.whenTrue, expression.whenFalse]
        : [expression];
      for (const unsafeNode of dynamicRoots.flatMap(unsafeDynamicPresentationNodes)) {
        add(
          FINDING_CODES.unsafeDynamicPresentation,
          unsafeNode,
          sourceFile,
          context,
          unsafeNode.getText(sourceFile),
        );
      }
    };

    const visit = (node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        isConstDeclaration(node) &&
        classBearingName(node.name.text)
      ) {
        for (const transform of classCaseTransforms(
          node.initializer,
          checker,
          bindings,
        )) {
          add(
            FINDING_CODES.authoredCaseTransform,
            node,
            sourceFile,
            node.name.text,
            transform,
          );
        }
      }
      if (ts.isJsxText(node) && meaningful(node.text)) {
        add(FINDING_CODES.jsxText, node, sourceFile, "jsx-child", node.text);
        reportPunctuation(node, "jsx-child", node.text);
      } else if (
        ts.isJsxExpression(node) &&
        node.expression &&
        !ts.isJsxAttribute(node.parent)
      ) {
        const parts = staticParts(node.expression, checker, bindings);
        for (const text of parts.texts.filter(meaningful)) {
          add(FINDING_CODES.jsxText, node, sourceFile, "jsx-expression", text);
          reportPunctuation(node, "jsx-expression", text);
        }
        reportUnsafeDynamic(node, "jsx-expression", node.expression);
      } else if (ts.isJsxAttribute(node)) {
        const name = node.name.getText(sourceFile);
        if (name === "className" && node.initializer) {
          const expression = ts.isJsxExpression(node.initializer)
            ? node.initializer.expression
            : node.initializer;
          if (expression) {
            for (const transform of classCaseTransforms(
              expression,
              checker,
              bindings,
            )) {
              add(
                FINDING_CODES.authoredCaseTransform,
                node,
                sourceFile,
                "className",
                transform,
              );
            }
          }
        }
        if (
          name === "textTransform" ||
          name === "fontVariant" ||
          name === "fontVariantCaps"
        ) {
          const expression = !node.initializer
            ? undefined
            : ts.isJsxExpression(node.initializer)
              ? node.initializer.expression
              : node.initializer;
          for (const transform of authoredStyleTransforms(
            expression,
            name,
            checker,
            bindings,
          )) {
            add(FINDING_CODES.authoredCaseTransform, node, sourceFile, name, transform);
          }
        }
        if (JSX_ATTRIBUTE_NAMES.has(name) && node.initializer) {
          const expression = ts.isJsxExpression(node.initializer)
            ? node.initializer.expression
            : node.initializer;
          if (expression)
            reportStatic(FINDING_CODES.jsxAttribute, node, name, expression);
          if (expression) reportUnsafeDynamic(node, name, expression);
        }
      } else if (ts.isPropertyAssignment(node)) {
        const name = propertyName(node.name);
        if (name !== null && classBearingName(name)) {
          for (const transform of classCaseTransforms(
            node.initializer,
            checker,
            bindings,
          )) {
            add(FINDING_CODES.authoredCaseTransform, node, sourceFile, name, transform);
          }
        }
        if (
          name === "textTransform" ||
          name === "fontVariant" ||
          name === "fontVariantCaps"
        ) {
          for (const transform of authoredStyleTransforms(
            node.initializer,
            name,
            checker,
            bindings,
          )) {
            add(FINDING_CODES.authoredCaseTransform, node, sourceFile, name, transform);
          }
        }
        const rawKeybindingGroupField =
          name === "group" &&
          ts.isObjectLiteralExpression(node.parent) &&
          node.parent.properties.some(
            (property) =>
              ts.isPropertyAssignment(property) &&
              propertyName(property.name) === "defaultChord",
          );
        if (name && (PRESENTATION_FIELD_NAMES.has(name) || rawKeybindingGroupField)) {
          reportStatic(FINDING_CODES.presentationField, node, name, node.initializer);
          reportUnsafeDynamic(node, name, node.initializer);
        }
      } else if (
        ts.isShorthandPropertyAssignment(node) &&
        (node.name.text === "textTransform" ||
          node.name.text === "fontVariant" ||
          node.name.text === "fontVariantCaps")
      ) {
        const resolved = symbolInitializer(node.name, checker);
        for (const transform of authoredStyleTransforms(
          resolved?.initializer,
          node.name.text,
          checker,
          bindings,
        )) {
          add(
            FINDING_CODES.authoredCaseTransform,
            node,
            sourceFile,
            node.name.text,
            transform,
          );
        }
      }

      if (ts.isCallExpression(node)) {
        const name = callName(node.expression);
        if (name && IMPERATIVE_CALL_NAMES.has(name) && node.arguments[0]) {
          reportStatic(FINDING_CODES.imperativeDisplay, node, name, node.arguments[0]);
          reportUnsafeDynamic(node, name, node.arguments[0]);
        }

        const translationKind = translationCallKind(node, bindings, checker);
        if (
          translationKind === "translation" ||
          translationKind === "message-factory"
        ) {
          const key = node.arguments[0];
          if (key && !isStaticMessageKey(key, checker, bindings)) {
            add(
              FINDING_CODES.dynamicMessageKey,
              key,
              sourceFile,
              name ?? "translation",
            );
          }
          const options = translationKind === "translation" ? node.arguments[1] : null;
          if (options && ts.isObjectLiteralExpression(options)) {
            for (const property of options.properties) {
              if (
                ts.isPropertyAssignment(property) &&
                propertyName(property.name) === "defaultValue"
              ) {
                add(
                  FINDING_CODES.translationDefault,
                  property,
                  sourceFile,
                  "defaultValue",
                );
              }
            }
          }
        } else if (translationKind === "confirmation-factory") {
          const confirmation = node.arguments[0];
          const fields = resolveObjectFields(confirmation, checker);
          const requiredFields = ["body", "cancelLabel", "confirmLabel", "title"];
          if (
            !confirmation ||
            fields === null ||
            requiredFields.some((field) => !fields.has(field))
          ) {
            add(
              FINDING_CODES.dynamicMessageKey,
              confirmation ?? node,
              sourceFile,
              "confirmation.structure",
            );
          } else {
            for (const fieldName of requiredFields) {
              const field = fields.get(fieldName);
              const descriptorFields = resolveObjectFields(field.expression, checker);
              const key = descriptorFields?.get("key")?.expression;
              if (key) {
                if (!isStaticMessageKey(key, checker, bindings)) {
                  add(
                    FINDING_CODES.dynamicMessageKey,
                    key,
                    key.getSourceFile(),
                    `confirmation.${fieldName}`,
                  );
                }
                continue;
              }
              const parts = staticParts(field.expression, checker, bindings);
              if (parts.translation) continue;
              const rawTexts = parts.texts.filter(meaningful);
              if (rawTexts.length > 0) {
                if (ts.isShorthandPropertyAssignment(field.origin)) {
                  for (const text of rawTexts) {
                    add(
                      FINDING_CODES.presentationField,
                      field.origin,
                      field.origin.getSourceFile(),
                      fieldName,
                      text,
                    );
                  }
                }
                continue;
              }
              add(
                FINDING_CODES.dynamicMessageKey,
                field.origin,
                field.origin.getSourceFile(),
                `confirmation.${fieldName}`,
              );
            }
          }
        }

        if (!formatterOwner && ts.isPropertyAccessExpression(node.expression)) {
          const method = node.expression.name.text;
          if (LOCALE_METHODS.has(method)) {
            const locale = node.arguments[LOCALE_METHODS.get(method)];
            add(
              literalLocale(locale, checker, bindings)
                ? FINDING_CODES.fixedLocaleFormat
                : FINDING_CODES.directLocaleFormat,
              node,
              sourceFile,
              method,
            );
          }
          if (
            ts.isIdentifier(node.expression.expression) &&
            node.expression.expression.text === "Intl" &&
            INTL_FORMATTERS.has(node.expression.name.text) &&
            !(authoredDisplayOwner && node.expression.name.text === "Collator")
          ) {
            const locale = node.arguments[0];
            add(
              literalLocale(locale, checker, bindings)
                ? FINDING_CODES.fixedLocaleFormat
                : FINDING_CODES.directLocaleFormat,
              node,
              sourceFile,
              `Intl.${node.expression.name.text}`,
            );
          }
        }
      }

      if (
        !formatterOwner &&
        ts.isNewExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === "Intl" &&
        INTL_FORMATTERS.has(node.expression.name.text) &&
        !(authoredDisplayOwner && node.expression.name.text === "Collator")
      ) {
        const locale = node.arguments?.[0];
        add(
          literalLocale(locale, checker, bindings)
            ? FINDING_CODES.fixedLocaleFormat
            : FINDING_CODES.directLocaleFormat,
          node,
          sourceFile,
          `Intl.${node.expression.name.text}`,
        );
      }

      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
        !(
          ts.isBinaryExpression(node.parent) &&
          node.parent.operatorToken.kind === ts.SyntaxKind.PlusToken
        )
      ) {
        const parts = staticParts(node, checker, bindings);
        if (parts.translation) {
          add(FINDING_CODES.translatedFragment, node, sourceFile, "binary-plus");
        }
      }
      if (ts.isTemplateExpression(node)) {
        const parts = staticParts(node, checker, bindings);
        if (parts.translation && parts.texts.some(meaningful)) {
          add(FINDING_CODES.translatedFragment, node, sourceFile, "template");
        }
      }

      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      ) {
        const target = node.left.getText(sourceFile);
        if (
          target === "document.title" ||
          target.endsWith(".textContent") ||
          target.endsWith(".innerText")
        ) {
          reportStatic(FINDING_CODES.imperativeDisplay, node, target, node.right);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  for (const file of cssFiles) {
    if (!allowOutsideSource && !insideRoot(file, sourceRoot)) continue;
    if (sourceIsExcluded(file)) continue;
    const source = readFileSync(file, "utf8");
    if (Buffer.byteLength(source, "utf8") > LIMITS.fileBytes) {
      throw new Error(`Localization file limit exceeded: ${toRelative(file)}`);
    }
    const masked = maskCssCommentsAndStrings(source);
    const declaration =
      /(?:^|[;{])\s*(text-transform|font-variant(?:-caps)?)\s*:\s*([^;}]+)/giu;
    for (const match of masked.matchAll(declaration)) {
      const property = match[1]?.toLowerCase();
      const value = match[2]?.toLowerCase() ?? "";
      if (property === undefined || match.index === undefined) continue;
      const valueTokens = value
        .split(/\s+/u)
        .map((token) => token.replace(/!important$/u, ""))
        .filter((token) => token.length > 0 && token !== "!important");
      const normalizedValue = valueTokens.join(" ");
      const transform =
        property === "text-transform"
          ? normalizedValue !== "none"
            ? normalizedValue || "dynamic"
            : undefined
          : property === "font-variant-caps"
            ? normalizedValue !== "normal"
              ? normalizedValue || "dynamic"
              : undefined
            : normalizedValue.includes("var(") ||
                valueTokens.some((token) => CSS_CAPS_TRANSFORMS.has(token))
              ? normalizedValue || "dynamic"
              : undefined;
      if (transform === undefined) continue;
      const propertyOffset = match.index + match[0].indexOf(match[1]);
      const position = lineAndColumnAt(source, propertyOffset);
      pushFinding({
        code: FINDING_CODES.authoredCaseTransform,
        column: position.column,
        context: property,
        line: position.line,
        path: toRelative(file),
        snippet: normalizeText(
          source.slice(propertyOffset, match.index + match[0].length),
        ).slice(0, LIMITS.snippetChars),
        text: transform,
      });
    }
    const applyDirective = /@apply\s+([^;}]+)/giu;
    for (const match of masked.matchAll(applyDirective)) {
      if (match.index === undefined || match[1] === undefined) continue;
      const transform = classCaseTransform(match[1]);
      if (transform === null) continue;
      const position = lineAndColumnAt(source, match.index);
      pushFinding({
        code: FINDING_CODES.authoredCaseTransform,
        column: position.column,
        context: "@apply",
        line: position.line,
        path: toRelative(file),
        snippet: normalizeText(
          source.slice(match.index, match.index + match[0].length),
        ).slice(0, LIMITS.snippetChars),
        text: transform,
      });
    }
  }

  rawFindings.sort(
    (a, b) =>
      compareText(a.path, b.path) ||
      a.line - b.line ||
      a.column - b.column ||
      compareText(a.code, b.code),
  );
  const occurrences = new Map();
  return rawFindings.map((finding) => {
    const signature = [finding.code, finding.path, finding.context, finding.text].join(
      "\0",
    );
    const occurrence = occurrences.get(signature) ?? 0;
    occurrences.set(signature, occurrence + 1);
    const id = createHash("sha256")
      .update(`localization-v1\0${signature}\0${occurrence}`)
      .digest("hex")
      .slice(0, 24);
    return Object.freeze({
      code: finding.code,
      column: finding.column,
      id,
      line: finding.line,
      path: finding.path,
      snippet: finding.snippet,
    });
  });
}

export function scanFiles(files) {
  return scanProgram(
    [...files].map((file) => resolve(file)),
    true,
  );
}

export function scanProductionSources() {
  return scanProgram(collectSourceFiles());
}


function run() {
  // Zero user-facing source literals is structural: the localization migration is
  // complete, so ANY finding fails the scan. There is no allowlist / exemption
  // mechanism to re-argue a literal past the gate (W06.P18.S98).
  const findings = scanProductionSources();

  if (findings.length > 0) {
    process.stderr.write("localization-scan: user-facing source literals are not permitted:\n");
    for (const finding of findings) {
      process.stderr.write(
        `  ${finding.code} ${finding.path}:${finding.line}:${finding.column} ${finding.snippet}\n`,
      );
    }
    process.stderr.write(
      "  Move the copy into the locale catalogs and resolve it at the render boundary.\n",
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write("localization-scan: clean. 0 user-facing source literals.\n");
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  try {
    run();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Localization scan failed.";
    process.stderr.write(`localization-scan: ${message}\n`);
    process.exitCode = 1;
  }
}

export { FINDING_CODES, LIMITS };
