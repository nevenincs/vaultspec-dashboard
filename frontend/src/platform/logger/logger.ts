// The platform logger (ADR D3): the one observability spine the whole
// frontend logs through. Leveled and namespaced (mirroring the engine's
// tracing vocabulary so frontend logs and the engine's /logs read as one
// system), with a bounded ring buffer feeding the dev overlay and future
// correlation, and a pluggable sink array. This module is substrate: it
// imports nothing from `app/`, `scene/`, or the stores (ADR D1).

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

export const LEVEL_RANK: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

/** A serialized error — never the live Error, so records stay structured. */
export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
}

/** One structured log record. `ts` is epoch ms; `namespace` is dot-joined. */
export interface LogRecord {
  ts: number;
  level: LogLevel;
  namespace: string;
  message: string;
  fields?: Record<string, unknown>;
  error?: SerializedError;
}

/** A log destination. A sink must never throw back into the logger. */
export interface LogSink {
  write(record: LogRecord): void;
}

export function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { name: "NonError", message: String(error) };
}

/**
 * A bounded FIFO of recent records. The default sink on every logger: it is
 * what the dev overlay renders and what the failure policy can correlate
 * against. Oldest records evict when the cap is exceeded.
 */
export class RingBufferSink implements LogSink {
  private records: LogRecord[] = [];

  constructor(readonly capacity = 500) {}

  write(record: LogRecord): void {
    this.records.push(record);
    const overflow = this.records.length - this.capacity;
    if (overflow > 0) this.records.splice(0, overflow);
  }

  /** A copy of the buffer, oldest first. */
  snapshot(): LogRecord[] {
    return this.records.slice();
  }

  get size(): number {
    return this.records.length;
  }

  clear(): void {
    this.records = [];
  }
}

/** Forwards records to the browser console, mapped to the matching method. */
export class ConsoleSink implements LogSink {
  write(record: LogRecord): void {
    const tag = record.namespace ? `[${record.namespace}]` : "[platform]";
    const extra: unknown[] = [];
    if (record.fields) extra.push(record.fields);
    if (record.error) extra.push(record.error);
    // The sink is the single sanctioned console boundary (lint allows it);
    // every other module logs through the Logger, never console directly.
    switch (record.level) {
      case "error":
        console.error(tag, record.message, ...extra);
        break;
      case "warn":
        console.warn(tag, record.message, ...extra);
        break;
      case "info":
        console.info(tag, record.message, ...extra);
        break;
      default:
        console.debug(tag, record.message, ...extra);
    }
  }
}

/** The mutable state shared by a root logger and all its children. */
interface LoggerCore {
  minRank: number;
  sinks: LogSink[];
}

/**
 * A namespaced, leveled logger. `child(ns)` returns a logger sharing the
 * root's sink registry and min-level, so configuring the root configures
 * every namespace at once.
 */
export class Logger {
  constructor(
    private readonly core: LoggerCore,
    readonly namespace: string,
  ) {}

  child(namespace: string): Logger {
    const joined = this.namespace ? `${this.namespace}.${namespace}` : namespace;
    return new Logger(this.core, joined);
  }

  setMinLevel(level: LogLevel): void {
    this.core.minRank = LEVEL_RANK[level];
  }

  addSink(sink: LogSink): void {
    this.core.sinks.push(sink);
  }

  removeSink(sink: LogSink): void {
    const index = this.core.sinks.indexOf(sink);
    if (index >= 0) this.core.sinks.splice(index, 1);
  }

  trace(message: string, fields?: Record<string, unknown>): void {
    this.emit("trace", message, fields);
  }

  debug(message: string, fields?: Record<string, unknown>): void {
    this.emit("debug", message, fields);
  }

  info(message: string, fields?: Record<string, unknown>): void {
    this.emit("info", message, fields);
  }

  warn(message: string, fields?: Record<string, unknown>): void {
    this.emit("warn", message, fields);
  }

  /** Error accepts a thrown value or structured fields, never both. */
  error(message: string, errorOrFields?: unknown): void {
    if (errorOrFields instanceof Error) {
      this.emit("error", message, undefined, errorOrFields);
    } else {
      this.emit("error", message, errorOrFields as Record<string, unknown>);
    }
  }

  /**
   * Re-emit a record produced elsewhere (the worker bridge ingests records
   * the FA2 worker posts across the thread boundary). The record's own
   * namespace and level are preserved; only the min-level gate applies.
   */
  ingest(record: LogRecord): void {
    if (LEVEL_RANK[record.level] < this.core.minRank) return;
    this.dispatch(record);
  }

  private emit(
    level: LogLevel,
    message: string,
    fields?: Record<string, unknown>,
    error?: unknown,
  ): void {
    if (LEVEL_RANK[level] < this.core.minRank) return;
    const record: LogRecord = {
      ts: Date.now(),
      level,
      namespace: this.namespace,
      message,
    };
    if (fields && Object.keys(fields).length > 0) record.fields = fields;
    if (error !== undefined) record.error = serializeError(error);
    this.dispatch(record);
  }

  private dispatch(record: LogRecord): void {
    for (const sink of this.core.sinks) {
      // A failing sink must never break logging or starve other sinks.
      try {
        sink.write(record);
      } catch {
        /* swallow: a broken sink is not the caller's problem */
      }
    }
  }
}

export interface CreateLoggerOptions {
  namespace?: string;
  minLevel?: LogLevel;
  sinks?: LogSink[];
}

/**
 * Build an isolated logger with its own core (sink registry + min-level).
 * The root `logger` below is the app-wide instance; this factory is for
 * tests and for any consumer that wants a private logging surface.
 */
export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const core: LoggerCore = {
    minRank: LEVEL_RANK[options.minLevel ?? "trace"],
    sinks: options.sinks ? [...options.sinks] : [],
  };
  return new Logger(core, options.namespace ?? "");
}

const devMode = Boolean(import.meta.env?.DEV);

/** The always-on ring buffer behind the root logger; read by the dev overlay. */
export const ringBuffer = new RingBufferSink(500);

const rootCore: LoggerCore = {
  minRank: devMode ? LEVEL_RANK.debug : LEVEL_RANK.info,
  sinks: devMode ? [ringBuffer, new ConsoleSink()] : [ringBuffer],
};

/** The app-wide root logger. Every module logs through `logger.child(ns)`. */
export const logger = new Logger(rootCore, "");
