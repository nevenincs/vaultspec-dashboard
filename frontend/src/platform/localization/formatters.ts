const FORMATTER_CACHE_MAX = 48;
const FORMATTER_OPTION_MAX = 32;
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

function canonicalLocale(locale: unknown): string | null {
  if (typeof locale !== "string" || locale.trim().length === 0) return null;
  try {
    const locales = Intl.getCanonicalLocales(locale);
    return locales.length === 1 ? locales[0] : null;
  } catch {
    return null;
  }
}

function safeOptions(value: unknown): SafeOptions | null {
  if (value === undefined) return Object.freeze({});
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length > FORMATTER_OPTION_MAX ||
    keys.some((key) => typeof key !== "string")
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
      (typeof option === "number" && !Number.isFinite(option))
    ) {
      return null;
    }
    normalized[name] = option;
  }
  return Object.freeze(normalized);
}

function formatterKey(locale: string, options: SafeOptions): string {
  return `${locale}\u0000${JSON.stringify(Object.entries(options))}`;
}

function numberFormatter(locale: unknown, options: unknown): Intl.NumberFormat | null {
  const normalizedLocale = canonicalLocale(locale);
  const normalizedOptions = safeOptions(options);
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
  const normalizedOptions = safeOptions(options);
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
  if (!Number.isFinite(value)) return null;
  const formatter = numberFormatter(locale, options);
  if (formatter === null) return null;
  try {
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
  const normalizedOptions = safeOptions(options);
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

const RELATIVE_TIME_UNITS = new Set<Intl.RelativeTimeFormatUnit>([
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
  unit: Intl.RelativeTimeFormatUnit,
  options: Intl.RelativeTimeFormatOptions = {},
): string | null {
  if (!Number.isFinite(value) || !RELATIVE_TIME_UNITS.has(unit)) return null;
  const normalizedLocale = canonicalLocale(locale);
  const normalizedOptions = safeOptions(options);
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
  try {
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
  const normalizedOptions = safeOptions(options);
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
  const normalizedOptions = safeOptions(options);
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

  const normalizedOptions = safeOptions(options);
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
