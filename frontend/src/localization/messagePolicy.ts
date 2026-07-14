import { MESSAGE_KEYS, type MessageKey } from "../platform/localization/message";

export type MessageRole =
  | "action"
  | "destructive-action"
  | "label"
  | "status"
  | "error-title"
  | "error-message"
  | "description"
  | "accessibility"
  | "confirmation";

export const APPROVED_UI_TERMS = [
  "GitHub",
  "Markdown",
  "JSON",
  "YAML",
  "URLs",
  "URL",
  "macOS",
  "Windows",
  "Linux",
  "Git",
] as const;

export type ApprovedUiTerm = (typeof APPROVED_UI_TERMS)[number];

export interface MessagePolicyEntry {
  readonly role: MessageRole;
  readonly allowedTerms?: readonly ApprovedUiTerm[];
}

export const ENGLISH_MESSAGE_POLICY = {
  "common:actions.cancel": { role: "action" },
  "common:actions.close": { role: "action" },
  "common:actions.reloadPage": { role: "action" },
  "common:actions.retry": { role: "action" },
  "common:destructiveActions.discardChanges": { role: "destructive-action" },
  "errors:fallback.contentUnavailable": { role: "error-message" },
  "errors:unexpectedApplication.message": { role: "error-message" },
  "errors:unexpectedApplication.title": { role: "error-title" },
  "errors:unexpectedSection.message": { role: "error-message" },
  "errors:unexpectedSection.title": { role: "error-title" },
} as const satisfies Record<MessageKey, MessagePolicyEntry>;

export const IMPERATIVE_ACTION_VERBS = [
  "Add",
  "Apply",
  "Ask",
  "Cancel",
  "Check",
  "Choose",
  "Clear",
  "Close",
  "Confirm",
  "Copy",
  "Create",
  "Delete",
  "Discard",
  "Edit",
  "Hide",
  "Move",
  "Open",
  "Reload",
  "Remove",
  "Rename",
  "Reset",
  "Retry",
  "Save",
  "Select",
  "Show",
  "Start",
  "Stop",
  "Try",
  "Update",
] as const;

export const DESTRUCTIVE_ACTION_VERBS = ["Delete", "Discard", "Remove"] as const;

export const RECOVERY_VERBS = [
  "Ask",
  "Check",
  "Choose",
  "Close",
  "Open",
  "Reload",
  "Retry",
  "Save",
  "Select",
  "Try",
  "Update",
] as const;

export interface ProhibitedUiTerm {
  readonly id: string;
  readonly pattern: RegExp;
}

export const PROHIBITED_UI_TERMS: readonly ProhibitedUiTerm[] = Object.freeze([
  { id: "engine", pattern: /\bengine\b/iu },
  { id: "backend", pattern: /\bbackend\b/iu },
  { id: "frontend", pattern: /\bfrontend\b/iu },
  { id: "adapter", pattern: /\badapter\b/iu },
  { id: "token", pattern: /\btokens?\b/iu },
  { id: "identifier", pattern: /\bidentifiers?\b/iu },
  { id: "wire", pattern: /\bwire\b/iu },
  { id: "payload", pattern: /\bpayload\b/iu },
  { id: "schema", pattern: /\bschema(?:\s+key)?\b/iu },
  { id: "action-id", pattern: /\baction\s+id\b/iu },
  { id: "route", pattern: /\broute(?:\s+name)?\b/iu },
  { id: "query-cache", pattern: /\bquery\s+cache\b/iu },
  { id: "hydration", pattern: /\bhydrat(?:e|ed|es|ing|ion)\b/iu },
  { id: "provider", pattern: /\bprovider\b/iu },
  { id: "reducer", pattern: /\breducer\b/iu },
  { id: "component", pattern: /\bcomponent\b/iu },
  { id: "hook", pattern: /\bhook\b/iu },
  { id: "stack-trace", pattern: /\bstack\s+trace\b/iu },
  { id: "exception", pattern: /\bexception\b/iu },
  { id: "loopback", pattern: /\bloopback\b/iu },
  { id: "debug", pattern: /\bdebug(?:ging)?\b/iu },
  { id: "development", pattern: /\bdevelopment\b/iu },
  { id: "development-mode", pattern: /\b(?:development|dev)\s+mode\b/iu },
  { id: "development-control", pattern: /\bdevelopment\s+controls?\b/iu },
  { id: "not-implemented", pattern: /\bnot\s+implemented\b/iu },
  { id: "implementation", pattern: /\bimplementation\b/iu },
  {
    id: "implementation-difficulty",
    pattern:
      /\b(?:difficult|hard|complex|complicated)\s+to\s+(?:implement|support|fix|understand)\b/iu,
  },
  { id: "vault-bearing", pattern: /\bvault-bearing\b/iu },
  { id: "workspace-map", pattern: /\bworkspace\s+map\b/iu },
  { id: "semantic-search", pattern: /\bsemantic\s+search\b/iu },
  { id: "rag", pattern: /\bRAG\b/u },
  { id: "sse", pattern: /\bSSE\b/u },
  { id: "tier", pattern: /\btier(?:s)?\b/iu },
  { id: "scope", pattern: /\bscope\b/iu },
  { id: "endpoint", pattern: /\bendpoint\b/iu },
  { id: "service", pattern: /\bservice\b/iu },
  { id: "command-line", pattern: /\bcommand\s+line\b/iu },
  { id: "internal", pattern: /\binternal\b/iu },
  { id: "webgl", pattern: /\bWebGL\b/iu },
  { id: "gpu", pattern: /\bGPU\b/iu },
  { id: "cli", pattern: /\bCLI\b/iu },
  { id: "parameter", pattern: /\bparameter\b/iu },
  { id: "physics", pattern: /\bphysics\b/iu },
  { id: "graph-theory", pattern: /\bgraph\s+theory\b/iu },
  { id: "node", pattern: /\bnode\b/iu },
  { id: "internal-package", pattern: /\bvaultspec-(?:core|rag)\b/iu },
]);

export type MessagePolicyIssueCode =
  | "empty"
  | "too-long"
  | "em-dash"
  | "nested-message"
  | "raw-key"
  | "raw-placeholder"
  | "diagnostic"
  | "prohibited-term"
  | "term-casing"
  | "sentence-case"
  | "title-case"
  | "non-imperative-action"
  | "non-destructive-verb"
  | "action-punctuation"
  | "not-actionable";

export interface MessagePolicyIssue {
  readonly code: MessagePolicyIssueCode;
  readonly detail?: string;
}

export type StaticMessagePart =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "value"; readonly name: string };

const INTERPOLATION_TOKEN = /\{\{\s*-?\s*([a-z][a-zA-Z0-9]*)\s*\}\}/gu;
const RAW_PLACEHOLDER = /\{\{|\}\}|\$\{|%\{/u;
const RAW_MESSAGE_KEY =
  /\b[a-z][a-zA-Z0-9]*:[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)*\b/u;
const DIAGNOSTIC_PATTERNS = [
  /\b(?:Error|TypeError|ReferenceError|SyntaxError|RangeError|URIError|EvalError):(?=\s|$)/u,
  /(?:^|\s)at\s+[\w.[\]<>]+\s*\([^\n)]+:\d+:\d+\)/u,
  /(?:[A-Za-z]:\\|\/(?:home|Users|var|tmp|src)\/)[^\s]+/u,
  /(?:^|\s)(?:\.{0,2}[\\/])?(?:src|frontend|engine|node_modules|\.vault|\.git)[\\/][^\s]+/u,
  /\b(?:localhost|127\.0\.0\.1|::1)(?::\d+)?\b/iu,
  /(?:^|\s)--[a-z][a-z0-9-]*(?:\s|$)/u,
  /(?:^|[`$]\s*|\s)(?:npm\s+run|npx|pnpm|yarn|cargo|rustc|node|git|vaultspec(?:-core)?)\s+[a-z][a-z0-9:_-]*/u,
] as const;
const WORD = /\p{L}[\p{L}\p{M}'’-]*/gu;
const SENTENCE_BOUNDARY = /(?<=[.!?])\s+/u;
const RECOVERY_CLAUSE_BOUNDARY = /(?:[.!?;]\s+|,\s+(?:then\s+)?)/u;
const VALUE_MARKER = "\uFFFC";
const FAILED_RECOVERY_COMPLEMENTS: ReadonlySet<string> = new Set([
  "became",
  "cannot",
  "disabled",
  "failed",
  "fails",
  "failure",
  "has",
  "is",
  "pending",
  "seems",
  "unavailable",
  "was",
]);

const IMPERATIVE_VERB_SET: ReadonlySet<string> = new Set(IMPERATIVE_ACTION_VERBS);
const DESTRUCTIVE_VERB_SET: ReadonlySet<string> = new Set(DESTRUCTIVE_ACTION_VERBS);
const RECOVERY_VERB_SET: ReadonlySet<string> = new Set(RECOVERY_VERBS);
const MESSAGE_KEY_SET: ReadonlySet<string> = new Set(MESSAGE_KEYS);

export function staticMessageParts(template: string): readonly StaticMessagePart[] {
  const parts: StaticMessagePart[] = [];
  let cursor = 0;
  for (const match of template.matchAll(INTERPOLATION_TOKEN)) {
    const index = match.index;
    if (index > cursor) {
      parts.push({ kind: "text", value: template.slice(cursor, index) });
    }
    parts.push({ kind: "value", name: match[1]! });
    cursor = index + match[0].length;
  }
  if (cursor < template.length) {
    parts.push({ kind: "text", value: template.slice(cursor) });
  }
  return Object.freeze(parts);
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function termPattern(term: ApprovedUiTerm): RegExp {
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escapePattern(term)}(?![\\p{L}\\p{N}])`,
    "giu",
  );
}

function issue(
  issues: MessagePolicyIssue[],
  code: MessagePolicyIssueCode,
  detail?: string,
): void {
  if (issues.some((item) => item.code === code && item.detail === detail)) return;
  issues.push(detail === undefined ? { code } : { code, detail });
}

function firstWord(value: string): string | null {
  WORD.lastIndex = 0;
  return WORD.exec(value)?.[0] ?? null;
}

function isActionableRecoveryClause(clause: string): boolean {
  const trimmed = clause.trimStart();
  if (trimmed.length === 0 || trimmed.startsWith(VALUE_MARKER)) return false;

  const verb = firstWord(trimmed);
  if (verb === null) return false;
  const canonicalVerb = `${verb[0]!.toLocaleUpperCase("en")}${verb.slice(1)}`;
  if (!RECOVERY_VERB_SET.has(canonicalVerb)) return false;

  const verbEnd = trimmed.indexOf(verb) + verb.length;
  const complement = trimmed.slice(verbEnd).trimStart();
  if (complement.length === 0) return false;
  if (complement.startsWith(VALUE_MARKER)) return true;

  const complementWord = firstWord(complement)?.toLocaleLowerCase("en");
  return (
    complementWord !== undefined && !FAILED_RECOVERY_COMPLEMENTS.has(complementWord)
  );
}

function sentenceCaseIssues(
  value: string,
  approvedTerms: readonly ApprovedUiTerm[],
  issues: MessagePolicyIssue[],
): void {
  const protectedText = approvedTerms.reduce(
    (text, term) =>
      text.replace(
        termPattern(term),
        (match) => `${VALUE_MARKER}${" ".repeat(Math.max(0, match.length - 1))}`,
      ),
    value,
  );

  for (const sentence of protectedText.split(SENTENCE_BOUNDARY)) {
    const trimmed = sentence.trimStart();
    if (trimmed.length === 0) continue;

    if (!trimmed.startsWith(VALUE_MARKER)) {
      const initial = trimmed.match(/\p{L}/u)?.[0];
      if (
        initial !== undefined &&
        initial.toLocaleUpperCase("en") !== initial &&
        initial.toLocaleLowerCase("en") === initial
      ) {
        issue(issues, "sentence-case");
      }
    }

    const words = [...trimmed.matchAll(WORD)];
    const firstInteriorWord = trimmed.startsWith(VALUE_MARKER) ? 0 : 1;
    for (let index = firstInteriorWord; index < words.length; index += 1) {
      const word = words[index]![0];
      const first = word[0]!;
      if (
        first.toLocaleUpperCase("en") === first &&
        first.toLocaleLowerCase("en") !== first &&
        /\p{Ll}/u.test(word.slice(1))
      ) {
        issue(issues, "title-case", word);
      }
    }
  }
}

function roleBounds(role: MessageRole): { chars: number; words: number } {
  switch (role) {
    case "action":
    case "destructive-action":
      return { chars: 60, words: 6 };
    case "label":
    case "status":
    case "error-title":
      return { chars: 80, words: 10 };
    case "error-message":
    case "confirmation":
      return { chars: 200, words: 32 };
    case "description":
    case "accessibility":
      return { chars: 240, words: 40 };
  }
}

export function validateEnglishMessage(
  key: MessageKey,
  template: string,
): readonly MessagePolicyIssue[] {
  const issues: MessagePolicyIssue[] = [];
  const policy: MessagePolicyEntry = ENGLISH_MESSAGE_POLICY[key];
  const parts = staticMessageParts(template);
  const staticText = parts
    .map((part) => (part.kind === "text" ? part.value : VALUE_MARKER))
    .join("");
  const literalText = parts
    .filter(
      (part): part is Extract<StaticMessagePart, { kind: "text" }> =>
        part.kind === "text",
    )
    .map((part) => part.value)
    .join(" ");

  if (template.trim().length === 0 || literalText.trim().length === 0) {
    issue(issues, "empty");
  }

  const bounds = roleBounds(policy.role);
  const wordCount = [...staticText.matchAll(WORD)].length;
  if (template.length > bounds.chars || wordCount > bounds.words) {
    issue(issues, "too-long");
  }
  if (literalText.includes("\u2014")) issue(issues, "em-dash");
  if (literalText.includes("$t(")) issue(issues, "nested-message");
  if (
    RAW_MESSAGE_KEY.test(literalText) ||
    [...MESSAGE_KEY_SET].some((messageKey) => literalText.includes(messageKey))
  ) {
    issue(issues, "raw-key");
  }
  if (RAW_PLACEHOLDER.test(literalText)) issue(issues, "raw-placeholder");
  if (DIAGNOSTIC_PATTERNS.some((pattern) => pattern.test(literalText))) {
    issue(issues, "diagnostic");
  }

  for (const term of PROHIBITED_UI_TERMS) {
    if (term.pattern.test(literalText)) issue(issues, "prohibited-term", term.id);
  }

  const approvedTerms = policy.allowedTerms ?? APPROVED_UI_TERMS;
  for (const term of approvedTerms) {
    for (const match of literalText.matchAll(termPattern(term))) {
      if (match[0] !== term) issue(issues, "term-casing", term);
    }
  }
  sentenceCaseIssues(staticText, approvedTerms, issues);

  if (policy.role === "action" || policy.role === "destructive-action") {
    const verb = firstWord(staticText);
    if (verb === null || !IMPERATIVE_VERB_SET.has(verb)) {
      issue(issues, "non-imperative-action");
    }
    if (/[.!?]\s*$/u.test(staticText)) issue(issues, "action-punctuation");
    if (
      policy.role === "destructive-action" &&
      (verb === null || !DESTRUCTIVE_VERB_SET.has(verb))
    ) {
      issue(issues, "non-destructive-verb");
    }
  }

  if (policy.role === "error-message") {
    const clauses = staticText.split(RECOVERY_CLAUSE_BOUNDARY);
    const actionable = clauses.some(isActionableRecoveryClause);
    if (!actionable) issue(issues, "not-actionable");
  }

  return Object.freeze(issues);
}
