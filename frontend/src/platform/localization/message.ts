import { en, type EnglishResources } from "../../locales/en";

type MessageLeafPath<T> = {
  [Key in keyof T & string]: T[Key] extends string
    ? Key
    : T[Key] extends Readonly<Record<string, unknown>>
      ? `${Key}.${MessageLeafPath<T[Key]>}`
      : never;
}[keyof T & string];

type PhysicalMessageKeyByNamespace = {
  [Namespace in keyof EnglishResources & string]: `${Namespace}:${MessageLeafPath<
    EnglishResources[Namespace]
  >}`;
};

export const PLURAL_CATEGORIES = [
  "zero",
  "one",
  "two",
  "few",
  "many",
  "other",
] as const;

export type PluralCategory = (typeof PLURAL_CATEGORIES)[number];
export type PhysicalMessageKey =
  PhysicalMessageKeyByNamespace[keyof PhysicalMessageKeyByNamespace];

type LogicalPluralKey<Key extends string> =
  Key extends `${infer Base}_${PluralCategory}` ? Base : never;

/** A semantic plural family addressed without its physical CLDR suffix. */
export type PluralMessageKey = LogicalPluralKey<PhysicalMessageKey>;
type PhysicalPluralMessageKey = Extract<
  PhysicalMessageKey,
  `${PluralMessageKey}_${PluralCategory}`
>;
export type OrdinaryMessageKey = Exclude<PhysicalMessageKey, PhysicalPluralMessageKey>;

type DestructiveActionKeyByNamespace = {
  [Namespace in keyof EnglishResources & string]: EnglishResources[Namespace] extends {
    readonly destructiveActions: infer Actions extends Readonly<
      Record<string, unknown>
    >;
  }
    ? `${Namespace}:destructiveActions.${MessageLeafPath<Actions>}`
    : never;
};

type GuardedActionKeyByNamespace = {
  [Namespace in keyof EnglishResources & string]: EnglishResources[Namespace] extends {
    readonly guardedActions: infer Actions extends Readonly<Record<string, unknown>>;
  }
    ? `${Namespace}:guardedActions.${MessageLeafPath<Actions>}`
    : never;
};

/** A public semantic message key. Plural families use their logical base key. */
export type MessageKey = OrdinaryMessageKey | PluralMessageKey;
export type DestructiveActionMessageKey =
  DestructiveActionKeyByNamespace[keyof DestructiveActionKeyByNamespace];
export type GuardedActionMessageKey =
  GuardedActionKeyByNamespace[keyof GuardedActionKeyByNamespace];

/** Interpolation data may cross non-React presentation seams. */
export type MessageValue = string | number;
export type MessageValues = Readonly<Record<string, MessageValue>>;

export const MESSAGE_KEY_MAX_CHARS = 256;
export const MESSAGE_VALUE_NAME_MAX_CHARS = 64;
export const MESSAGE_VALUE_COUNT_MAX = 16;
export const MESSAGE_VALUE_STRING_MAX_CHARS = 4096;

const MESSAGE_KEY_PATTERN =
  /^[a-z][a-zA-Z0-9]*:[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)*$/;
const MESSAGE_VALUE_NAME_PATTERN = /^[a-z][a-zA-Z0-9]*$/;
const PROHIBITED_VALUE_NAMES = new Set(["constructor", "prototype"]);

export interface MessageDescriptor<
  Key extends OrdinaryMessageKey = OrdinaryMessageKey,
> {
  readonly key: Key;
  readonly values?: MessageValues;
}

export interface CountMessageDescriptor<
  Key extends PluralMessageKey = PluralMessageKey,
> {
  readonly key: Key;
  readonly values: Readonly<{ count: number }>;
}

export type AnyMessageDescriptor = MessageDescriptor | CountMessageDescriptor;

export const SAFE_CANCEL_MESSAGE_KEYS = [
  "common:actions.cancel",
] as const satisfies readonly MessageKey[];

export type SafeCancelMessageKey = (typeof SAFE_CANCEL_MESSAGE_KEYS)[number];
export type SafeCancelMessageDescriptor = MessageDescriptor<SafeCancelMessageKey>;
export type DestructiveActionMessageDescriptor =
  MessageDescriptor<DestructiveActionMessageKey>;
export type GuardedActionMessageDescriptor = MessageDescriptor<GuardedActionMessageKey>;

export interface ConfirmationDescriptor {
  readonly title: MessageDescriptor;
  readonly body: MessageDescriptor;
  readonly confirmLabel: DestructiveActionMessageDescriptor;
  readonly cancelLabel: SafeCancelMessageDescriptor;
}

export interface ConfirmationDescriptorInput {
  readonly title: MessageDescriptor;
  readonly body: MessageDescriptor;
  readonly confirmLabel: DestructiveActionMessageDescriptor;
  readonly cancelLabel: SafeCancelMessageDescriptor;
}

export interface GuardedConfirmationDescriptor {
  readonly title: MessageDescriptor;
  readonly body: MessageDescriptor;
  readonly confirmLabel: GuardedActionMessageDescriptor;
  readonly cancelLabel: SafeCancelMessageDescriptor;
}

export interface GuardedConfirmationDescriptorInput {
  readonly title: MessageDescriptor;
  readonly body: MessageDescriptor;
  readonly confirmLabel: GuardedActionMessageDescriptor;
  readonly cancelLabel: SafeCancelMessageDescriptor;
}

export type ActionConfirmationDescriptor =
  | ({ readonly kind: "destructive" } & ConfirmationDescriptor)
  | ({ readonly kind: "guarded" } & GuardedConfirmationDescriptor);

export type ActionConfirmationDescriptorInput =
  | ({ readonly kind: "destructive" } & ConfirmationDescriptorInput)
  | ({ readonly kind: "guarded" } & GuardedConfirmationDescriptorInput);

type OwnDataRecord = Readonly<Record<string, unknown>>;

function ownDataRecord(value: unknown): OwnDataRecord | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;

  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;

    const snapshot: Record<string, unknown> = Object.create(null) as Record<
      string,
      unknown
    >;
    for (const propertyKey of Reflect.ownKeys(value)) {
      if (typeof propertyKey !== "string") return null;
      const descriptor = Object.getOwnPropertyDescriptor(value, propertyKey);
      if (descriptor === undefined || !("value" in descriptor)) return null;
      snapshot[propertyKey] = descriptor.value;
    }
    return Object.freeze(snapshot);
  } catch {
    return null;
  }
}

function hasExactFields(
  record: OwnDataRecord,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const fields = Reflect.ownKeys(record);
  if (fields.some((field) => typeof field !== "string")) return false;
  if (required.some((field) => !Object.hasOwn(record, field))) return false;

  const allowed = new Set([...required, ...optional]);
  return fields.every((field) => typeof field === "string" && allowed.has(field));
}

function collectPhysicalMessageKeys(): readonly PhysicalMessageKey[] {
  const keys: string[] = [];

  const visit = (namespace: string, path: readonly string[], value: unknown): void => {
    if (typeof value === "string") {
      keys.push(`${namespace}:${path.join(".")}`);
      return;
    }

    const record = value as Readonly<Record<string, unknown>>;
    for (const [segment, child] of Object.entries(record)) {
      visit(namespace, [...path, segment], child);
    }
  };

  for (const [namespace, catalog] of Object.entries(en)) {
    visit(namespace, [], catalog);
  }

  return Object.freeze(keys as PhysicalMessageKey[]);
}

function logicalPluralKey(key: string): string | null {
  for (const category of PLURAL_CATEGORIES) {
    const suffix = `_${category}`;
    if (key.endsWith(suffix)) return key.slice(0, -suffix.length);
  }
  return null;
}

/** Every physical source-catalog leaf, including CLDR-suffixed plural variants. */
export const PHYSICAL_MESSAGE_KEYS = collectPhysicalMessageKeys();

/** Logical plural identities derived from the physical CLDR-suffixed leaves. */
export const PLURAL_MESSAGE_KEYS = Object.freeze([
  ...new Set(PHYSICAL_MESSAGE_KEYS.map(logicalPluralKey).filter(Boolean)),
] as PluralMessageKey[]);

const PLURAL_MESSAGE_KEY_SET: ReadonlySet<string> = new Set(PLURAL_MESSAGE_KEYS);

export const ORDINARY_MESSAGE_KEYS = Object.freeze(
  PHYSICAL_MESSAGE_KEYS.filter(
    (key): key is OrdinaryMessageKey => logicalPluralKey(key) === null,
  ),
);

/** Public logical key inventory. Physical plural variants never escape the catalog. */
export const MESSAGE_KEYS = Object.freeze([
  ...ORDINARY_MESSAGE_KEYS,
  ...PLURAL_MESSAGE_KEYS,
] as MessageKey[]);

/** Destructive action leaves generated from the catalog's semantic category. */
export const DESTRUCTIVE_ACTION_MESSAGE_KEYS = Object.freeze(
  ORDINARY_MESSAGE_KEYS.filter((key) => {
    const namespaceEnd = key.indexOf(":");
    return key.slice(namespaceEnd + 1).startsWith("destructiveActions.");
  }) as DestructiveActionMessageKey[],
);

/** Guarded action leaves generated from the catalog's semantic category. */
export const GUARDED_ACTION_MESSAGE_KEYS = Object.freeze(
  ORDINARY_MESSAGE_KEYS.filter((key) => {
    const namespaceEnd = key.indexOf(":");
    return key.slice(namespaceEnd + 1).startsWith("guardedActions.");
  }) as GuardedActionMessageKey[],
);

const ORDINARY_MESSAGE_KEY_SET: ReadonlySet<string> = new Set(ORDINARY_MESSAGE_KEYS);
const DESTRUCTIVE_ACTION_MESSAGE_KEY_SET: ReadonlySet<string> = new Set(
  DESTRUCTIVE_ACTION_MESSAGE_KEYS,
);
const GUARDED_ACTION_MESSAGE_KEY_SET: ReadonlySet<string> = new Set(
  GUARDED_ACTION_MESSAGE_KEYS,
);
const SAFE_CANCEL_MESSAGE_KEY_SET: ReadonlySet<string> = new Set(
  SAFE_CANCEL_MESSAGE_KEYS,
);

export function isMessageKey(value: unknown): value is MessageKey {
  return (
    typeof value === "string" &&
    value.length <= MESSAGE_KEY_MAX_CHARS &&
    MESSAGE_KEY_PATTERN.test(value) &&
    (ORDINARY_MESSAGE_KEY_SET.has(value) || PLURAL_MESSAGE_KEY_SET.has(value))
  );
}

export function isPluralMessageKey(value: unknown): value is PluralMessageKey {
  return typeof value === "string" && PLURAL_MESSAGE_KEY_SET.has(value);
}

export function isOrdinaryMessageKey(value: unknown): value is OrdinaryMessageKey {
  return typeof value === "string" && ORDINARY_MESSAGE_KEY_SET.has(value);
}

function normalizeMessageValues(value: unknown): MessageValues | null {
  const record = ownDataRecord(value);
  if (record === null) return null;

  const entries = Reflect.ownKeys(record);
  if (entries.length > MESSAGE_VALUE_COUNT_MAX) return null;

  const normalized: Record<string, MessageValue> = Object.create(null) as Record<
    string,
    MessageValue
  >;
  for (const name of entries) {
    if (
      typeof name !== "string" ||
      name.length > MESSAGE_VALUE_NAME_MAX_CHARS ||
      !MESSAGE_VALUE_NAME_PATTERN.test(name) ||
      PROHIBITED_VALUE_NAMES.has(name)
    ) {
      return null;
    }

    const item = record[name];
    if (typeof item === "string") {
      if (item.length > MESSAGE_VALUE_STRING_MAX_CHARS) return null;
      normalized[name] = item;
      continue;
    }
    if (typeof item === "number" && Number.isFinite(item)) {
      normalized[name] = item;
      continue;
    }
    return null;
  }

  return Object.freeze(normalized);
}

export function normalizeMessageDescriptor(value: unknown): MessageDescriptor | null {
  const record = ownDataRecord(value);
  if (record === null || !hasExactFields(record, ["key"], ["values"])) return null;
  if (!isOrdinaryMessageKey(record.key)) return null;

  if (!Object.hasOwn(record, "values")) {
    return Object.freeze({ key: record.key });
  }
  const values = normalizeMessageValues(record.values);
  return values === null || Object.hasOwn(values, "count")
    ? null
    : Object.freeze({ key: record.key, values });
}

export function createMessageDescriptor<const Key extends OrdinaryMessageKey>(
  key: Key,
  values?: MessageValues,
): MessageDescriptor<Key> | null {
  const normalized = normalizeMessageDescriptor(
    values === undefined ? { key } : { key, values },
  );
  return normalized as MessageDescriptor<Key> | null;
}

export function normalizeCountMessageDescriptor(
  value: unknown,
): CountMessageDescriptor | null {
  const record = ownDataRecord(value);
  if (record === null || !hasExactFields(record, ["key", "values"])) return null;
  if (!isPluralMessageKey(record.key)) return null;

  const values = ownDataRecord(record.values);
  if (values === null || !hasExactFields(values, ["count"])) return null;
  const count = values.count;
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
    return null;
  }

  return Object.freeze({
    key: record.key,
    values: Object.freeze({ count }),
  });
}

export function createCountMessageDescriptor<const Key extends PluralMessageKey>(
  key: Key,
  count: number,
): CountMessageDescriptor<Key> | null {
  return normalizeCountMessageDescriptor({
    key,
    values: { count },
  }) as CountMessageDescriptor<Key> | null;
}

export function isMessageDescriptor(value: unknown): value is MessageDescriptor {
  return normalizeMessageDescriptor(value) !== null;
}

function normalizeSafeCancelLabel(value: unknown): SafeCancelMessageDescriptor | null {
  const normalized = normalizeMessageDescriptor(value);
  if (
    normalized === null ||
    normalized.values !== undefined ||
    !SAFE_CANCEL_MESSAGE_KEY_SET.has(normalized.key)
  ) {
    return null;
  }
  return normalized as SafeCancelMessageDescriptor;
}

export function normalizeDestructiveActionMessageDescriptor(
  value: unknown,
): DestructiveActionMessageDescriptor | null {
  const normalized = normalizeMessageDescriptor(value);
  if (normalized === null || !DESTRUCTIVE_ACTION_MESSAGE_KEY_SET.has(normalized.key)) {
    return null;
  }
  return normalized as DestructiveActionMessageDescriptor;
}

export function normalizeGuardedActionMessageDescriptor(
  value: unknown,
): GuardedActionMessageDescriptor | null {
  const normalized = normalizeMessageDescriptor(value);
  if (normalized === null || !GUARDED_ACTION_MESSAGE_KEY_SET.has(normalized.key)) {
    return null;
  }
  return normalized as GuardedActionMessageDescriptor;
}

export function normalizeConfirmationDescriptor(
  value: unknown,
): ConfirmationDescriptor | null {
  const record = ownDataRecord(value);
  if (
    record === null ||
    !hasExactFields(record, ["title", "body", "confirmLabel", "cancelLabel"])
  ) {
    return null;
  }

  const title = normalizeMessageDescriptor(record.title);
  const body = normalizeMessageDescriptor(record.body);
  const confirmLabel = normalizeDestructiveActionMessageDescriptor(record.confirmLabel);
  const cancelLabel = normalizeSafeCancelLabel(record.cancelLabel);
  if (
    title === null ||
    body === null ||
    confirmLabel === null ||
    cancelLabel === null
  ) {
    return null;
  }

  return Object.freeze({ title, body, confirmLabel, cancelLabel });
}

export function createConfirmationDescriptor(
  input: ConfirmationDescriptorInput,
): ConfirmationDescriptor | null {
  return normalizeConfirmationDescriptor(input);
}

export function isConfirmationDescriptor(
  value: unknown,
): value is ConfirmationDescriptor {
  return normalizeConfirmationDescriptor(value) !== null;
}

export function normalizeGuardedConfirmationDescriptor(
  value: unknown,
): GuardedConfirmationDescriptor | null {
  const record = ownDataRecord(value);
  if (
    record === null ||
    !hasExactFields(record, ["title", "body", "confirmLabel", "cancelLabel"])
  ) {
    return null;
  }

  const title = normalizeMessageDescriptor(record.title);
  const body = normalizeMessageDescriptor(record.body);
  const confirmLabel = normalizeGuardedActionMessageDescriptor(record.confirmLabel);
  const cancelLabel = normalizeSafeCancelLabel(record.cancelLabel);
  if (
    title === null ||
    body === null ||
    confirmLabel === null ||
    cancelLabel === null
  ) {
    return null;
  }

  return Object.freeze({ title, body, confirmLabel, cancelLabel });
}

export function createGuardedConfirmationDescriptor(
  input: GuardedConfirmationDescriptorInput,
): GuardedConfirmationDescriptor | null {
  return normalizeGuardedConfirmationDescriptor(input);
}

export function isGuardedConfirmationDescriptor(
  value: unknown,
): value is GuardedConfirmationDescriptor {
  return normalizeGuardedConfirmationDescriptor(value) !== null;
}

export function normalizeActionConfirmationDescriptor(
  value: unknown,
): ActionConfirmationDescriptor | null {
  const record = ownDataRecord(value);
  if (
    record === null ||
    !hasExactFields(record, ["kind", "title", "body", "confirmLabel", "cancelLabel"])
  ) {
    return null;
  }

  const confirmation = {
    title: record.title,
    body: record.body,
    confirmLabel: record.confirmLabel,
    cancelLabel: record.cancelLabel,
  };
  if (record.kind === "destructive") {
    const normalized = normalizeConfirmationDescriptor(confirmation);
    return normalized === null
      ? null
      : Object.freeze({ kind: "destructive", ...normalized });
  }
  if (record.kind === "guarded") {
    const normalized = normalizeGuardedConfirmationDescriptor(confirmation);
    return normalized === null
      ? null
      : Object.freeze({ kind: "guarded", ...normalized });
  }
  return null;
}

export function createActionConfirmationDescriptor(
  input: ActionConfirmationDescriptorInput,
): ActionConfirmationDescriptor | null {
  return normalizeActionConfirmationDescriptor(input);
}

export function isActionConfirmationDescriptor(
  value: unknown,
): value is ActionConfirmationDescriptor {
  return normalizeActionConfirmationDescriptor(value) !== null;
}
