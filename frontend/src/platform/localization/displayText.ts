const COLLATOR_CACHE_LIMIT = 24;
const LOCALE_MAX_CHARS = 256;

declare const stableIdentifierBrand: unique symbol;
declare const repositoryPathBrand: unique symbol;
declare const authoredDisplayTextBrand: unique symbol;

export type StableIdentifier = string & {
  readonly [stableIdentifierBrand]: "stable-identifier";
};
export type RepositoryPath = string & {
  readonly [repositoryPathBrand]: "repository-path";
};
export type AuthoredDisplayText = string & {
  readonly [authoredDisplayTextBrand]: "authored-display-text";
};

const authoredCollators = new Map<string, Intl.Collator>();

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalLocale(locale: unknown): string | null {
  if (
    typeof locale !== "string" ||
    locale.length === 0 ||
    locale.length > LOCALE_MAX_CHARS
  ) {
    return null;
  }
  try {
    const canonical = Intl.getCanonicalLocales(locale);
    return canonical.length === 1 ? (canonical[0] ?? null) : null;
  } catch {
    return null;
  }
}

function authoredCollator(locale: unknown): Intl.Collator | null {
  const canonical = canonicalLocale(locale);
  if (canonical === null) return null;
  const cached = authoredCollators.get(canonical);
  if (cached !== undefined) {
    authoredCollators.delete(canonical);
    authoredCollators.set(canonical, cached);
    return cached;
  }
  try {
    const collator = new Intl.Collator(canonical, { usage: "sort" });
    if (authoredCollators.size >= COLLATOR_CACHE_LIMIT) {
      const oldest = authoredCollators.keys().next().value;
      if (oldest !== undefined) authoredCollators.delete(oldest);
    }
    authoredCollators.set(canonical, collator);
    return collator;
  } catch {
    return null;
  }
}

/** Brand stable internal identity without changing a byte. */
export function stableIdentifier(value: string): StableIdentifier {
  return value as StableIdentifier;
}

/** Brand a repository-relative or absolute path without normalization. */
export function repositoryPath(value: string): RepositoryPath {
  return value as RepositoryPath;
}

/** Brand user-authored display data without trimming or case conversion. */
export function authoredDisplayText(value: string): AuthoredDisplayText {
  return value as AuthoredDisplayText;
}

/** Deterministic code-unit order for stable internal identity. */
export function compareStableIdentifiers(
  left: StableIdentifier,
  right: StableIdentifier,
): number {
  return compareCodeUnits(left, right);
}

/** Deterministic code-unit order for repository paths. */
export function compareRepositoryPaths(
  left: RepositoryPath,
  right: RepositoryPath,
): number {
  return compareCodeUnits(left, right);
}

/** Active-locale CLDR order for authored display text; bytes remain untouched. */
export function compareAuthoredDisplayText(
  locale: unknown,
  left: AuthoredDisplayText,
  right: AuthoredDisplayText,
): number {
  return (
    authoredCollator(locale)?.compare(left, right) ?? compareCodeUnits(left, right)
  );
}
