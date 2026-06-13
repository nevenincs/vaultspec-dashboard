// Dispatch seam (ADR D2): a thin typed action pipeline - NOT a state
// container. Zustand stays the store; this is the single place a user intent
// can be logged, traced, guarded, and (later) rolled back. It generalizes the
// two proto-commands - the scene's `command()` union and the right rail's
// arm-to-confirm ops - without importing or mutating either (the scene seam is
// locked). An action flows through a middleware chain (log -> trace -> guard)
// before a registered handler runs the effect.
//
// Substrate module (ADR D1): no imports from app/, scene/, or the stores.

export interface ActionMeta {
  [key: string]: unknown;
}

/** A typed user intent. `type` selects the handler; `payload` is its input. */
export interface Action<P = unknown> {
  type: string;
  payload?: P;
  meta?: ActionMeta;
}

/** The terminal effect for an action type. */
export type ActionHandler<P = unknown> = (action: Action<P>) => unknown;

/** The next link in the middleware chain. */
export type Next = (action: Action) => unknown;

/**
 * A middleware wraps the chain: it receives the action and `next`, and may
 * log, transform the action it forwards, short-circuit (skip `next` - the
 * arm-to-confirm guard does this), or catch what `next` throws.
 */
export type Middleware = (action: Action, next: Next) => unknown;

/** Thrown by the terminal step when no handler is registered for a type. */
export class UnknownActionError extends Error {
  readonly actionType: string;
  constructor(actionType: string) {
    super(`no handler registered for action "${actionType}"`);
    this.name = "UnknownActionError";
    this.actionType = actionType;
  }
}

export class Dispatcher {
  private readonly handlers = new Map<string, ActionHandler>();
  private readonly middleware: Middleware[] = [];

  /** Register the effect for an action type; returns a disposer. */
  register<P>(type: string, handler: ActionHandler<P>): () => void {
    const erased = handler as ActionHandler;
    this.handlers.set(type, erased);
    return () => {
      if (this.handlers.get(type) === erased) this.handlers.delete(type);
    };
  }

  /** Append a middleware. Order is install order: first installed runs first. */
  use(middleware: Middleware): void {
    this.middleware.push(middleware);
  }

  hasHandler(type: string): boolean {
    return this.handlers.has(type);
  }

  /** Run an action through the middleware chain into its handler. */
  dispatch(action: Action): unknown {
    const terminal: Next = (a) => {
      const handler = this.handlers.get(a.type);
      if (!handler) throw new UnknownActionError(a.type);
      return handler(a);
    };
    const chain = this.middleware.reduceRight<Next>(
      (next, middleware) => (a) => middleware(a, next),
      terminal,
    );
    return chain(action);
  }
}
