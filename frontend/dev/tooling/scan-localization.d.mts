// Types for the localization scanner's public surface.
//
// The scanner itself is plain `.mjs` — it runs under bare `node` as a lint gate, with
// no build step, and that is deliberate. Its TEST is TypeScript, so without these
// declarations every destructured finding lands as `any` and the test silently loses
// the type safety it exists to provide.
//
// Only the exported surface is described here; the scanner's internals stay untyped.

/** A single scanner finding. `code` is one of FINDING_CODES' values. */
export interface LocalizationFinding {
  /** Stable id: sha256 over (code, path, context, text, occurrence), truncated. */
  readonly id: string;
  /** The finding kind — a value of `FINDING_CODES`. */
  readonly code: string;
  /** Repo-relative POSIX path of the offending file. */
  readonly path: string;
  readonly line: number;
  readonly column: number;
  /** Bounded excerpt of the offending source. */
  readonly snippet: string;
}

/** The finding-kind vocabulary, keyed by camelCase name. */
export declare const FINDING_CODES: Readonly<Record<string, string>>;

/** Scanner resource ceilings (file count, byte size, finding cap, …). */
export declare const LIMITS: Readonly<Record<string, number>>;

/** Scan an explicit list of absolute file paths. */
export declare function scanFiles(files: readonly string[]): LocalizationFinding[];

/** Scan every production source under `src/`, applying the standard exclusions. */
export declare function scanProductionSources(): LocalizationFinding[];
