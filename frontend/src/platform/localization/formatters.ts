const FORMATTER_CACHE_MAX = 48;
const FORMATTER_OPTION_MAX = 32;
const FORMATTER_OPTION_STRING_MAX_CHARS = 128;
// This comfortably covers complex BCP 47 tags while placing a hard bound on cache keys.
const FORMATTER_LOCALE_MAX_CHARS = 256;
const LIST_ITEM_MAX = 100;
const LIST_ITEM_MAX_CHARS = 4096;

class BoundedFormatterCache<Value> {
  readonly #entries = new Map<string, Value>();

  get(key: string, create: () => Value): Value {
    const cached = this.#entries.get(key);
    if (cached !== undefined) {
      this.#entries.delete(key);
      this.#entries.set(key, cached);
      return cached;
    }

    const value = create();
    if (this.#entries.size >= FORMATTER_CACHE_MAX) {
      const oldest = this.#entries.keys().next().value;
      if (oldest !== undefined) this.#entries.delete(oldest);
    }
    this.#entries.set(key, value);
    return value;
  }
}

const numberFormatters = new BoundedFormatterCache<Intl.NumberFormat>();
const dateFormatters = new BoundedFormatterCache<Intl.DateTimeFormat>();
const relativeTimeFormatters = new BoundedFormatterCache<Intl.RelativeTimeFormat>();
const listFormatters = new BoundedFormatterCache<Intl.ListFormat>();

type IntlOptionValue = string | number | boolean;
type SafeOptions = Readonly<Record<string, IntlOptionValue>>;

const NUMBER_OPTION_NAMES = new Set([
  "compactDisplay",
  "currency",
  "currencyDisplay",
  "currencySign",
  "localeMatcher",
  "maximumFractionDigits",
  "maximumSignificantDigits",
  "minimumFractionDigits",
  "minimumIntegerDigits",
  "minimumSignificantDigits",
  "notation",
  "numberingSystem",
  "roundingIncrement",
  "roundingMode",
  "roundingPriority",
  "signDisplay",
  "style",
  "trailingZeroDisplay",
  "unit",
  "unitDisplay",
  "useGrouping",
] as const);

const DATE_OPTION_NAMES = new Set([
  "calendar",
  "dateStyle",
  "day",
  "dayPeriod",
  "era",
  "formatMatcher",
  "fractionalSecondDigits",
  "hour",
  "hour12",
  "hourCycle",
  "localeMatcher",
  "minute",
  "month",
  "numberingSystem",
  "second",
  "timeStyle",
  "timeZone",
  "timeZoneName",
  "weekday",
  "year",
] as const);

const RELATIVE_TIME_OPTION_NAMES = new Set([
  "localeMatcher",
  "numeric",
  "style",
] as const);

const LIST_OPTION_NAMES = new Set(["localeMatcher", "style", "type"] as const);
const DURATION_OPTION_NAMES = new Set(["maxUnits", "style"] as const);
const BYTE_OPTION_NAMES = new Set(
  [...NUMBER_OPTION_NAMES, "unitDisplay"].filter(
    (name) => name !== "style" && name !== "unit",
  ),
);

function canonicalLocale(locale: unknown): string | null {
  if (
    typeof locale !== "string" ||
    locale.length > FORMATTER_LOCALE_MAX_CHARS ||
    locale.trim().length === 0
  ) {
    return null;
  }
  try {
    const locales = Intl.getCanonicalLocales(locale);
    const canonical = locales.length === 1 ? locales[0] : undefined;
    return canonical !== undefined && canonical.length <= FORMATTER_LOCALE_MAX_CHARS
      ? canonical
      : null;
  } catch {
    return null;
  }
}

function safeOptions(
  value: unknown,
  allowedNames: ReadonlySet<string>,
): SafeOptions | null {
  try {
    if (value === undefined) return Object.freeze({});
    if (value === null || typeof value !== "object" || Array.isArray(value))
      return null;

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;

    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (
      keys.length > FORMATTER_OPTION_MAX ||
      keys.some((key) => typeof key !== "string" || !allowedNames.has(key))
    ) {
      return null;
    }
    const names = keys as string[];

    const normalized: Record<string, IntlOptionValue> = Object.create(null) as Record<
      string,
      IntlOptionValue
    >;
    for (const name of names.sort()) {
      const descriptor = descriptors[name];
      if (descriptor === undefined || !("value" in descriptor)) return null;
      const option = descriptor.value as unknown;
      if (
        (typeof option !== "string" &&
          typeof option !== "number" &&
          typeof option !== "boolean") ||
        (typeof option === "string" &&
          option.length > FORMATTER_OPTION_STRING_MAX_CHARS) ||
        (typeof option === "number" && !Number.isFinite(option))
      ) {
        return null;
      }
      normalized[name] = option;
    }
    return Object.freeze(normalized);
  } catch {
    return null;
  }
}

function formatterKey(locale: string, options: SafeOptions): string {
  return `${locale}\u0000${JSON.stringify(Object.entries(options))}`;
}

function numberFormatter(locale: unknown, options: unknown): Intl.NumberFormat | null {
  const normalizedLocale = canonicalLocale(locale);
  const normalizedOptions = safeOptions(options, NUMBER_OPTION_NAMES);
  if (normalizedLocale === null || normalizedOptions === null) return null;

  try {
    return numberFormatters.get(
      formatterKey(normalizedLocale, normalizedOptions),
      () =>
        new Intl.NumberFormat(
          normalizedLocale,
          normalizedOptions as Intl.NumberFormatOptions,
        ),
    );
  } catch {
    return null;
  }
}

function listFormatter(locale: unknown, options: unknown): Intl.ListFormat | null {
  const normalizedLocale = canonicalLocale(locale);
  const normalizedOptions = safeOptions(options, LIST_OPTION_NAMES);
  if (normalizedLocale === null || normalizedOptions === null) return null;

  try {
    return listFormatters.get(
      formatterKey(normalizedLocale, normalizedOptions),
      () =>
        new Intl.ListFormat(
          normalizedLocale,
          normalizedOptions as Intl.ListFormatOptions,
        ),
    );
  } catch {
    return null;
  }
}

export function formatNumber(
  locale: string,
  value: number,
  options: Intl.NumberFormatOptions = {},
): string | null {
  try {
    if (!Number.isFinite(value)) return null;
    const formatter = numberFormatter(locale, options);
    if (formatter === null) return null;
    return formatter.format(value);
  } catch {
    return null;
  }
}

export function formatDate(
  locale: string,
  value: Date | number,
  options: Intl.DateTimeFormatOptions = {},
): string | null {
  let timestamp: number;
  try {
    timestamp = value instanceof Date ? value.getTime() : value;
  } catch {
    return null;
  }
  if (!Number.isFinite(timestamp)) return null;

  const normalizedLocale = canonicalLocale(locale);
  const normalizedOptions = safeOptions(options, DATE_OPTION_NAMES);
  if (normalizedLocale === null || normalizedOptions === null) return null;

  try {
    const formatter = dateFormatters.get(
      formatterKey(normalizedLocale, normalizedOptions),
      () =>
        new Intl.DateTimeFormat(
          normalizedLocale,
          normalizedOptions as Intl.DateTimeFormatOptions,
        ),
    );
    return formatter.format(new Date(timestamp));
  } catch {
    return null;
  }
}

export type RelativeTimeUnit =
  | "year"
  | "quarter"
  | "month"
  | "week"
  | "day"
  | "hour"
  | "minute"
  | "second";

const RELATIVE_TIME_UNITS = new Set<RelativeTimeUnit>([
  "year",
  "quarter",
  "month",
  "week",
  "day",
  "hour",
  "minute",
  "second",
]);

export function formatRelativeTime(
  locale: string,
  value: number,
  unit: RelativeTimeUnit,
  options: Intl.RelativeTimeFormatOptions = {},
): string | null {
  if (!Number.isFinite(value) || !RELATIVE_TIME_UNITS.has(unit)) return null;
  const normalizedLocale = canonicalLocale(locale);
  const normalizedOptions = safeOptions(options, RELATIVE_TIME_OPTION_NAMES);
  if (normalizedLocale === null || normalizedOptions === null) return null;

  try {
    const formatter = relativeTimeFormatters.get(
      formatterKey(normalizedLocale, normalizedOptions),
      () =>
        new Intl.RelativeTimeFormat(
          normalizedLocale,
          normalizedOptions as Intl.RelativeTimeFormatOptions,
        ),
    );
    return formatter.format(value, unit);
  } catch {
    return null;
  }
}

export function formatList(
  locale: string,
  values: readonly string[],
  options: Intl.ListFormatOptions = {},
): string | null {
  try {
    if (
      !Array.isArray(values) ||
      values.length === 0 ||
      values.length > LIST_ITEM_MAX ||
      values.some(
        (value) =>
          typeof value !== "string" ||
          value.length === 0 ||
          value.length > LIST_ITEM_MAX_CHARS,
      )
    ) {
      return null;
    }

    const formatter = listFormatter(locale, options);
    if (formatter === null) return null;
    return formatter.format(values);
  } catch {
    return null;
  }
}

export type PercentageFormatOptions = Omit<Intl.NumberFormatOptions, "style">;

/** Format a ratio, where 1 represents 100 percent. */
export function formatPercentage(
  locale: string,
  ratio: number,
  options: PercentageFormatOptions = {},
): string | null {
  if (!Number.isFinite(ratio)) return null;
  const normalizedOptions = safeOptions(options, NUMBER_OPTION_NAMES);
  if (normalizedOptions === null || "style" in normalizedOptions) return null;
  return formatNumber(locale, ratio, { ...normalizedOptions, style: "percent" });
}

const DURATION_UNITS = [
  { milliseconds: 86_400_000, unit: "day" },
  { milliseconds: 3_600_000, unit: "hour" },
  { milliseconds: 60_000, unit: "minute" },
  { milliseconds: 1_000, unit: "second" },
  { milliseconds: 1, unit: "millisecond" },
] as const satisfies readonly {
  milliseconds: number;
  unit: Intl.NumberFormatOptions["unit"];
}[];

export interface DurationFormatOptions {
  readonly maxUnits?: 1 | 2 | 3 | 4 | 5;
  readonly style?: "long" | "short" | "narrow";
}

/** Format a non-negative duration expressed in milliseconds. */
export function formatDuration(
  locale: string,
  durationMilliseconds: number,
  options: DurationFormatOptions = {},
): string | null {
  if (!Number.isFinite(durationMilliseconds) || durationMilliseconds < 0) return null;
  const normalizedOptions = safeOptions(options, DURATION_OPTION_NAMES);
  if (normalizedOptions === null) return null;
  if (
    Object.keys(normalizedOptions).some((key) => key !== "maxUnits" && key !== "style")
  ) {
    return null;
  }
  const maxUnits = normalizedOptions.maxUnits ?? 2;
  const style = normalizedOptions.style ?? "short";
  if (
    typeof maxUnits !== "number" ||
    !Number.isInteger(maxUnits) ||
    maxUnits < 1 ||
    maxUnits > 5
  ) {
    return null;
  }
  if (style !== "long" && style !== "short" && style !== "narrow") return null;

  let remaining = Math.round(durationMilliseconds);
  const parts: string[] = [];
  for (const definition of DURATION_UNITS) {
    const amount = Math.floor(remaining / definition.milliseconds);
    if (amount === 0) continue;

    const formatted = formatNumber(locale, amount, {
      maximumFractionDigits: 0,
      style: "unit",
      unit: definition.unit,
      unitDisplay: style,
    });
    if (formatted === null) return null;
    parts.push(formatted);
    remaining -= amount * definition.milliseconds;
    if (parts.length >= maxUnits) break;
  }

  if (parts.length === 0) {
    const zero = formatNumber(locale, 0, {
      maximumFractionDigits: 0,
      style: "unit",
      unit: "second",
      unitDisplay: style,
    });
    if (zero === null) return null;
    parts.push(zero);
  }

  const formatter = listFormatter(locale, { style, type: "unit" });
  if (formatter === null) return null;
  try {
    return formatter.format(parts);
  } catch {
    return null;
  }
}

const BYTE_UNITS = [
  "byte",
  "kilobyte",
  "megabyte",
  "gigabyte",
  "terabyte",
  "petabyte",
] as const satisfies readonly NonNullable<Intl.NumberFormatOptions["unit"]>[];

export type ByteFormatOptions = Omit<
  Intl.NumberFormatOptions,
  "style" | "unit" | "unitDisplay"
> & {
  readonly unitDisplay?: "long" | "short" | "narrow";
};

/** Format a non-negative byte count using a bounded base-1024 scale. */
export function formatBytes(
  locale: string,
  bytes: number,
  options: ByteFormatOptions = {},
): string | null {
  if (!Number.isFinite(bytes) || bytes < 0) return null;

  const normalizedOptions = safeOptions(options, BYTE_OPTION_NAMES);
  if (normalizedOptions === null) return null;
  const unitDisplay = normalizedOptions.unitDisplay ?? "short";
  if (unitDisplay !== "long" && unitDisplay !== "short" && unitDisplay !== "narrow") {
    return null;
  }
  const { unitDisplay: _unitDisplay, ...numberOptions } = normalizedOptions;

  let scaled = bytes;
  let unitIndex = 0;
  while (scaled >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    scaled /= 1024;
    unitIndex += 1;
  }

  return formatNumber(locale, scaled, {
    maximumFractionDigits: unitIndex === 0 ? 0 : 1,
    ...numberOptions,
    style: "unit",
    unit: BYTE_UNITS[unitIndex],
    unitDisplay,
  });
}
